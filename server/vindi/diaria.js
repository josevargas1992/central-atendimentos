// Sincronização diária automática (Vercel Cron, de madrugada).
// Pega o que o webhook não avisa: clientes importados depois da última sincronização, fatura que
// venceu sem pagamento, prorrogação, pagamento anterior ao webhook.
//
// • Autenticação: a Vercel envia "Authorization: Bearer <CRON_SECRET>" (variável de ambiente).
// • O plano gratuito limita a duração de cada função: cada rodada sincroniza por ~40 s e, se faltar
//   gente, dispara a rodada seguinte (no máximo MAX_RODADAS). Quem já foi tentado HOJE (dia de
//   Brasília) fica de fora — assim nenhuma rodada repete cliente e o laço sempre termina.
// • As mesmas regras do botão "Atualizar pela Vindi" (sincronizarRegistro), com origem "diaria".
import { timingSafeEqual } from "node:crypto";
import { sincronizarRegistro, COL_INAD, faturaDoLink } from "./processar.js";
import { dataSP } from "./apuracao.js";

export const MAX_RODADAS = 15;

const responder = (res, status, corpo) => { res.status(status).setHeader("Cache-Control", "no-store"); return res.json(corpo); };
const iguais = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function autorizado(header, segredo) {
  if (!segredo || segredo.length < 16 || !header?.startsWith("Bearer ")) return false;
  return iguais(header.slice(7), segredo);
}

// Quem entra na rodada: tem como chegar na Vindi, não foi tentado há pouco e não é um
// cancelamento já registrado (assinatura cancelada não muda mais).
export function candidatos(registros, agoraMs) {
  return registros
    .filter(r => r.vindi?.assinaturaId || r.vindi?.faturaAvulsaId || r.idFatura || faturaDoLink(r.vindiUrl))
    .filter(r => !(r.status === "Cancelado" && r.vindi?.cancelamento))
    .filter(r => { const hoje = dataSP(new Date(agoraMs).toISOString()); return !(r.vindi?.ultimaTentativa && dataSP(r.vindi.ultimaTentativa) === hoje); })
    .sort((a, b) => (a.vindi?.ultimaTentativa || "").localeCompare(b.vindi?.ultimaTentativa || ""));
}

export function criarHandlerDiaria({ getDb, lerConfig, criarCliente, lerSegredo = () => process.env.CRON_SECRET, fetchImpl = globalThis.fetch, waitUntil, orcamentoMs = 40_000, relogio = () => Date.now() }) {
  return async function handler(req, res) {
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return responder(res, 405, { erro: "Método não permitido." }); }
    const segredo = lerSegredo();
    if (!segredo) return responder(res, 503, { erro: "Sincronização diária não configurada (CRON_SECRET)." });
    if (!autorizado(req.headers?.authorization, segredo)) return responder(res, 401, { erro: "Não autorizado." });
    const cfg = lerConfig();
    if (!cfg.apiConfigurada) return responder(res, 503, { erro: "Integração Vindi não configurada." });

    const rodada = Math.max(1, Math.min(MAX_RODADAS, parseInt(new URL(req.url || "/", "http://x").searchParams.get("rodada") || "1", 10) || 1));
    const inicio = relogio();
    const db = getDb();
    const registros = (await db.collection(COL_INAD).get()).docs.map(d => ({ id: d.id, ...d.data() }));
    const fila = candidatos(registros, inicio);
    const cliente = criarCliente(cfg);
    const resumo = { rodada, naFila: fila.length, processados: 0, mudancas: [], erros: 0 };

    for (const reg of fila) {
      if (relogio() - inicio > orcamentoMs) break;
      const r = await sincronizarRegistro({ db, cliente, registro: reg, origem: "diaria", ambiente: cfg.ambiente });
      resumo.processados++;
      if (r.novoStatus) resumo.mudancas.push({ id: reg.id, de: reg.status, para: r.novoStatus });
      if (r.resultado === "erro") resumo.erros++;
      // Falha geral da Vindi (fora do ar / limite): para a rodada em vez de marcar todos como erro.
      if (r.resultado === "erro" && ["indisponivel", "limite", "rede", "credenciais"].includes(r.codigo)) { resumo.interrompido = r.codigo; break; }
    }
    resumo.restantes = fila.length - resumo.processados;

    // Ainda falta gente e não houve falha geral: chama a próxima rodada (sem esperar por ela).
    if (resumo.restantes > 0 && !resumo.interrompido && rodada < MAX_RODADAS) {
      const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
      if (host) {
        // Só dispara: depois de ~3 s desiste de esperar a resposta (a próxima rodada segue sozinha;
        // esperar por ela faria esta função estourar o tempo máximo).
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const prox = fetchImpl(`https://${host}/api/vindi/diaria?rodada=${rodada + 1}`, { headers: { Authorization: `Bearer ${segredo}` }, signal: ctrl.signal })
          .catch(e => { if (e?.name !== "AbortError") console.error("diaria: falha ao chamar a próxima rodada", e?.message); })
          .finally(() => clearTimeout(timer));
        if (waitUntil) waitUntil(prox);
        resumo.proximaRodada = rodada + 1;
      }
    }
    console.log("diaria:", JSON.stringify(resumo));
    return responder(res, 200, resumo);
  };
}
