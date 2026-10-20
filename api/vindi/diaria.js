// GET /api/vindi/diaria — sincronização diária automática (Vercel Cron; ver vercel.json).
import { waitUntil } from "@vercel/functions";
import { getDb } from "../../server/firebaseAdmin.js";
import { lerConfigVindi } from "../../server/vindi/config.js";
import { criarClienteVindi } from "../../server/vindi/cliente.js";
import { criarHandlerDiaria } from "../../server/vindi/diaria.js";
import { comLimiteDeTempo } from "../../server/limiteTempo.js";

export default comLimiteDeTempo(criarHandlerDiaria({
  getDb,
  lerConfig: () => lerConfigVindi(),
  criarCliente: cfg => criarClienteVindi({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }),
  waitUntil,
}), 55_000);
