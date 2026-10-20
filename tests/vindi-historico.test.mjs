// Vindi — cancelamento automático e histórico permanente de parcelas pagas em atraso.
// API da Vindi SIMULADA e Firestore no emulador local (nenhuma chamada real, nenhum dado real).
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../server/firebaseAdmin.js";
import { sincronizarRegistro, COL_INAD, COL_SINC, COL_EVENTOS } from "../server/vindi/processar.js";
import { criarHandlerWebhook } from "../server/vindi/webhook.js";
import { classificarPagamento, limiteSemAtraso, mesclarHistorico, apurarCancelamento, entradaHistorico } from "../server/vindi/historico.js";
import { inadPlanejarImportacao, inadCamposImportacao, inadSituacaoParcelas } from "../src/inadimplentes.js";

const AGORA = new Date("2026-10-14T15:00:00-03:00");
const db = getDb();

// Fatura no formato da API: ciclo (nº da parcela), vencimento, status, pagamento e updated_at.
const billC = (id, ciclo, venc, status = "pending", pagoEm = null, upd = "2026-10-01T10:00:00-03:00", valor = "100.0") => ({
  id, amount: valor, status, due_at: `${venc}T00:00:00.000-03:00`, updated_at: upd, subscription: { id: 5001 }, period: { cycle: ciclo },
  charges: pagoEm ? [{ id: id * 10, status: "paid", paid_at: `${pagoEm}T10:00:00.000-03:00` }] : [{ id: id * 10, status: "pending" }],
});
const vindiFake = ({ assinaturas = {}, faturas = [] } = {}) => ({
  async assinatura(id) { return assinaturas[String(id)] || null; },
  async fatura(id) { return faturas.find(b => String(b.id) === String(id)) || null; },
  async faturasDaAssinatura(id) { return faturas.filter(b => String(b.subscription?.id) === String(id)); },
});
const CANC = (cancel_at = "2026-10-14T11:55:07.000-03:00") => ({ "5001": { id: 5001, status: "canceled", cancel_at, billing_cycles: 12 } });
const SUB12 = { "5001": { id: 5001, status: "active", billing_cycles: 12 } };

async function limpar() {
  for (const c of [COL_INAD, COL_SINC, COL_EVENTOS]) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map(d => d.ref.delete()));
  }
}
async function criarInad(extra = {}) {
  const reg = { id: "inad-1", nome: "Cliente Teste", email: "c@x.com", idFatura: "5001", status: "Inadimplente", statusOrigem: "planilha",
    observacoes: [{ id: "o1", texto: "Ligou e prometeu pagar" }], agendamento: { titulo: "Retorno", dataHora: "2026-10-20T10:00", concluido: false },
    prioridade: true, responsavelId: "ana", parcelas: [{ n: 1, paga: true }], ...extra };
  await db.collection(COL_INAD).doc(reg.id).set(reg);
  return reg;
}
const ler = async () => (await db.collection(COL_INAD).doc("inad-1").get()).data();
const atual = async () => ({ id: "inad-1", ...(await ler()) });
const sinc = (registro, cliente, origem = "manual") => sincronizarRegistro({ db, cliente, registro, origem, ambiente: "producao", agora: AGORA });

const CFG = { ambiente: "producao", apiKey: "chave-teste", baseUrl: "https://x", webhookUsuario: "vindi", webhookSenha: "s3nh4-forte", apiConfigurada: true, webhookConfigurado: true };
function chamar(handler, body) {
  return new Promise(async resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
    await handler({ method: "POST", headers: { authorization: "Basic " + Buffer.from("vindi:s3nh4-forte").toString("base64") }, body }, res);
  });
}
const handlerCom = cliente => criarHandlerWebhook({ getDb: () => db, lerConfig: () => CFG, criarCliente: () => cliente });
const evFatura = (tipo, b, criado = "2026-10-14T11:55:08.000-03:00") => ({ event: { type: tipo, created_at: criado, data: { bill: b } } });
const evAssinatura = (criado = "2026-10-14T11:55:09.000-03:00") => ({ event: { type: "subscription_canceled", created_at: criado, data: { subscription: { id: 5001, status: "canceled", updated_at: "2026-10-14T11:55:07.000-03:00" } } } });

beforeEach(limpar);
after(limpar);

// ── Regras puras ──────────────────────────────────────────────────────

