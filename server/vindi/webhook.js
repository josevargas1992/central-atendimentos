// Recebimento de webhooks da Vindi.
// Segurança (developers.vindi.com.br → Webhooks: segurança e testes): a Vindi não assina as
// notificações; a autenticação recomendada é usuário/senha na URL cadastrada
// (https://usuario:senha@dominio/api/vindi/webhook), que chega como cabeçalho Authorization: Basic.
// O webhook nunca é tratado como verdade: ele só dispara a consulta GET à API.
import { timingSafeEqual } from "node:crypto";
import { lerEvento, registrarEvento, processarEvento } from "./processar.js";

const iguais = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function credenciaisValidas(header, usuario, senha) {
  if (!header || !header.startsWith("Basic ")) return false;
  let dec;
  try { dec = Buffer.from(header.slice(6), "base64").toString("utf8"); } catch { return false; }
  const i = dec.indexOf(":");
  if (i < 0) return false;
  // compara as duas partes sempre (sem atalho), em tempo constante
  const okU = iguais(dec.slice(0, i), usuario), okS = iguais(dec.slice(i + 1), senha);
  return okU && okS;
}

const MAX_BYTES = 256 * 1024;

export function criarHandlerWebhook({ getDb, lerConfig, criarCliente, waitUntil }) {
  return async function handler(req, res) {
    const responder = (status, corpo) => { res.status(status).setHeader("Cache-Control", "no-store"); return res.json(corpo); };
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return responder(405, { erro: "Método não permitido." }); }

    const cfg = lerConfig();
    // Sem configuração: 503 faz a Vindi tentar de novo depois (até ~48h), em vez de perder o evento.
    if (!cfg.webhookConfigurado || !cfg.apiConfigurada) return responder(503, { erro: "Integração não configurada." });
    if (!credenciaisValidas(req.headers?.authorization, cfg.webhookUsuario, cfg.webhookSenha)) {
      res.setHeader("WWW-Authenticate", 'Basic realm="vindi-webhook"');
      return responder(401, { erro: "Não autorizado." });
    }

    let corpo = req.body;
    if (typeof corpo === "string") {
      if (corpo.length > MAX_BYTES) return responder(413, { erro: "Notificação muito grande." });
      try { corpo = JSON.parse(corpo); } catch { return responder(400, { erro: "JSON inválido." }); }
    }
    const { evento, erro } = lerEvento(corpo);
    if (erro) return responder(400, { erro });

    let db, reg;
    try {
      db = getDb();
      reg = await registrarEvento(db, evento, cfg.ambiente);
    } catch (e) {
      console.error("webhook: falha ao registrar evento", e?.message);
      // Não confirmou o recebimento → a Vindi reenviará.
      return responder(500, { erro: "Falha ao registrar a notificação." });
    }
    if (reg.duplicado && reg.jaProcessado) return responder(200, { recebido: true, duplicado: true });

    // Evento salvo: confirma o recebimento já e processa em seguida (consulta à API pode demorar).
    const trabalho = (async () => {
      try { await processarEvento({ db, cliente: criarCliente(cfg), chave: reg.chave, ev: evento, ambiente: cfg.ambiente }); }
      catch (e) { console.error("webhook: falha ao processar", e?.message); }
    })();
    if (waitUntil) waitUntil(trabalho); else await trabalho;
    return responder(200, { recebido: true, processamento: "em andamento" });
  };
}
