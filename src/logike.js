// Integração com a API do Lógike Admin (comentários das pesquisas de satisfação).

// Consulta a API configurada pelo protocolo. Nunca lança erro: devolve
// { ok, status, texto, erro } para quem chamou decidir o que mostrar.
// Tenta os campos mais comuns na resposta JSON; ajuste quando tiver a doc da API.
export async function consultarLogike(protocolo, cfg) {
  const endpoint = (cfg.endpoint || "/{protocolo}")
    .replace("{protocolo}", encodeURIComponent(String(protocolo).trim()));
  const url = cfg.baseUrl.replace(/\/$/, "") + endpoint;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${cfg.apiKey}`,
        "X-Api-Key": cfg.apiKey,
        "Accept": "application/json",
      },
    });
  } catch (e) {
    // fetch só lança em falha de rede, URL inválida ou bloqueio CORS do navegador
    return { ok:false, status:0, texto:null, erro:"rede" };
  }
  if (!res.ok) return { ok:false, status:res.status, texto:null, erro:"http" };
  try {
    const json = await res.json();
    const texto = json.comentario ?? json.comment ?? json.texto ?? json.observacao
               ?? json.feedback  ?? json.resposta ?? json.message ?? null;
    return { ok:true, status:res.status, texto, erro:null };
  } catch {
    return { ok:false, status:res.status, texto:null, erro:"json" };
  }
}

// Traduz o resultado de um teste de conexão em mensagem para o usuário.
export function descreverTesteLogike(r) {
  if (r.ok)                return { ok:true,  msg:"✓ Conexão funcionando — a API respondeu." };
  if (r.erro === "rede")   return { ok:false, msg:"✗ Não foi possível conectar. Verifique a URL. Se ela estiver certa, o navegador pode estar bloqueando a chamada (CORS) — nesse caso é preciso um intermediário no servidor." };
  if (r.status === 401 || r.status === 403) return { ok:false, msg:`✗ A API recusou a chave (erro ${r.status}). Confira a API Key.` };
  if (r.status === 404)    return { ok:true,  msg:"✓ Servidor alcançado (404 para o protocolo de teste é esperado). Confirme o endpoint com uma importação real." };
  if (r.erro === "json")   return { ok:false, msg:`✗ A API respondeu (${r.status}), mas não em formato JSON. Confira o endpoint.` };
  return { ok:false, msg:`✗ A API respondeu com erro ${r.status}.` };
}
