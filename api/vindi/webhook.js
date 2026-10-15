// POST /api/vindi/webhook — URL a cadastrar na Vindi (com usuário e senha na URL).
import { waitUntil } from "@vercel/functions";
import { getDb } from "../../server/firebaseAdmin.js";
import { lerConfigVindi } from "../../server/vindi/config.js";
import { criarClienteVindi } from "../../server/vindi/cliente.js";
import { criarHandlerWebhook } from "../../server/vindi/webhook.js";
import { comLimiteDeTempo } from "../../server/limiteTempo.js";

export default comLimiteDeTempo(criarHandlerWebhook({
  getDb,
  lerConfig: () => lerConfigVindi(),
  criarCliente: cfg => criarClienteVindi({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }),
  waitUntil,
}));
