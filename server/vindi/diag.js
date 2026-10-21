// DIAGNÓSTICO TEMPORÁRIO (20/10/2026) — só leitura, protegido por DIAG_SECRET. Remover após a análise.
// Mostra, para algumas faturas, as datas das cobranças e das transações (boletos emitidos), com o
// vencimento decodificado da linha digitável. Não devolve código de barras, links, tokens nem dados pessoais.
import { autorizado } from "./diaria.js";

const somar = (base, n) => { const d = new Date(base + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Fator de vencimento do boleto (FEBRABAN): base 07/10/1997; reiniciou em 1000 no dia 22/02/2025.
export function vencimentoDoBoleto(linha) {
  const n = String(linha || "").replace(/\D/g, "");
  const f = n.length === 47 ? +n.slice(33, 37) : n.length === 44 ? +n.slice(5, 9) : NaN;
  const v = n.length === 47 ? n.slice(37) : n.length === 44 ? n.slice(9, 19) : null;
  if (!f || f < 1000) return null;
  const novo = somar("2025-02-22", f - 1000), antigo = somar("1997-10-07", f);
  return { vencimento: novo >= "2025-02-22" && novo < "2035-01-01" ? novo : antigo, valorCentavos: v ? +v : null };
}

export function criarHandlerDiag({ lerConfig, criarCliente, lerSegredo = () => process.env.DIAG_SECRET }) {
  return async function handler(req, res) {
    const r = (s, c) => { res.status(s).setHeader("Cache-Control", "no-store"); return res.json(c); };
    if (!autorizado(req.headers?.authorization, lerSegredo())) return r(401, { erro: "Não autorizado." });
    const ids = (new URL(req.url || "/", "http://x").searchParams.get("faturas") || "").split(",").filter(x => /^\d{1,15}$/.test(x)).slice(0, 8);
    const cliente = criarCliente(lerConfig());
    const saida = [];
    for (const id of ids) {
      const b = await cliente.fatura(id);
      if (!b) { saida.push({ id, erro: "não encontrada" }); continue; }
      const cobrancas = [];
      for (const c of b.charges || []) {
        const trs = await cliente.transacoesDaCobranca(c.id);
        cobrancas.push({
          id: c.id, status: c.status, due_at: c.due_at, paid_at: c.paid_at, created_at: c.created_at,
          transacoes: trs.map(t => {
            const campos = t.gateway_response_fields || {};
            const linha = Object.values(campos).find(v => typeof v === "string" && /^\d{44}$|^\d{47}$/.test(v.replace(/[\s.]/g, "")));
            return { id: t.id, tipo: t.transaction_type, status: t.status, created_at: t.created_at, mensagem: t.gateway_message,
              boleto: linha ? vencimentoDoBoleto(linha) : null,
              payment_date: campos.payment_date ?? campos.PAYMENT_DATE ?? null, date_payment: campos.date_payment ?? campos.DATE_PAYMENT ?? null, date_approval: campos.date_approval ?? null, payment_origin: campos.payment_origin ?? null,
              nomesDosCampos: Object.keys(campos) };
          }),
        });
      }
      saida.push({ id: b.id, status: b.status, due_at: b.due_at, created_at: b.created_at, updated_at: b.updated_at, ciclo: b.period?.cycle ?? null, cobrancas });
    }
    return r(200, saida);
  };
}
