// Endpoints de uso interno do app (botão "Atualizar pela Vindi" e painel do Admin).
// O app ainda não tem login de verdade (Firebase Auth), então estes endpoints se protegem com:
// trava por registro (sem sincronizações simultâneas/duplicadas) e limite de chamadas por minuto.
// Eles só LEEM a Vindi e gravam o que a própria Vindi informar — nunca expõem a chave.
import { configuracaoPublica } from "./config.js";
import { sincronizarRegistro, processarEvento, COL_INAD, COL_EVENTOS } from "./processar.js";
import { ErroVindi } from "./cliente.js";

const COL_TRAVAS = "vindi_travas";
const TRAVA_MS = 60_000;       // uma sincronização por registro por vez (expira em 1 min)
const INTERVALO_MS = 15_000;   // e no máximo uma a cada 15 s por registro

const responder = (res, status, corpo) => { res.status(status).setHeader("Cache-Control", "no-store"); return res.json(corpo); };
const corpoJson = req => { if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } } return req.body || {}; };

// Limite global por minuto (janela fixa) — protege a cota de 120 req/min da Vindi.
async function dentroDoLimite(db, nome, maxPorMinuto, agora = Date.now()) {
  const janela = Math.floor(agora / 60_000);
  const ref = db.collection(COL_TRAVAS).doc(`limite-${nome}`);
  return db.runTransaction(async tx => {
    const s = await tx.get(ref);
    const d = s.exists ? s.data() : {};
    const n = d.janela === janela ? d.n : 0;
    if (n >= maxPorMinuto) return false;
    tx.set(ref, { janela, n: n + 1 });
    return true;
  });
}

// Trava por registro. Devolve true se conseguiu travar.
async function travar(db, inadId, agora = Date.now()) {
  const ref = db.collection(COL_TRAVAS).doc(`inad-${inadId}`);
  return db.runTransaction(async tx => {
    const s = await tx.get(ref);
    const d = s.exists ? s.data() : {};
    if (d.ate && d.ate > agora) return false;
    if (d.ultima && agora - d.ultima < INTERVALO_MS) return false;
    tx.set(ref, { ate: agora + TRAVA_MS, ultima: agora });
    return true;
  });
}
const destravar = (db, inadId) => db.collection(COL_TRAVAS).doc(`inad-${inadId}`).set({ ate: 0 }, { merge: true });

export function criarHandlerSincronizar({ getDb, lerConfig, criarCliente }) {
  return async function handler(req, res) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return responder(res, 405, { erro: "Método não permitido." }); }
    const cfg = lerConfig();
    if (!cfg.apiConfigurada) return responder(res, 503, { erro: "A integração com a Vindi ainda não foi configurada pelo administrador." });
    const inadId = String(corpoJson(req)?.inadId || "");
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(inadId)) return responder(res, 400, { erro: "Registro inválido." });

    const db = getDb();
    if (!(await dentroDoLimite(db, "sincronizar", 40))) return responder(res, 429, { erro: "Muitas atualizações em sequência. Aguarde um minuto." });
    if (!(await travar(db, inadId))) return responder(res, 409, { erro: "Este registro acabou de ser atualizado ou está sendo atualizado. Aguarde alguns segundos." });
    try {
      const snap = await db.collection(COL_INAD).doc(inadId).get();
      if (!snap.exists) return responder(res, 404, { erro: "Registro não encontrado." });
      const r = await sincronizarRegistro({ db, cliente: criarCliente(cfg), registro: { id: snap.id, ...snap.data() }, origem: "manual", ambiente: cfg.ambiente });
      const mensagens = {
        ok: r.novoStatus ? `Atualizado pela Vindi. Status alterado para ${r.novoStatus}.` : "Atualizado pela Vindi.",
        teste: "Consulta feita no ambiente de TESTE (sandbox): o registro não é alterado — veja o histórico no Admin.",
        sem_identificador: r.mensagem,
        ignorado_antigo: "A Vindi devolveu dados mais antigos do que os já registrados; nada foi alterado.",
        erro: `Não foi possível atualizar: ${r.mensagem} Os dados anteriores foram mantidos.`,
      };
      const status = r.resultado === "erro" ? 502 : r.resultado === "sem_identificador" ? 422 : 200;
      return responder(res, status, { resultado: r.resultado, mensagem: mensagens[r.resultado] || "Concluído." });
    } finally {
      await destravar(db, inadId).catch(() => {});
    }
  };
}

// GET → situação da integração (sem segredos). POST { acao: "testar" | "reprocessar" }.
export function criarHandlerStatus({ getDb, lerConfig, criarCliente }) {
  return async function handler(req, res) {
    const cfg = lerConfig();
    const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "";
    const base = { ...configuracaoPublica(cfg), webhookUrl: host ? `https://USUARIO:SENHA@${host}/api/vindi/webhook` : null };
    if (req.method === "GET") return responder(res, 200, base);
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return responder(res, 405, { erro: "Método não permitido." }); }

    const acao = corpoJson(req)?.acao;
    if (!cfg.apiConfigurada) return responder(res, 503, { ...base, erro: "Integração não configurada (defina VINDI_AMBIENTE e VINDI_API_KEY na Vercel)." });
    const db = getDb();
    if (!(await dentroDoLimite(db, "admin", 10))) return responder(res, 429, { erro: "Muitas solicitações. Aguarde um minuto." });

    if (acao === "testar") {
      try { await criarCliente(cfg).testarConexao(); return responder(res, 200, { ...base, conexao: "ok", mensagem: `Conexão com a Vindi (${cfg.ambiente === "producao" ? "produção" : "teste/sandbox"}) funcionando.` }); }
      catch (e) { return responder(res, 200, { ...base, conexao: "erro", mensagem: e instanceof ErroVindi ? e.message : "Falha ao testar a conexão." }); }
    }
    if (acao === "reprocessar") {
      // Reprocessa eventos que ficaram pendentes ou com erro (até 15 por vez).
      const pend = (await db.collection(COL_EVENTOS).where("status", "in", ["pendente", "erro"]).limit(15).get()).docs;
      const cliente = criarCliente(cfg);
      let ok = 0, falhas = 0;
      for (const d of pend) {
        const ev = d.data();
        const r = await processarEvento({ db, cliente, chave: d.id, ev, ambiente: cfg.ambiente });
        r.resultado === "erro" ? falhas++ : ok++;
      }
      return responder(res, 200, { ...base, mensagem: pend.length ? `${ok} evento(s) reprocessado(s), ${falhas} com erro.` : "Nenhum evento pendente." });
    }
    return responder(res, 400, { erro: "Ação inválida." });
  };
}