test("regra de atraso: no prazo até o vencimento; fim de semana e feriado bancário passam ao próximo dia útil", () => {
  assert.deepEqual(classificarPagamento("2026-08-10", "2026-08-10"), { emAtraso: false, diasAtraso: 0 });
  assert.deepEqual(classificarPagamento("2026-08-10", "2026-08-05"), { emAtraso: false, diasAtraso: 0 }, "antecipado");
  assert.deepEqual(classificarPagamento("2026-08-10", "2026-08-25"), { emAtraso: true, diasAtraso: 15 }, "exemplo da especificação");
  assert.equal(limiteSemAtraso("2026-08-15"), "2026-08-17", "sábado → segunda");
  assert.deepEqual(classificarPagamento("2026-08-15", "2026-08-17"), { emAtraso: false, diasAtraso: 0 });
  assert.deepEqual(classificarPagamento("2026-08-15", "2026-08-18"), { emAtraso: true, diasAtraso: 3 }, "dias contados do vencimento original");
  assert.equal(limiteSemAtraso("2026-12-25"), "2026-12-28", "Natal (sexta) → segunda");
  assert.equal(limiteSemAtraso("2026-02-14"), "2026-02-18", "sábado de Carnaval → quarta de Cinzas");
  assert.equal(limiteSemAtraso("2026-04-03"), "2026-04-06", "Sexta-feira Santa");
  assert.equal(limiteSemAtraso("2026-11-20"), "2026-11-23", "Consciência Negra");
  assert.equal(limiteSemAtraso("2026-12-31"), "2027-01-04", "31/12 sem expediente bancário, 01/01 feriado, depois fim de semana");
  assert.deepEqual(classificarPagamento("2026-08-10", null), { emAtraso: null, diasAtraso: null }, "sem data não classifica");
  assert.deepEqual(classificarPagamento("2026-08-10", "2026-08-11", 1), { emAtraso: false, diasAtraso: 0 }, "tolerância opcional de 1 dia útil");
});

test("pagamento registrado não se perde se a fatura for estornada/cancelada depois", () => {
  const f = (status, pagoEm, upd) => ({ id: 1, ciclo: 1, status, vencimento: "2026-08-10", pagoEm, valorCentavos: 100, atualizadoFonte: upd });
  const a = mesclarHistorico({}, [f("paid", "2026-08-25", "2026-08-25T10:00:00-03:00")], "x").historico;
  const b = mesclarHistorico(a, [f("canceled", null, "2026-09-01T10:00:00-03:00")], "y").historico;
  assert.equal(b["1"].situacao, "cancelada");
  assert.deepEqual(b["1"].pagamentoAnterior, { situacao: "pagaAtraso", pagoEm: "2026-08-25", diasAtraso: 15 });
  assert.equal(b["1"].registradoEm, "x");
});

test("cenário 8: dado fora de ordem (updated_at mais antigo) não sobrescreve o histórico", () => {
  const nova = { id: 1, ciclo: 1, status: "paid", vencimento: "2026-08-10", pagoEm: "2026-08-25", valorCentavos: 100, atualizadoFonte: "2026-08-25T10:00:00-03:00" };
  const velha = { ...nova, status: "pending", pagoEm: null, atualizadoFonte: "2026-08-11T10:00:00-03:00" };
  const h = mesclarHistorico({}, [nova], "x").historico;
  const r = mesclarHistorico(h, [velha], "y");
  assert.equal(r.mudou, false);
  assert.equal(r.historico["1"].situacao, "pagaAtraso");
  assert.equal(mesclarHistorico(h, [nova], "z").mudou, false, "repetido não muda nada");
});

test("apuração do cancelamento sem cancel_at → não inventa valor", () => {
  const r = apurarCancelamento({ status: "canceled" }, [{ id: 1, status: "pending", vencimento: "2026-08-10", valorCentavos: 100 }]);
  assert.equal(r.confiavel, false);
  assert.equal(r.valorEmAbertoCentavos, null);
  assert.equal(apurarCancelamento({ status: "active" }, []), null);
});

