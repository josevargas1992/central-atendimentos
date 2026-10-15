// Integração Vindi — cenários obrigatórios da especificação, com a API da Vindi SIMULADA
// e o Firestore no emulador local (nenhuma chamada real, nenhum dado real).
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../server/firebaseAdmin.js";
import { criarClienteVindi, ErroVindi } from "../server/vindi/cliente.js";
import { apurarFaturas, decidirStatus, centavos, dataSP } from "../server/vindi/apuracao.js";
import { sincronizarRegistro, localizarRegistro, faturaDoLink, COL_INAD, COL_SINC, COL_EVENTOS } from "../server/vindi/processar.js";
import { criarHandlerWebhook, credenciaisValidas } from "../server/vindi/webhook.js";

const AGORA = new Date("2026-10-14T15:00:00-03:00");
const db = getDb();

// ── Vindi simulada ────────────────────────────────────────────────────
// bill(id, venc "AAAA-MM-DD", status, valor, pagoEm?) no formato da API
const bill = (id, venc, status = "pending", valor = "100.0", pagoEm = null, upd = "2026-10-01T10:00:00-03:00") => ({
  id, amount: valor, status, due_at: `${venc}T00:00:00.000-03:00`, updated_at: upd, subscription: { id: 5001 },
  charges: pagoEm ? [{ id: id * 10, status: "paid", paid_at: `${pagoEm}T10:00:00.000-03:00` }] : [{ id: id * 10, status: "pending" }],
});
function vindiFake({ assinaturas = {}, faturas = [], falhar = false } = {}) {
  const chamadas = [];
  const erro = () => { throw new ErroVindi("indisponivel", "A API da Vindi está temporariamente indisponível."); };
  return {
    chamadas,
    async assinatura(id) { chamadas.push(["assinatura", String(id)]); if (falhar) erro(); return assinaturas[String(id)] || null; },
    async fatura(id) { chamadas.push(["fatura", String(id)]); if (falhar) erro(); return faturas.find(b => String(b.id) === String(id)) || null; },
    async faturasDaAssinatura(id) { chamadas.push(["faturas", String(id)]); if (falhar) erro(); return faturas.filter(b => String(b.subscription?.id) === String(id)); },
  };
}
const SUB = { "5001": { id: 5001, status: "active" } };

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
const ler = async (id = "inad-1") => (await db.collection(COL_INAD).doc(id).get()).data();
const sinc = (registro, cliente, extra = {}) => sincronizarRegistro({ db, cliente, registro, origem: "manual", ambiente: "producao", agora: AGORA, ...extra });

beforeEach(limpar);
after(limpar);

// ── Apuração (regras puras) ───────────────────────────────────────────

test("valores em centavos sem erro de arredondamento e datas no fuso de São Paulo", () => {
  assert.equal(centavos("100.0"), 10000);
  assert.equal(centavos("0.1"), 10);
  assert.equal(centavos("1234.56"), 123456);
  assert.equal(centavos("99.995"), 10000);
  assert.equal(centavos("abc"), null);
  assert.equal(dataSP("2026-10-01T01:30:00Z"), "2026-09-30", "01h30 UTC ainda é dia 30 em SP");
});

test("cenário 3: faturas futuras (ou vencendo hoje) não contam como inadimplência", () => {
  const ap = apurarFaturas([bill(1, "2026-10-14"), bill(2, "2026-11-10"), bill(3, "2026-10-13")], AGORA);
  assert.equal(ap.vencidas.qtd, 1);
  assert.equal(ap.vencidas.maisAntiga.id, 3);
  assert.equal(ap.abertasNaoVencidas, 2);
});

test("indicadores: mais antiga, mais recente, total vencido, dias desde a mais antiga, última paga", () => {
  const ap = apurarFaturas([bill(1, "2026-07-10", "paid", "80.0", "2026-07-12"), bill(2, "2026-08-10", "pending", "80.5"), bill(3, "2026-09-10", "pending", "80.5"), bill(4, "2026-09-15", "canceled")], AGORA);
  assert.equal(ap.vencidas.qtd, 2);
  assert.equal(ap.vencidas.valorCentavos, 16100);
  assert.equal(ap.vencidas.maisAntiga.vencimento, "2026-08-10");
  assert.equal(ap.vencidas.maisRecente.vencimento, "2026-09-10");
  assert.equal(ap.vencidas.diasDesdeMaisAntiga, 65);
  assert.deepEqual(ap.ultimaPaga, { id: 1, valorCentavos: 8000, pagoEm: "2026-07-12" });
  assert.equal(ap.confiavel, true);
});

