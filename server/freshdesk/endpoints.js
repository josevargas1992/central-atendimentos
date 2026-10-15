// GET /api/freshdesk/status — teste de conexão com o Freshdesk, SOMENTE para administrador autenticado.
// Resposta: { conectado: true } ou { conectado: false, erro } — nada sobre o agente nem sobre a chave.
// Não lê nem grava no Firestore.
import { verificarAdmin } from "../authAdmin.js";
import { testarConexaoFreshdesk } from "./cliente.js";

const responder = (res, status, corpo) => { res.status(status).setHeader("Cache-Control", "no-store"); return res.json(corpo); };

// Limite simples por instância (o login de admin já barra estranhos; isto evita cliques em sequência).
function limitador(maxPorMinuto) {
  let janela = 0, n = 0;
  return () => { const j = Math.floor(Date.now() / 60000); if (j !== janela) { janela = j; n = 0; } return ++n <= maxPorMinuto; };
}

export function criarHandlerFreshdeskStatus({ lerConfig, verificarToken, lerAdmins, fetchImpl }) {
  const dentroDoLimite = limitador(10);
  return async function handler(req, res) {
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return responder(res, 405, { erro: "Método não permitido." }); }
    // 1º a autorização: sem admin válido, nada mais é feito (nem a configuração é revelada).
    const a = await verificarAdmin(req, { verificarToken, adminUids: lerAdmins() });
    if (!a.ok) return responder(res, a.status, { erro: a.erro });
    if (!dentroDoLimite()) return responder(res, 429, { erro: "Muitos testes em sequência. Aguarde um minuto." });

    const cfg = lerConfig();
    if (!cfg.configurado)
      return responder(res, 503, { conectado: false, erro: cfg.dominioInvalido ? "FRESHDESK_DOMINIO inválido na Vercel." : "Integração com o Freshdesk ainda não configurada na Vercel." });
    const r = await testarConexaoFreshdesk({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, fetchImpl });
    return responder(res, 200, r.ok ? { conectado: true } : { conectado: false, erro: r.mensagem });
  };
}
