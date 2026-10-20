// Sincronização diária automática — API da Vindi SIMULADA e Firestore no emulador local.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../server/firebaseAdmin.js";
import { COL_INAD, COL_SINC } from "../server/vindi/processar.js";
import { ErroVindi } from "../server/vindi/cliente.js";
import { criarHandlerDiaria, candidatos, autorizado, MAX_RODADAS } from "../server/vindi/diaria.js";

const db = getDb();
const SEGREDO = "segredo-de-teste-com-32-caracteres!!";
const CFG = { ambiente: "producao", apiKey: "k", baseUrl: "https://x", apiConfigurada: true };

const billC = (id, sub, ciclo, venc, status = "pending", pagoEm = null) => ({
  id, amount: "100.0", status, due_at: `${venc}T00:00:00.000-03:00`, updated_at: "2026-10-01T10:00:00-03:00", subscription: { id: sub }, period: { cycle: ciclo },
  charges: pagoEm ? [{ id: id * 10, status: "paid", paid_at: `${pagoEm}T10:00:00.000-03:00` }] : [{ id: id * 10, status: "pending" }],
});
function vindiFake({ faturas = [], falhar = false } = {}) {
  const chamadas = [];
  const erro = () => { throw new ErroVindi("indisponivel", "A API da Vindi está temporariamente indisponível."); };
  return {
    chamadas,
    async assinatura(id) { chamadas.push(String(id)); if (falhar) erro(); return faturas.some(b => String(b.subscription.id) === String(id)) ? { id: Number(id), status: "active", billing_cycles: 12 } : null; },
    async fatura() { if (falhar) erro(); return null; },
    async faturasDaAssinatura(id) { if (falhar) erro(); return faturas.filter(b => String(b.subscription.id) === String(id)); },
  };
}
async function limpar() {
  for (const c of [COL_INAD, COL_SINC]) { const s = await db.collection(c).get(); await Promise.all(s.docs.map(d => d.ref.delete())); }
}
const criar = (id, extra) => db.collection(COL_INAD).doc(id).set({ nome: id, status: "Inadimplente", statusOrigem: "planilha", observacoes: [], ...extra });
const ler = async id => (await db.collection(COL_INAD).doc(id).get()).data();