test("pendente sem vencimento: apuração NÃO é confiável e o status não muda", () => {
  const b = { ...bill(1, "2026-08-10"), due_at: null };
  const ap = apurarFaturas([b], AGORA);
  assert.equal(ap.confiavel, false);
  assert.deepEqual(decidirStatus({ status: "Inadimplente", statusOrigem: "planilha", apuracao: ap, consultaCompleta: true }), { novoStatus: null, divergencia: null });
});

// ── Cenários obrigatórios ─────────────────────────────────────────────

test("cenário 1: três faturas vencidas e paga apenas uma → permanece Inadimplente", async () => {
  const reg = await criarInad();
  const v = vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-07-10", "paid", "100.0", "2026-10-13"), bill(2, "2026-08-10"), bill(3, "2026-09-10")] });
  const r = await sinc(reg, v);
  assert.equal(r.resultado, "ok");
  const d = await ler();
  assert.equal(d.status, "Inadimplente");
  assert.equal(d.vindi.vencidasQtd, 2);
  assert.equal(d.vindi.vencidoCentavos, 20000);
  assert.equal(d.vindi.ultimaPaga.pagoEm, "2026-10-13");
});

test("cenário 2: paga todas as vencidas → passa a Regularizado (origem vindi)", async () => {
  const reg = await criarInad();
  const v = vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-08-10", "paid", "100.0", "2026-10-01"), bill(2, "2026-09-10", "paid", "100.0", "2026-10-13"), bill(3, "2026-11-10")] });
  await sinc(reg, v);
  const d = await ler();
  assert.equal(d.status, "Regularizado");
  assert.equal(d.statusOrigem, "vindi");
  assert.equal(d.vindi.vencidasQtd, 0);
  assert.equal(d.vindi.abertasNaoVencidas, 1, "fatura futura continua em aberto, mas não é inadimplência");
});

