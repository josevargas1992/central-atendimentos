// Cliente da API REST da Vindi (somente consultas GET).
// Referências: developers.vindi.com.br → Segurança e autenticação, Paginação, Rate limit,
// GET /v1/bills, GET /v1/bills/{id}, GET /v1/subscriptions/{id}.
//
// • Autenticação: HTTP Basic com a chave da API como usuário e senha vazia ("CHAVE:").
// • Paginação: per_page até 50; segue o cabeçalho Link (rel="next").
// • Limite: 120 req/min; ao receber 429, espera o Retry-After e tenta de novo.
// • Nunca registra a chave nem URLs completas em logs ou mensagens de erro.

export class ErroVindi extends Error {
  // codigo: credenciais | nao_encontrado | limite | indisponivel | rede | parametros | resposta_invalida | config
  constructor(codigo, mensagem, status = null) { super(mensagem); this.codigo = codigo; this.status = status; }
}

const MENSAGENS = {
  credenciais:       "A Vindi recusou a chave de API (verifique a chave e o ambiente).",
  limite:            "Limite de requisições da Vindi atingido. Tente novamente em alguns instantes.",
  indisponivel:      "A API da Vindi está temporariamente indisponível.",
  rede:              "Falha de comunicação com a Vindi.",
  parametros:        "A Vindi recusou os parâmetros da consulta.",
  resposta_invalida: "A Vindi respondeu em um formato inesperado.",
};

const pausa = ms => new Promise(r => setTimeout(r, ms));

export function criarClienteVindi({ apiKey, baseUrl, fetchImpl = globalThis.fetch, esperar = pausa, timeoutMs = 15000, maxTentativas = 3 }) {
  if (!apiKey || !baseUrl) throw new ErroVindi("config", "Integração Vindi não configurada (chave ou ambiente ausente).");
  const auth = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");

  async function requisitar(url) {
    for (let tentativa = 1; ; tentativa++) {
      let res;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        res = await fetchImpl(url, { headers: { Authorization: auth, Accept: "application/json" }, signal: ctrl.signal });
      } catch {
        clearTimeout(timer);
        if (tentativa < maxTentativas) { await esperar(1000 * tentativa); continue; }
        throw new ErroVindi("rede", MENSAGENS.rede);
      }
      clearTimeout(timer);

      if (res.status === 429) {
        if (tentativa >= maxTentativas) throw new ErroVindi("limite", MENSAGENS.limite, 429);
        const s = Number(res.headers.get("Retry-After"));
        await esperar(Math.min(60, Number.isFinite(s) && s > 0 ? s : 5) * 1000);
        continue;
      }
      if (res.status >= 500) {
        if (tentativa < maxTentativas) { await esperar(1000 * tentativa); continue; }
        throw new ErroVindi("indisponivel", MENSAGENS.indisponivel, res.status);
      }
      if (res.status === 401 || res.status === 403) throw new ErroVindi("credenciais", MENSAGENS.credenciais, res.status);
      if (res.status === 404) return { naoEncontrado: true, res };
      if (res.status === 400 || res.status === 422) throw new ErroVindi("parametros", MENSAGENS.parametros, res.status);
      if (!res.ok) throw new ErroVindi("indisponivel", `${MENSAGENS.indisponivel} (HTTP ${res.status})`, res.status);

      let corpo;
      try { corpo = await res.json(); } catch { throw new ErroVindi("resposta_invalida", MENSAGENS.resposta_invalida, res.status); }
      return { corpo, res };
    }
  }

  const montar = (caminho, params) => {
    const u = new URL(baseUrl.replace(/\/$/, "") + caminho);
    for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    return u.toString();
  };
  // A documentação não deixa claro se o objeto vem embrulhado ({ bill: {...} }) ou direto — aceita os dois.
  const objeto = (corpo, chave) => (corpo && typeof corpo === "object" && corpo[chave] && typeof corpo[chave] === "object" && !Array.isArray(corpo[chave])) ? corpo[chave] : corpo;
  const lista  = (corpo, chave) => Array.isArray(corpo) ? corpo : Array.isArray(corpo?.[chave]) ? corpo[chave] : null;
  const idValido = id => /^\d{1,15}$/.test(String(id ?? "").trim());

  async function obter(caminho, chave) {
    const r = await requisitar(montar(caminho));
    if (r.naoEncontrado) return null;
    const o = objeto(r.corpo, chave);
    if (!o || typeof o !== "object" || o.id === undefined) throw new ErroVindi("resposta_invalida", MENSAGENS.resposta_invalida);
    return o;
  }

  return {
    // GET /v1/bills/{id} — null se não existir
    async fatura(id) {
      if (!idValido(id)) return null;
      return obter(`/bills/${String(id).trim()}`, "bill");
    },
    // GET /v1/subscriptions/{id} — null se não existir
    async assinatura(id) {
      if (!idValido(id)) return null;
      return obter(`/subscriptions/${String(id).trim()}`, "subscription");
    },
    // GET /v1/bills?query=subscription_id=ID — todas as páginas (até maxPaginas).
    async faturasDaAssinatura(subscriptionId, { maxPaginas = 20 } = {}) {
      if (!idValido(subscriptionId)) return [];
      let url = montar("/bills", { query: `subscription_id=${String(subscriptionId).trim()}`, per_page: 50, sort_by: "due_at", sort_order: "asc", page: 1 });
      const todas = [];
      for (let pagina = 1; url && pagina <= maxPaginas; pagina++) {
        const r = await requisitar(url);
        if (r.naoEncontrado) break;
        const itens = lista(r.corpo, "bills");
        if (!itens) throw new ErroVindi("resposta_invalida", MENSAGENS.resposta_invalida);
        todas.push(...itens);
        const link = r.res.headers.get("Link") || "";
        const prox = link.split(",").map(s => s.trim()).find(s => /rel="?next"?/.test(s));
        url = prox ? (prox.match(/<([^>]+)>/)?.[1] || null) : null;
        // Segurança: só segue links do mesmo servidor da API
        if (url && new URL(url).origin !== new URL(baseUrl).origin) url = null;
        if (!url && itens.length === 50 && !link) url = montar("/bills", { query: `subscription_id=${String(subscriptionId).trim()}`, per_page: 50, sort_by: "due_at", sort_order: "asc", page: pagina + 1 });
      }
      // remove repetidas (por segurança, caso a paginação se sobreponha)
      const vistos = new Set();
      return todas.filter(b => b && b.id !== undefined && !vistos.has(b.id) && vistos.add(b.id));
    },
    // Teste de conexão: consulta leve que só confirma autenticação.
    async testarConexao() {
      const r = await requisitar(montar("/bills", { per_page: 1 }));
      return !r.naoEncontrado;
    },
  };
}
