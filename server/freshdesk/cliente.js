// Freshdesk — somente o TESTE DE CONEXÃO nesta etapa (nenhum ticket, e-mail ou alteração).
// Documentação: developers.freshdesk.com/api → Authentication: Basic com a API Key como usuário e
// qualquer texto como senha ("X"). Endpoint usado: GET /api/v2/agents/me (agente da chave).
// A chave vem só das variáveis de ambiente da Vercel e nunca aparece em mensagens ou logs.

// FRESHDESK_DOMINIO aceita "logikesoftwares" ou "https://logikesoftwares.freshdesk.com".
export function lerConfigFreshdesk(env = process.env) {
  const bruto = String(env.FRESHDESK_DOMINIO || "").trim().toLowerCase();
  let sub = null;
  if (/^[a-z0-9-]{1,63}$/.test(bruto)) sub = bruto;
  else {
    try {
      const u = new URL(bruto);
      const m = u.hostname.match(/^([a-z0-9-]{1,63})\.freshdesk\.com$/);
      if (u.protocol === "https:" && m) sub = m[1];
    } catch { /* inválido */ }
  }
  const apiKey = String(env.FRESHDESK_API_KEY || "").trim();
  return {
    baseUrl: sub ? `https://${sub}.freshdesk.com/api/v2` : null,
    apiKey,
    configurado: !!(sub && apiKey),
    dominioInvalido: !!bruto && !sub,
  };
}

const MSG = {
  credenciais: "O Freshdesk recusou a chave de API (verifique a chave).",
  permissao:   "A chave foi aceita, mas o agente dela não tem permissão para esta consulta.",
  dominio:     "Domínio do Freshdesk não encontrado (verifique FRESHDESK_DOMINIO).",
  limite:      "Limite de requisições do Freshdesk atingido. Tente novamente em instantes.",
  indisponivel:"O Freshdesk está temporariamente indisponível.",
  rede:        "Falha de comunicação com o Freshdesk.",
};

// Devolve { ok: true } ou { ok: false, codigo, mensagem } — nunca dados do agente.
export async function testarConexaoFreshdesk({ baseUrl, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
  const auth = "Basic " + Buffer.from(`${apiKey}:X`).toString("base64");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${baseUrl}/agents/me`, { headers: { Authorization: auth, Accept: "application/json" }, signal: ctrl.signal, redirect: "manual" });
  } catch {
    return { ok: false, codigo: "rede", mensagem: MSG.rede };
  } finally { clearTimeout(timer); }
  if (res.status === 200) return { ok: true };
  const codigo = res.status === 401 ? "credenciais" : res.status === 403 ? "permissao"
    : (res.status === 404 || (res.status >= 300 && res.status < 400)) ? "dominio"
    : res.status === 429 ? "limite" : "indisponivel";
  return { ok: false, codigo, mensagem: codigo === "indisponivel" ? `${MSG.indisponivel} (HTTP ${res.status})` : MSG[codigo] };
}
