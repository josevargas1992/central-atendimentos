// GET /api/vindi/diag?faturas=1,2 — DIAGNÓSTICO TEMPORÁRIO (só leitura). Remover após a análise.
import { lerConfigVindi } from "../../server/vindi/config.js";
import { criarClienteVindi } from "../../server/vindi/cliente.js";
import { criarHandlerDiag } from "../../server/vindi/diag.js";
import { comLimiteDeTempo } from "../../server/limiteTempo.js";

export default comLimiteDeTempo(criarHandlerDiag({
  lerConfig: () => lerConfigVindi(),
  criarCliente: cfg => criarClienteVindi({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }),
}), 55_000);