test("quadradinhos: azul para paga em atraso, pelo nº da parcela (ciclo); cancelamento mostra o que ficou em aberto", () => {
  const e = (id, ciclo, status, venc, pagoEm = null) => entradaHistorico({ id, ciclo, status, vencimento: venc, pagoEm, valorCentavos: 100 });
  const reg = { numParcelas: 6, vindi: { faturas: [{ id: "x" }], cancelamento: { faturas: ["4"] }, historico: {
    1: e(1, 1, "paid", "2026-06-10", "2026-06-10"),
    2: e(2, 2, "paid", "2026-07-10", "2026-07-25"),
    3: e(3, 3, "pending", "2026-08-10"),
    4: e(4, 4, "canceled", "2026-09-10"),
    5: e(5, 5, "pending", "2026-12-10"),
  } } };
  const s = inadSituacaoParcelas(reg, "2026-10-14");
  assert.deepEqual(s.map(p => p.situacao), ["paga", "pagaAtraso", "vencida", "vencida", "aVencer", "naoGerada"]);
  assert.equal(s[1].diasAtraso, 15);
  assert.equal(s[1].vencimento, "2026-07-10");
  assert.equal(s[1].pagoEm, "2026-07-25");
  assert.equal(s[3].canceladaNaVindi, true);
});

test("quadradinhos: registro ainda sem histórico continua com a regra anterior", () => {
  const reg = { numParcelas: 3, vindi: { faturas: [
    { id: "1", status: "paid", vencimento: "2026-08-10", pagoEm: "2026-08-25" },
    { id: "2", status: "pending", vencimento: "2026-09-10" },
  ] } };
  assert.deepEqual(inadSituacaoParcelas(reg, "2026-10-14").map(p => p.situacao), ["paga", "vencida", "naoGerada"]);
});

// ── Histórico de parcelas (com Firestore) ─────────────────────────────

test("cenário 3: parcela paga até o vencimento → Paga (no prazo)", async () => {
  await sinc(await criarInad(), vindiFake({ assinaturas: SUB12, faturas: [billC(1, 6, "2026-08-10", "paid", "2026-08-10")] }));
  const h = (await ler()).vindi.historico["1"];
  assert.equal(h.situacao, "paga");
  assert.equal(h.ciclo, 6);
  assert.equal(h.diasAtraso, 0);
});

test("cenário 4: parcela paga após o vencimento original → Paga em atraso, com dias e datas", async () => {
  await sinc(await criarInad(), vindiFake({ assinaturas: SUB12, faturas: [billC(1, 6, "2026-08-10", "paid", "2026-08-25")] }));
  const d = await ler();
  const { ciclo, vencimento, pagoEm, diasAtraso, situacao } = d.vindi.historico["1"];
  assert.deepEqual({ ciclo, vencimento, pagoEm, diasAtraso, situacao }, { ciclo: 6, vencimento: "2026-08-10", pagoEm: "2026-08-25", diasAtraso: 15, situacao: "pagaAtraso" });
  assert.equal(d.vindi.totalParcelasVindi, 12, "parcela 6 de 12");
});

test("data do pagamento vem da cobrança paga; novo vencimento da cobrança (2ª via) não substitui o da fatura", async () => {
  const b = billC(1, 2, "2026-08-10", "paid");
  b.charges = [{ id: 9, status: "paid", due_at: "2026-08-30T00:00:00.000-03:00", paid_at: "2026-08-28T15:00:00.000-03:00" }];
  await sinc(await criarInad(), vindiFake({ assinaturas: SUB12, faturas: [b] }));
  const h = (await ler()).vindi.historico["1"];
  assert.equal(h.vencimento, "2026-08-10", "vencimento original da fatura");
  assert.equal(h.situacao, "pagaAtraso");
  assert.equal(h.diasAtraso, 18);
});

test("paga sem data de pagamento informada → não é classificada como atraso", async () => {
  const b = billC(1, 1, "2026-08-10", "paid"); b.charges = [{ id: 9, status: "paid" }];
  await sinc(await criarInad(), vindiFake({ assinaturas: SUB12, faturas: [b] }));
  const h = (await ler()).vindi.historico["1"];
  assert.equal(h.situacao, "pagaSemData");
  assert.equal(h.diasAtraso, null);
});

test("cenário 5: quita todas as vencidas → Regularizado, e o histórico de atraso continua", async () => {
  await sinc(await criarInad(), vindiFake({ assinaturas: SUB12, faturas: [billC(1, 1, "2026-08-10", "paid", "2026-08-25"), billC(2, 2, "2026-09-10", "paid", "2026-10-13")] }));
  const d = await ler();
  assert.equal(d.status, "Regularizado");
  assert.equal(d.vindi.historico["1"].situacao, "pagaAtraso");
  assert.equal(d.vindi.historico["2"].diasAtraso, 33);
});

