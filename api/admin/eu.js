// GET /api/admin/eu — a conta logada no Firebase é administradora? (decidido só no servidor)
import { verificarTokenFirebase } from "../../server/tokenFirebase.js";
import { lerAdminUids } from "../../server/authAdmin.js";
import { criarHandlerAdminEu } from "../../server/adminEu.js";
import { comLimiteDeTempo } from "../../server/limiteTempo.js";

export default comLimiteDeTempo(criarHandlerAdminEu({
  verificarToken: verificarTokenFirebase,
  lerAdmins: () => lerAdminUids(),
}));