function chamar(handler, { auth = `Bearer ${SEGREDO}`, method = "GET", url = "/api/vindi/diaria" } = {}) {
  return new Promise(async resolve => {
    const res = { statusCode: 200, setHeader() { return this; }, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
    await handler({ method, url, headers: { host: "app.exemplo", ...(auth ? { authorization: auth } : {}) } }, res);
  });
}
const handler = (cliente, extra = {}) => {
  const disparos = [];
  const h = criarHandlerDiaria({ getDb: () => db, lerConfig: () => CFG, criarCliente: () => cliente, lerSegredo: () => SEGREDO,
    fetchImpl: async (url, opt) => { disparos.push({ url, auth: opt.headers.Authorization }); return { ok: true }; }, ...extra });
  return { h, disparos };
};

beforeEach(limpar);
after(limpar);

test("segurança: sem CRON_SECRET → 503; token errado ou ausente → 401; POST → 405", async () => {
  const sem = criarHandlerDiaria({ getDb: () => db, lerConfig: () => CFG, criarCliente: () => vindiFake(), lerSegredo: () => "" });
  assert.equal((await chamar(sem)).status, 503);
  const { h } = handler(vindiFake());
  assert.equal((await chamar(h, { auth: "Bearer errado" })).status, 401);
  assert.equal((await chamar(h, { auth: null })).status, 401);
  assert.equal((await chamar(h, { method: "POST" })).status, 405);
  assert.equal(autorizado(`Bearer curto`, "curto"), false, "segredo curto demais nunca vale");
});

test("sincroniza quem nunca foi consultado (ex.: importado depois) e regulariza quem já pagou", async () => {
  await criar("inad-1", { idFatura: "700" });                       // como o Alexandre: só o ID da planilha
  const v = vindiFake({ faturas: [billC(1, 700, 1, "2026-09-10", "paid", "2026-09-10"), billC(2, 700, 2, "2026-10-10", "paid", "2026-10-14")] });
  const { h, disparos } = handler(v);
  const r = await chamar(h);
  assert.equal(r.status, 200);
  assert.equal(r.body.processados, 1);
  assert.deepEqual(r.body.mudancas, [{ id: "inad-1", de: "Inadimplente", para: "Regularizado" }]);
  assert.equal(disparos.length, 0, "terminou: não chama outra rodada");
  const d = await ler("inad-1");
  assert.equal(d.status, "Regularizado");
  assert.equal(d.vindi.historico["2"].situacao, "pagaAtraso");
  const log = (await db.collection(COL_SINC).get()).docs[0].data();
  assert.equal(log.origem, "diaria");
});

test("fatura que venceu sem pagamento (sem webhook) → volta a Inadimplente", async () => {
  await criar("inad-1", { idFatura: "700", status: "Regularizado", statusOrigem: "vindi", vindi: { assinaturaId: "700", ultimaTentativa: "2026-01-01T00:00:00Z" } });
  const { h } = handler(vindiFake({ faturas: [billC(1, 700, 1, "2026-09-10", "paid", "2026-09-10"), billC(2, 700, 2, "2026-10-10")] }));
  await chamar(h);
  assert.equal((await ler("inad-1")).status, "Inadimplente");
});

test("fila: pula quem foi tentado nas últimas 18 h, cancelamento já registrado e registro sem ID; mais antigo primeiro", () => {
  const agora = Date.parse("2026-10-21T06:00:00Z");
  const regs = [
    { id: "recente", idFatura: "1", vindi: { assinaturaId: "1", ultimaTentativa: "2026-10-21T01:00:00Z" } },
    { id: "ontem", idFatura: "2", vindi: { assinaturaId: "2", ultimaTentativa: "2026-10-20T10:00:00Z" } },
    { id: "nunca", idFatura: "3" },
    { id: "cancelado", status: "Cancelado", idFatura: "4", vindi: { assinaturaId: "4", cancelamento: { em: "x" }, ultimaTentativa: "2026-10-01T00:00:00Z" } },
    { id: "semId", nome: "x" },
    { id: "link", vindiUrl: "https://app.vindi.com.br/customer/bills/555?token=t" },
  ];
  assert.deepEqual(candidatos(regs, agora).map(r => r.id), ["nunca", "link", "ontem"]);
});

test("tempo esgotado: processa o que dá e dispara a próxima rodada com o mesmo segredo", async () => {
  for (const n of [1, 2, 3]) await criar(`inad-${n}`, { idFatura: String(700 + n) });
  const faturas = [1, 2, 3].map(n => billC(n, 700 + n, 1, "2026-09-10", "paid", "2026-09-10"));
  let t = 0;
  const { h, disparos } = handler(vindiFake({ faturas }), { orcamentoMs: 1, relogio: () => (t += 1) });
  const r = await chamar(h);
  assert.equal(r.body.processados, 1);
  assert.equal(r.body.restantes, 2);
  assert.equal(disparos.length, 1);
  assert.equal(disparos[0].url, "https://app.exemplo/api/vindi/diaria?rodada=2");
  assert.equal(disparos[0].auth, `Bearer ${SEGREDO}`);
  // a rodada seguinte não repete quem já foi feito
  const r2 = await chamar(h, { url: "/api/vindi/diaria?rodada=2" });
  assert.equal(r2.body.naFila, 2);
});

test("limite de rodadas: na última rodada não dispara outra", async () => {
  for (const n of [1, 2]) await criar(`inad-${n}`, { idFatura: String(700 + n) });
  let t = 0;
  const { h, disparos } = handler(vindiFake({ faturas: [1, 2].map(n => billC(n, 700 + n, 1, "2026-09-10", "paid", "2026-09-10")) }), { orcamentoMs: 1, relogio: () => (t += 1) });
  const r = await chamar(h, { url: `/api/vindi/diaria?rodada=${MAX_RODADAS}` });
  assert.equal(r.body.restantes, 1);
  assert.equal(disparos.length, 0);
});

test("Vindi fora do ar: interrompe a rodada, não dispara outra e preserva os dados", async () => {
  for (const n of [1, 2, 3]) await criar(`inad-${n}`, { idFatura: String(700 + n) });
  const { h, disparos } = handler(vindiFake({ falhar: true }));
  const r = await chamar(h);
  assert.equal(r.body.interrompido, "indisponivel");
  assert.equal(r.body.processados, 1, "parou no primeiro erro geral");
  assert.equal(disparos.length, 0);
  assert.equal((await ler("inad-2")).status, "Inadimplente");
});