test("cenário 6: nova sincronização de cliente regularizado preserva o histórico (mesmo se a fatura não vier mais)", async () => {
  await sinc(await criarInad(), vindiFake({ assinaturas: SUB12, faturas: [billC(1, 1, "2026-08-10", "paid", "2026-08-25"), billC(2, 2, "2026-09-10", "paid", "2026-09-10")] }));
  const antes = (await ler()).vindi.historico;
  await sinc(await atual(), vindiFake({ assinaturas: SUB12, faturas: [billC(2, 2, "2026-09-10", "paid", "2026-09-10"), billC(3, 3, "2026-11-10")] }));
  const d = await ler();
  assert.equal(d.status, "Regularizado");
  assert.deepEqual(d.vindi.historico["1"], antes["1"], "entrada antiga intacta");
  assert.equal(d.vindi.historico["3"].situacao, "pendente");
});

// ── Cancelamento ──────────────────────────────────────────────────────

test("cenário 1: assinatura cancelada na Vindi → Cancelado, com data e origem do cancelamento", async () => {
  const reg = await criarInad();
  await sinc(reg, vindiFake({ assinaturas: CANC(), faturas: [billC(1, 1, "2026-08-10", "paid", "2026-08-10")] }), "webhook");
  const d = await ler();
  assert.equal(d.status, "Cancelado");
  assert.equal(d.statusOrigem, "vindi");
  assert.equal(d.vindi.cancelamento.em, "2026-10-14T11:55:07.000-03:00");
  assert.equal(d.vindi.cancelamento.data, "2026-10-14");
  assert.equal(d.vindi.cancelamento.origem, "webhook");
  assert.equal(d.vindi.cancelamento.vencidasQtd, 0);
  assert.deepEqual(d.observacoes, reg.observacoes, "observações intactas");
  assert.deepEqual(d.agendamento, reg.agendamento, "compromisso intacto");
  assert.equal(d.vindi.historico["1"].situacao, "paga", "histórico de parcelas preservado");
  const log = (await db.collection(COL_SINC).get()).docs[0].data();
  assert.equal(log.alteracoes.statusPara, "Cancelado");
});

test("cenário 2 (caso real de 20/10): a Vindi cancela as faturas vencidas junto → Cancelado, valor em aberto preservado", async () => {
  // Antes da correção, este cliente ficou "Regularizado" porque as vencidas foram canceladas com a assinatura.
  const reg = await criarInad({ status: "Regularizado", statusOrigem: "vindi" });
  const noCancel = "2026-10-14T11:55:07-03:00";
  const faturas = [
    billC(1, 1, "2026-06-17", "paid", "2026-06-09"),
    billC(2, 2, "2026-08-10", "paid", "2026-08-11"),
    billC(3, 3, "2026-09-06", "canceled", null, "2026-09-20T10:00:00-03:00"),  // renegociada antes — não conta
    billC(4, 3, "2026-10-06", "canceled", null, noCancel),                     // 2ª via do ciclo 3, vencida
    billC(5, 4, "2026-10-06", "canceled", null, noCancel, "50.5"),             // vencida
    billC(6, 5, "2026-10-19", "canceled", null, noCancel),                     // ainda não vencida no cancelamento
  ];
  await sinc(reg, vindiFake({ assinaturas: CANC(), faturas }));
  const d = await ler();
  assert.equal(d.status, "Cancelado", "não fica Regularizado");
  assert.equal(d.vindi.cancelamento.vencidasQtd, 2);
  assert.equal(d.vindi.cancelamento.valorEmAbertoCentavos, 15050);
  assert.deepEqual(d.vindi.cancelamento.faturas, ["4", "5"]);
  assert.equal(d.vindi.historico["2"].situacao, "pagaAtraso");
});

