// GET /api/admin/eu — confirma, no SERVIDOR, se quem está logado no Firebase é administrador
// (token verificado + UID em ADMIN_UIDS). Usado pelo login do admin; o navegador nunca decide isso.
import { verificarAdmin } from "./authAdmin.js";

export function criarHandlerAdminEu({ verificarToken, lerAdmins }) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ erro: "Método não permitido." }); }
    const a = await verificarAdmin(req, { verificarToken, adminUids: lerAdmins() });
    if (!a.ok) return res.status(a.status).json({ admin: false, erro: a.erro });
    return res.status(200).json({ admin: true });
  };
}
