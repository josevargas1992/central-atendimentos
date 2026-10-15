// POST /api/vindi/sincronizar { inadId } — botão "Atualizar pela Vindi".
import { getDb } from "../../server/firebaseAdmin.js";
import { lerConfigVindi } from "../../server/vindi/config.js";
import { criarClienteVindi } from "../../server/vindi/cliente.js";
import { criarHandlerSincronizar } from "../../server/vindi/endpoints.js";

export default criarHandlerSincronizar({
  getDb,
  lerConfig: () => lerConfigVindi(),
  criarCliente: cfg => criarClienteVindi({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }),
});