test("valor zerado pela Vindi ao cancelar: usa o valor guardado antes; sem histórico, o da cobrança; sem nada, não inventa", async () => {
  const noCancel = "2026-10-14T11:55:07-03:00";
  const zerada = (id, ciclo, venc, cobranca = null) => {
    const b = billC(id, ciclo, venc, "canceled", null, noCancel, "0.0");
    b.charges = [{ id: id * 10, status: "canceled", ...(cobranca ? { amount: cobranca } : {}) }];
    return b;
  };
  // (a) cliente já sincronizado enquanto as faturas estavam abertas → valor preservado pelo histórico
  await sinc(await criarInad(), vindiFake({ assinaturas: SUB12, faturas: [billC(1, 1, "2026-09-06", "pending", null, "2026-10-01T10:00:00-03:00", "102.49"), billC(2, 2, "2026-10-06", "pending", null, "2026-10-01T10:00:00-03:00", "102.49")] }));
  await sinc(await atual(), vindiFake({ assinaturas: CANC(), faturas: [zerada(1, 1, "2026-09-06"), zerada(2, 2, "2026-10-06")] }));
  let d = await ler();
  assert.equal(d.status, "Cancelado");
  assert.equal(d.vindi.cancelamento.valorEmAbertoCentavos, 20498);
  assert.equal(d.vindi.historico["1"].valorCentavos, 10249);
  assert.equal(d.vindi.historico["1"].valorZeradoNaVindi, true);
  // (b) sem histórico: usa o valor da cobrança
  await limpar();
  await sinc(await criarInad(), vindiFake({ assinaturas: CANC(), faturas: [zerada(1, 1, "2026-09-06", "102.49")] }));
  assert.equal((await ler()).vindi.cancelamento.valorEmAbertoCentavos, 10249);
  // (c) sem histórico e sem valor na cobrança: não soma R$ 0
  await limpar();
  await sinc(await criarInad(), vindiFake({ assinaturas: CANC(), faturas: [zerada(1, 1, "2026-09-06")] }));
  d = await ler();
  assert.equal(d.status, "Cancelado");
  assert.equal(d.vindi.cancelamento.vencidasQtd, 1);
  assert.equal(d.vindi.cancelamento.valorEmAbertoCentavos, null);
});

test("cenário 2b: cancelada com faturas ainda pendentes → Cancelado e a dívida continua visível", async () => {
  await sinc(await criarInad(), vindiFake({ assinaturas: CANC(), faturas: [billC(1, 1, "2026-08-10"), billC(2, 2, "2026-09-10")] }));
  const d = await ler();
  assert.equal(d.status, "Cancelado");
  assert.equal(d.vindi.vencidasQtd, 2);
  assert.equal(d.vindi.vencidoCentavos, 20000);
  assert.equal(d.vindi.cancelamento.valorEmAbertoCentavos, 20000);
});

test("cancelamento vale mesmo com status definido manualmente", async () => {
  await sinc(await criarInad({ status: "Inadimplente", statusOrigem: "manual" }), vindiFake({ assinaturas: CANC(), faturas: [billC(1, 1, "2026-08-10")] }));
  assert.equal((await ler()).status, "Cancelado");
});

test("depois do cancelamento registrado, alteração manual do status é respeitada", async () => {
  await sinc(await criarInad(), vindiFake({ assinaturas: CANC(), faturas: [billC(1, 1, "2026-08-10", "paid", "2026-08-10")] }));
  await db.collection(COL_INAD).doc("inad-1").update({ status: "Regularizado", statusOrigem: "manual" });
  await sinc(await atual(), vindiFake({ assinaturas: CANC(), faturas: [billC(1, 1, "2026-08-10", "paid", "2026-08-10")] }));
  const d = await ler();
  assert.equal(d.status, "Regularizado");
  assert.match(d.vindi.divergencia, /cancelada na Vindi, mas o status foi alterado manualmente/);
});

test("sincronização posterior não troca Cancelado por Regularizado/Inadimplente", async () => {
  await sinc(await criarInad(), vindiFake({ assinaturas: CANC(), faturas: [billC(1, 1, "2026-08-10")] }));
  // depois, tudo pago (assinatura continua cancelada)
  await sinc(await atual(), vindiFake({ assinaturas: CANC(), faturas: [billC(1, 1, "2026-08-10", "paid", "2026-10-13", "2026-10-13T10:00:00-03:00")] }));
  assert.equal((await ler()).status, "Cancelado");
  // assinatura volta a aparecer ativa, com fatura vencida: mantém Cancelado e avisa
  await sinc(await atual(), vindiFake({ assinaturas: SUB12, faturas: [billC(1, 1, "2026-08-10", "paid", "2026-10-13", "2026-10-13T10:00:00-03:00"), billC(2, 2, "2026-07-10")] }));
  const d = await ler();
  assert.equal(d.status, "Cancelado");
  assert.match(d.vindi.divergencia, /não está mais cancelada/);
  assert.equal(d.vindi.cancelamento.em, "2026-10-14T11:55:07.000-03:00", "registro do cancelamento preservado");
});

