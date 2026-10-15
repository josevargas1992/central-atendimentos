// Autorização de administrador nas funções do servidor.
// 1) O navegador envia "Authorization: Bearer <token de login do Firebase>".
// 2) O servidor confere o token com a biblioteca oficial (assinatura, validade, projeto, revogação).
// 3) O servidor confere se o UID está em ADMIN_UIDS — lista que só existe nas variáveis da Vercel.
// Nada enviado pelo navegador (campos, flags de "admin") é aceito como prova de permissão.

export function lerAdminUids(env = process.env) {
  return new Set(String(env.ADMIN_UIDS || "").split(",").map(s => s.trim()).filter(Boolean));
}

// Devolve { ok: true, uid } ou { ok: false, status, erro }. Lista vazia → ninguém é admin.
export async function verificarAdmin(req, { verificarToken, adminUids }) {
  const h = req.headers?.authorization || "";
  const m = h.match(/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/);
  if (!m) return { ok: false, status: 401, erro: "Faça login com a conta de administrador do Firebase." };
  let dados;
  try { dados = await verificarToken(m[1]); }
  catch { return { ok: false, status: 401, erro: "Sessão inválida ou expirada. Entre novamente." }; }
  if (!dados?.uid || !adminUids.has(dados.uid)) return { ok: false, status: 403, erro: "Esta conta não tem permissão de administrador." };
  return { ok: true, uid: dados.uid };
}