test("Regularizado pela Vindi volta a Inadimplente se surgir nova fatura vencida", async () => {
  const reg = await criarInad({ status: "Regularizado", statusOrigem: "vindi" });
  await sinc(reg, vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-09-10")] }));
  assert.equal((await ler()).status, "Inadimplente");
});

test("status definido manualmente nunca é trocado; divergência é sinalizada", async () => {
  const reg = await criarInad({ status: "Regularizado", statusOrigem: "manual" });
  await sinc(reg, vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-09-10")] }));
  const d = await ler();
  assert.equal(d.status, "Regularizado");
  assert.match(d.vindi.divergencia, /definido manualmente/);
});

test("cenário 7: assinatura cancelada com dívida pendente → NÃO é considerada quitada", async () => {
  const reg = await criarInad();
  await sinc(reg, vindiFake({ assinaturas: { "5001": { id: 5001, status: "canceled" } }, faturas: [bill(1, "2026-08-10"), bill(2, "2026-09-10", "canceled")] }));
  const d = await ler();
  assert.equal(d.status, "Inadimplente");
  assert.equal(d.vindi.assinaturaStatus, "canceled");
  assert.equal(d.vindi.vencidasQtd, 1);
});

test("cenário 6: falha na API → preserva os dados financeiros anteriores e não regulariza", async () => {
  const reg = await criarInad();
  await sinc(reg, vindiFake({ assinaturas: SUB, faturas: [bill(2, "2026-08-10"), bill(3, "2026-09-10")] }));
  const antes = await ler();
  const r = await sinc(antes, vindiFake({ falhar: true }));
  assert.equal(r.resultado, "erro");
  const d = await ler();
  assert.equal(d.status, "Inadimplente");
  assert.equal(d.vindi.vencidasQtd, 2, "mantém os últimos dados confiáveis");
  assert.equal(d.vindi.ultimaSincronizacao, antes.vindi.ultimaSincronizacao);
  assert.equal(d.vindi.sincStatus, "erro");
  assert.match(d.vindi.sincErro, /indisponível/);
});

test("cenário 8: atualização manual consulta a assinatura correta (IDAssinatura primeiro)", async () => {
  const reg = await criarInad({ vindiUrl: "https://app.vindi.com.br/customer/bills/999?token=SEGREDO" });
  const v = vindiFake({ assinaturas: SUB, faturas: [bill(2, "2026-08-10")] });
  await sinc(reg, v);
  assert.deepEqual(v.chamadas, [["assinatura", "5001"], ["faturas", "5001"]], "usou o IDAssinatura e não precisou da fatura do link");
  const d = await ler();
  assert.equal(d.vindi.assinaturaId, "5001");
  assert.equal(d.vindi.vinculadoPor, "IDAssinatura");
});

test("se o ID da coluna não for assinatura, chega nela pela fatura do link", async () => {
  const reg = await criarInad({ idFatura: "123", vindiUrl: "https://app.vindi.com.br/customer/bills/2?token=X" });
  const v = vindiFake({ assinaturas: SUB, faturas: [bill(2, "2026-08-10")] });
  await sinc(reg, v);
  assert.equal((await ler()).vindi.assinaturaId, "5001");
});

test("cenário 9: registro sem ID financeiro → informa que não foi possível localizar", async () => {
  const reg = await criarInad({ idFatura: "", vindiUrl: "" });
  const r = await sinc(reg, vindiFake({ assinaturas: SUB }));
  assert.equal(r.resultado, "sem_identificador");
  assert.match(r.mensagem, /Não foi possível localizar a assinatura ou fatura/);
  assert.equal((await ler()).status, "Inadimplente");
});

test("cenário 10: observações, compromisso, importante, responsável e parcelas do Excel ficam intactos", async () => {
  const reg = await criarInad();
  await sinc(reg, vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-08-10", "paid", "100.0", "2026-10-01")] }));
  const d = await ler();
  assert.equal(d.status, "Regularizado");
  for (const k of ["observacoes", "agendamento", "prioridade", "responsavelId", "parcelas", "nome", "email", "idFatura"]) assert.deepEqual(d[k], reg[k], k);
});

test("ambiente sandbox nunca altera o inadimplente — só registra no histórico como teste", async () => {
  const reg = await criarInad();
  const r = await sinc(reg, vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-08-10", "paid", "100.0", "2026-10-01")] }), { ambiente: "sandbox" });
  assert.equal(r.resultado, "teste");
  const d = await ler();
  assert.equal(d.status, "Inadimplente");
  assert.equal(d.vindi, undefined);
  const logs = (await db.collection(COL_SINC).get()).docs.map(x => x.data());
  assert.equal(logs.length, 1);
  assert.equal(logs[0].resultado, "teste");
});

test("histórico não guarda link, token nem chave", async () => {
  const reg = await criarInad({ vindiUrl: "https://app.vindi.com.br/customer/bills/999?token=SEGREDO" });
  await sinc(reg, vindiFake({ assinaturas: SUB, faturas: [bill(2, "2026-08-10")] }));
  const tudo = JSON.stringify((await db.collection(COL_SINC).get()).docs.map(x => x.data()));
  assert.ok(!tudo.includes("SEGREDO") && !tudo.includes("vindi.com.br"));
});

// ── Webhook ───────────────────────────────────────────────────────────

const CFG = { ambiente: "producao", apiKey: "chave-teste", baseUrl: "https://x", webhookUsuario: "vindi", webhookSenha: "s3nh4-forte", apiConfigurada: true, webhookConfigurado: true };
const basic = (u, s) => "Basic " + Buffer.from(`${u}:${s}`).toString("base64");
function chamar(handler, { body, auth = basic("vindi", "s3nh4-forte"), method = "POST" }) {
  return new Promise(async resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
    await handler({ method, headers: auth ? { authorization: auth } : {}, body }, res);
  });
}
const payload = (tipo, b) => ({ event: { type: tipo, created_at: "2026-10-14T10:00:00.000-03:00", data: { bill: b } } });
const handlerCom = cliente => criarHandlerWebhook({ getDb: () => db, lerConfig: () => CFG, criarCliente: () => cliente });

test("webhook: sem credencial ou com senha errada → 401, nada é gravado", async () => {
  const h = handlerCom(vindiFake());
  assert.equal((await chamar(h, { body: payload("bill_paid", bill(1, "2026-08-10", "paid")), auth: null })).status, 401);
  assert.equal((await chamar(h, { body: payload("bill_paid", bill(1, "2026-08-10", "paid")), auth: basic("vindi", "errada") })).status, 401);
  assert.equal((await db.collection(COL_EVENTOS).get()).size, 0);
  assert.equal(credenciaisValidas(basic("vindi", "s3nh4-forte"), "vindi", "s3nh4-forte"), true);
});

test("webhook: formato inválido → 400; método GET → 405; sem configuração → 503", async () => {
  const h = handlerCom(vindiFake());
  assert.equal((await chamar(h, { body: { foo: 1 } })).status, 400);
  assert.equal((await chamar(h, { body: "{não é json" })).status, 400);
  assert.equal((await chamar(h, { body: {}, method: "GET" })).status, 405);
  const semCfg = criarHandlerWebhook({ getDb: () => db, lerConfig: () => ({ ...CFG, webhookConfigurado: false }), criarCliente: () => null });
  assert.equal((await chamar(semCfg, { body: payload("bill_paid", bill(1, "2026-08-10", "paid")) })).status, 503);
});

test("webhook bill_paid: grava o evento, confirma pela API e atualiza o registro", async () => {
  await criarInad();
  const v = vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-08-10", "paid", "100.0", "2026-10-14"), bill(2, "2026-09-10")] });
  const r = await chamar(handlerCom(v), { body: payload("bill_paid", bill(1, "2026-08-10", "paid", "100.0", "2026-10-14")) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { recebido: true, processamento: "em andamento" });
  const d = await ler();
  assert.equal(d.status, "Inadimplente", "pagou uma, ainda tem outra vencida");
  assert.equal(d.vindi.vencidasQtd, 1);
  const ev = (await db.collection(COL_EVENTOS).get()).docs[0].data();
  assert.equal(ev.status, "processado");
  assert.ok(!JSON.stringify(ev).includes("c@x.com"), "e-mail do cliente não fica guardado no evento");
});

test("cenário 4: webhook duplicado não duplica nada", async () => {
  await criarInad();
  const v = vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-08-10", "paid", "100.0", "2026-10-14")] });
  const h = handlerCom(v);
  const p = payload("bill_paid", bill(1, "2026-08-10", "paid", "100.0", "2026-10-14"));
  await chamar(h, { body: p });
  const r2 = await chamar(h, { body: p });
  assert.deepEqual(r2.body, { recebido: true, duplicado: true });
  assert.equal((await db.collection(COL_EVENTOS).get()).size, 1);
  assert.equal((await db.collection(COL_SINC).get()).size, 1, "uma única sincronização");
  assert.equal((await ler()).status, "Regularizado");
});

test("cenário 5: webhook antigo chegando depois não reverte dados mais recentes", async () => {
  await criarInad();
  // Estado atual na Vindi: tudo pago (atualizado em 14/10)
  const atual = [bill(1, "2026-08-10", "paid", "100.0", "2026-10-14", "2026-10-14T09:00:00-03:00")];
  const h = handlerCom(vindiFake({ assinaturas: SUB, faturas: atual }));
  await chamar(h, { body: payload("bill_paid", atual[0]) });
  assert.equal((await ler()).status, "Regularizado");
  // Chega atrasado um evento ANTIGO (fatura ainda pendente em agosto)
  const antigo = { event: { type: "bill_overdue", created_at: "2026-08-11T08:00:00.000-03:00", data: { bill: bill(1, "2026-08-10", "pending", "100.0", null, "2026-08-11T08:00:00-03:00") } } };
  await chamar(h, { body: antigo });
  const d = await ler();
  assert.equal(d.status, "Regularizado", "o webhook antigo só dispara nova consulta; a API confirma que está pago");
  assert.equal(d.vindi.vencidasQtd, 0);
});

test("API devolvendo dados mais antigos que os gravados → ignorado", async () => {
  const reg = await criarInad({ vindi: { atualizadoFonte: "2026-10-14T09:00:00-03:00", vencidasQtd: 0, assinaturaId: "5001" } });
  const r = await sinc(reg, vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-08-10", "pending", "100.0", null, "2026-08-11T08:00:00-03:00")] }));
  assert.equal(r.resultado, "ignorado_antigo");
  assert.equal((await ler()).vindi.vencidasQtd, 0);
});

test("evento de assinatura/fatura sem inadimplente correspondente → registrado como não vinculado", async () => {
  await criarInad();
  const outra = { ...bill(77, "2026-08-10", "paid", "100.0", "2026-10-14"), subscription: { id: 9999 }, customer: { email: "outro@x.com" } };
  await chamar(handlerCom(vindiFake({ assinaturas: { "9999": { id: 9999, status: "active" } }, faturas: [outra] })), { body: payload("bill_paid", outra) });
  const ev = (await db.collection(COL_EVENTOS).get()).docs[0].data();
  assert.equal(ev.status, "nao_vinculado");
  assert.equal((await ler()).vindi, undefined);
});

test("localização: nunca escolhe quando há mais de um registro possível", () => {
  const regs = [{ id: "a", email: "x@x.com" }, { id: "b", email: "x@x.com" }];
  assert.equal(localizarRegistro(regs, { email: "x@x.com" }).registro, null);
  assert.equal(faturaDoLink("https://app.vindi.com.br/customer/bills/123456789?token=abc"), "123456789");
});

// ── Cliente da API (fetch simulado) ───────────────────────────────────

function fetchFake(respostas) {
  const urls = [];
  return { urls, fn: async (url, opts) => {
    urls.push({ url, auth: opts.headers.Authorization });
    const r = respostas.shift();
    if (r instanceof Error) throw r;
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status || 200, headers: r.headers || {} });
  } };
}
const cli = (f, extra = {}) => criarClienteVindi({ apiKey: "KEY123", baseUrl: "https://sandbox-app.vindi.com.br/api/v1", fetchImpl: f.fn, esperar: async () => {}, ...extra });

test("cliente: autenticação Basic com a chave como usuário e senha vazia", async () => {
  const f = fetchFake([{ body: { subscription: { id: 5001, status: "active" } } }]);
  const s = await cli(f).assinatura(5001);
  assert.equal(s.id, 5001);
  assert.equal(f.urls[0].auth, "Basic " + Buffer.from("KEY123:").toString("base64"));
  assert.equal(f.urls[0].url, "https://sandbox-app.vindi.com.br/api/v1/subscriptions/5001");
});

test("cliente: aceita objeto embrulhado ou direto; 404 → null", async () => {
  const f = fetchFake([{ body: { id: 1, status: "paid" } }, { status: 404, body: { errors: [] } }]);
  const c = cli(f);
  assert.equal((await c.fatura(1)).status, "paid");
  assert.equal(await c.fatura(2), null);
});

test("cliente: paginação segue o cabeçalho Link e filtra por subscription_id", async () => {
  const f = fetchFake([
    { body: { bills: [{ id: 1 }, { id: 2 }] }, headers: { Link: '<https://sandbox-app.vindi.com.br/api/v1/bills?page=2&per_page=50>; rel="next"' } },
    { body: { bills: [{ id: 3 }] } },
  ]);
  const lista = await cli(f).faturasDaAssinatura(5001);
  assert.deepEqual(lista.map(b => b.id), [1, 2, 3]);
  const u = new URL(f.urls[0].url);
  assert.equal(u.searchParams.get("query"), "subscription_id=5001");
  assert.equal(u.searchParams.get("per_page"), "50");
});

test("cliente: não segue Link para outro domínio", async () => {
  const f = fetchFake([{ body: { bills: [{ id: 1 }] }, headers: { Link: '<https://malicioso.com/x>; rel="next"' } }]);
  assert.equal((await cli(f).faturasDaAssinatura(5001)).length, 1);
  assert.equal(f.urls.length, 1);
});

test("cliente: 429 espera o Retry-After e tenta de novo; 401 → erro de credenciais", async () => {
  const esperas = [];
  const f = fetchFake([{ status: 429, headers: { "Retry-After": "7" } }, { body: { id: 1 } }]);
  assert.equal((await cli(f, { esperar: async ms => esperas.push(ms) }).fatura(1)).id, 1);
  assert.deepEqual(esperas, [7000]);
  await assert.rejects(cli(fetchFake([{ status: 401 }])).fatura(1), e => e.codigo === "credenciais" && !e.message.includes("KEY123"));
});

test("cliente: falha de rede e 5xx repetidos viram erro tratável, sem vazar a chave", async () => {
  await assert.rejects(cli(fetchFake([new TypeError("x"), new TypeError("x"), new TypeError("x")])).fatura(1), e => e.codigo === "rede");
  await assert.rejects(cli(fetchFake([{ status: 503 }, { status: 503 }, { status: 503 }])).fatura(1), e => e.codigo === "indisponivel" && !e.message.includes("KEY123"));
});

test("cliente: sem chave ou ambiente → erro de configuração", () => {
  assert.throws(() => criarClienteVindi({ apiKey: "", baseUrl: "https://x" }), e => e.codigo === "config");
});

// ── Endpoints do app (botão manual e painel do Admin) ─────────────────
import { criarHandlerSincronizar, criarHandlerStatus } from "../server/vindi/endpoints.js";

const limparTravas = async () => { const s = await db.collection("vindi_travas").get(); await Promise.all(s.docs.map(d => d.ref.delete())); };
const hSinc = (cliente, cfg = CFG) => criarHandlerSincronizar({ getDb: () => db, lerConfig: () => cfg, criarCliente: () => cliente });
const hStatus = (cliente, cfg = CFG) => criarHandlerStatus({ getDb: () => db, lerConfig: () => cfg, criarCliente: () => cliente });
const req = (body, extra = {}) => ({ method: "POST", headers: { host: "central.exemplo.app" }, body, ...extra });
function chamarSimples(handler, r) {
  return new Promise(async resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
    await handler(r, res);
  });
}

test("botão manual: atualiza e informa; clique repetido logo em seguida é recusado (sem duplicar)", async () => {
  await limparTravas(); await criarInad();
  const v = vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-08-10")] });
  const [a, b] = await Promise.all([chamarSimples(hSinc(v), req({ inadId: "inad-1" })), chamarSimples(hSinc(v), req({ inadId: "inad-1" }))]);
  const st = [a.status, b.status].sort();
  assert.deepEqual(st, [200, 409], "duas chamadas simultâneas: uma executa, a outra é barrada");
  assert.equal((await db.collection(COL_SINC).get()).size, 1);
  assert.equal((await ler()).vindi.vencidasQtd, 1);
});

test("botão manual: registro sem ID → mensagem clara (422); sem configuração → 503", async () => {
  await limparTravas(); await criarInad({ idFatura: "", vindiUrl: "" });
  const r = await chamarSimples(hSinc(vindiFake()), req({ inadId: "inad-1" }));
  assert.equal(r.status, 422);
  assert.match(r.body.mensagem, /Não foi possível localizar/);
  const s = await chamarSimples(hSinc(vindiFake(), { ...CFG, apiConfigurada: false }), req({ inadId: "inad-1" }));
  assert.equal(s.status, 503);
});

test("botão manual em sandbox: avisa que é teste e não altera o registro", async () => {
  await limparTravas(); await criarInad();
  const r = await chamarSimples(hSinc(vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-08-10", "paid", "100.0", "2026-10-01")] }), { ...CFG, ambiente: "sandbox" }), req({ inadId: "inad-1" }));
  assert.equal(r.body.resultado, "teste");
  assert.equal((await ler()).status, "Inadimplente");
});

test("botão manual com falha na Vindi: 502 e mensagem dizendo que os dados foram mantidos", async () => {
  await limparTravas(); await criarInad();
  const r = await chamarSimples(hSinc(vindiFake({ falhar: true })), req({ inadId: "inad-1" }));
  assert.equal(r.status, 502);
  assert.match(r.body.mensagem, /dados anteriores foram mantidos/);
});

test("status do Admin: nunca expõe a chave nem a senha do webhook", async () => {
  const r = await chamarSimples(hStatus(vindiFake()), req(undefined, { method: "GET" }));
  const txt = JSON.stringify(r.body);
  assert.ok(!txt.includes("chave-teste") && !txt.includes("s3nh4-forte"));
  assert.equal(r.body.chaveFinal, "••••este");
  assert.equal(r.body.webhookUrl, "https://USUARIO:SENHA@central.exemplo.app/api/vindi/webhook");
});

test("Admin: reprocessa eventos que ficaram pendentes (ex.: falha da API na hora do webhook)", async () => {
  await limparTravas(); await criarInad();
  const p = payload("bill_paid", bill(1, "2026-08-10", "paid", "100.0", "2026-10-14"));
  await chamar(handlerCom(vindiFake({ falhar: true })), { body: p });
  assert.equal((await db.collection(COL_EVENTOS).get()).docs[0].data().status, "erro");
  assert.equal((await ler()).status, "Inadimplente", "falha não regulariza");
  const r = await chamarSimples(hStatus(vindiFake({ assinaturas: SUB, faturas: [bill(1, "2026-08-10", "paid", "100.0", "2026-10-14")] })), req({ acao: "reprocessar" }));
  assert.match(r.body.mensagem, /1 evento\(s\) reprocessado/);
  assert.equal((await ler()).status, "Regularizado");
});