test("cenário 7: webhook subscription_canceled duplicado não refaz nada", async () => {
  await criarInad();
  const h = handlerCom(vindiFake({ assinaturas: CANC(), faturas: [billC(1, 1, "2026-08-10")] }));
  await chamar(h, evAssinatura());
  const primeiro = (await ler()).vindi.cancelamento;
  const r2 = await chamar(h, evAssinatura());
  assert.deepEqual(r2.body, { recebido: true, duplicado: true });
  assert.equal((await db.collection(COL_SINC).get()).size, 1);
  // outro evento (ex.: bill_canceled) dispara nova consulta, mas o cancelamento não é refeito
  await chamar(h, evFatura("bill_canceled", billC(1, 1, "2026-08-10", "canceled", null, "2026-10-14T11:55:07-03:00")));
  const d = await ler();
  assert.deepEqual(d.vindi.cancelamento, primeiro);
  assert.equal(d.status, "Cancelado");
});

test("ordem real dos webhooks: bill_canceled antes de subscription_canceled termina em Cancelado", async () => {
  await criarInad();
  const cancelada = billC(1, 1, "2026-08-10", "canceled", null, "2026-10-14T11:55:07-03:00");
  // 1º evento: fatura cancelada, assinatura ainda ativa na consulta → Regularizado (sem vencidas)
  await chamar(handlerCom(vindiFake({ assinaturas: SUB12, faturas: [cancelada] })), evFatura("bill_canceled", cancelada));
  assert.equal((await ler()).status, "Regularizado");
  // 2º evento: assinatura cancelada → Cancelado
  await chamar(handlerCom(vindiFake({ assinaturas: CANC(), faturas: [cancelada] })), evAssinatura());
  const d = await ler();
  assert.equal(d.status, "Cancelado");
  assert.equal(d.vindi.cancelamento.vencidasQtd, 1, "a fatura vencida cancelada junto conta como valor em aberto");
});

test("webhooks simultâneos do mesmo cliente não perdem entradas do histórico", async () => {
  await criarInad();
  const faturas = [billC(1, 1, "2026-08-10", "paid", "2026-08-25"), billC(2, 2, "2026-09-10", "paid", "2026-09-30")];
  const v = vindiFake({ assinaturas: SUB12, faturas });
  const reg = await atual();
  await Promise.all([sinc(reg, v), sinc(reg, v), sinc(reg, v)]);
  const d = await ler();
  assert.deepEqual(Object.keys(d.vindi.historico).sort(), ["1", "2"]);
  assert.equal(d.status, "Regularizado");
});

// ── Importação do Excel ───────────────────────────────────────────────

test("cenário 9: importação do Excel depois da regularização não apaga o histórico nem o status", async () => {
  const reg = await criarInad();
  await sinc(reg, vindiFake({ assinaturas: SUB12, faturas: [billC(1, 1, "2026-08-10", "paid", "2026-08-25")] }));
  const linha = { linha: 2, registro: { numero: "", idFatura: "5001", serie: "", nome: "Cliente Teste", email: "c@x.com", statusPlanilha: "Inadimplente", numParcelas: 12, parcelas: [], planilha: {} } };
  const { gravar, novosIds } = inadPlanejarImportacao([await atual()], [linha], { agora: "2026-10-15T00:00:00Z" });
  assert.equal(gravar.length, 1);
  assert.equal(novosIds.size, 0);
  assert.equal(gravar[0].status, "Regularizado", "status do app não é trocado pela planilha");
  // Gravação como no app: update só com os campos da planilha
  const campos = inadCamposImportacao(gravar[0]);
  assert.ok(!("vindi" in campos) && !("observacoes" in campos) && !("agendamento" in campos));
  // A Vindi grava entre a leitura e a gravação da importação
  await db.collection(COL_INAD).doc("inad-1").update({ "vindi.historico.99": { id: "99", situacao: "paga" } });
  await db.collection(COL_INAD).doc("inad-1").update(campos);
  const d = await ler();
  assert.equal(d.vindi.historico["1"].situacao, "pagaAtraso");
  assert.ok(d.vindi.historico["99"], "gravação concorrente da Vindi também preservada");
  assert.equal(d.numParcelas, 12);
  assert.deepEqual(d.observacoes, reg.observacoes);
});

test("importação mantém Cancelado definido pela Vindi", async () => {
  await sinc(await criarInad(), vindiFake({ assinaturas: CANC(), faturas: [billC(1, 1, "2026-08-10")] }));
  const linha = { linha: 2, registro: { numero: "", idFatura: "5001", serie: "", nome: "Cliente Teste", email: "c@x.com", statusPlanilha: "Inadimplente", numParcelas: 12, parcelas: [], planilha: {} } };
  const { gravar } = inadPlanejarImportacao([await atual()], [linha], { agora: "2026-10-15T00:00:00Z" });
  assert.equal(gravar[0].status, "Cancelado");
  assert.equal(gravar[0].statusOrigem, "vindi");
});
