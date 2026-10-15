// GET /api/freshdesk/status — teste de conexão com o Freshdesk (somente administrador autenticado).
import { verificarTokenFirebase } from "../../server/firebaseAdmin.js";
import { lerAdminUids } from "../../server/authAdmin.js";
import { lerConfigFreshdesk } from "../../server/freshdesk/cliente.js";
import { criarHandlerFreshdeskStatus } from "../../server/freshdesk/endpoints.js";
import { comLimiteDeTempo } from "../../server/limiteTempo.js";

export default comLimiteDeTempo(criarHandlerFreshdeskStatus({
  lerConfig: () => lerConfigFreshdesk(),
  verificarToken: verificarTokenFirebase,
  lerAdmins: () => lerAdminUids(),
}));
