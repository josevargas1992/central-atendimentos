// GET /api/vindi/status — situação da integração (sem segredos).
// POST /api/vindi/status { acao: "testar" | "reprocessar" } — painel do Admin.
import { getDb } from "../../server/firebaseAdmin.js";
import { lerConfigVindi } from "../../server/vindi/config.js";
import { criarClienteVindi } from "../../server/vindi/cliente.js";
import { criarHandlerStatus } from "../../server/vindi/endpoints.js";
import { comLimiteDeTempo } from "../../server/limiteTempo.js";

export default comLimiteDeTempo(criarHandlerStatus({
  getDb,
  lerConfig: () => lerConfigVindi(),
  criarCliente: cfg => criarClienteVindi({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }),
}));
