// Testes de segurança dos dados — rodam SOMENTE no emulador local do Firestore
// (projeto "demo-central", sem nenhuma ligação com o banco real).
// Uso: npm test
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase/app";
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDocs, setDoc, writeBatch,
  disableNetwork, terminate,
} from "firebase/firestore";
import { loadOrSeed, saveItem, createRecord } from "../src/data.js";

const PROJECT = "demo-central-testes";
// Porta definida pelo "firebase emulators:exec" (firebase.test.json) — separada da do modo seguro.
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");

// Cada "cliente" simula um navegador diferente (um atendente).
const clients = [];
function newClient(name) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "demo" }, `${name}-${clients.length}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, +PORT);
  clients.push(db);
  return db;
}

const ids = async (db, col) => (await getDocs(collection(db, col))).docs.map(d => d.id).sort();

beforeEach(async () => {
  const r = await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  assert.ok(r.ok, "não consegui limpar o emulador");
});

after(async () => { await Promise.all(clients.map(db => terminate(db).catch(() => {}))); });

const REAIS   = ["ana-paula", "bruno", "carla", "diego", "elisa"].map(id => ({ id, name: id, password: "real" }));
const PADROES = [{ id: "gabriele", name: "Gabriele", password: "gabi123" }];

async function gravarReais(db) {
  const b = writeBatch(db);
  REAIS.forEach(e => b.set(doc(db, "employees", e.id), e));
  await b.commit();
}

// ── Risco 1: gravação de listas apagando dados ─────────────────────────────

test("comportamento ANTIGO: salvar com a lista padrão apagava os atendentes reais", async () => {
  const db = newClient("antigo");
  await gravarReais(db);
  // syncCol antigo: apaga tudo o que não está na lista enviada
  const lista = [...PADROES, { id: "novo", name: "Novo" }];
  const snap = await getDocs(collection(db, "employees"));
  const b = writeBatch(db);
  const kept = new Set(lista.map(x => x.id));
  snap.docs.forEach(d => { if (!kept.has(d.id)) b.delete(d.ref); });
  lista.forEach(x => b.set(doc(db, "employees", x.id), x));
  await b.commit();
  const restantes = await ids(db, "employees");
  assert.ok(REAIS.every(e => !restantes.includes(e.id)), "esperado: os 5 reais foram apagados (bug)");
});

test("NOVO: salvar um atendente não apaga nenhum outro", async () => {
  const db = newClient("novo");
  await gravarReais(db);
  await saveItem(db, "employees", { id: "novo", name: "Novo" });
  assert.deepEqual(await ids(db, "employees"), [...REAIS.map(e => e.id), "novo"].sort());
});

test("NOVO: com dados reais no banco, os padrões não são gravados", async () => {
  const db = newClient("seed-real");
  await gravarReais(db);
  let seedChamado = false;
  const res = await loadOrSeed(db, "employees", () => { seedChamado = true; });
  assert.equal(seedChamado, false);
  assert.equal(res.length, REAIS.length);
});

test("NOVO: banco realmente vazio recebe os dados iniciais", async () => {
  const db = newClient("seed-vazio");
  const res = await loadOrSeed(db, "employees", b => PADROES.forEach(e => b.set(doc(db, "employees", e.id), e)));
  assert.equal(res, null);
  assert.deepEqual(await ids(db, "employees"), ["gabriele"]);
});

test("NOVO: sem conexão, a leitura FALHA e nenhum dado padrão é gravado", { timeout: 30000 }, async () => {
  const offline = newClient("offline");
  await disableNetwork(offline);
  let seedChamado = false;
  await assert.rejects(loadOrSeed(offline, "employees", () => { seedChamado = true; }));
  assert.equal(seedChamado, false, "não pode tentar gravar padrões sem confirmar no servidor");
  const online = newClient("conferencia");
  assert.deepEqual(await ids(online, "employees"), []);
});

// ── Risco 2: dois atendentes salvando ao mesmo tempo ──────────────────────

const PAGE = "page-teste";
const N = 15; // registros por atendente, todos disparados ao mesmo tempo

test("comportamento ANTIGO: salvar ao mesmo tempo sobrescrevia registros", async () => {
  const a = newClient("antigo-a"), b = newClient("antigo-b");
  // Os dois atendentes veem a mesma lista (vazia) e calculam o mesmo próximo número.
  const salvar = (db, quem, i) => setDoc(doc(db, "records", `${PAGE}-${1 + i}`), { id: 1 + i, pageId: PAGE, cliente: `${quem}-${i}` });
  await Promise.all(Array.from({ length: N }, (_, i) => [salvar(a, "A", i), salvar(b, "B", i)]).flat());
  const total = (await ids(a, "records")).length;
  assert.ok(total < 2 * N, `esperado perder registros (bug); ficaram ${total} de ${2 * N}`);
});

test("NOVO: dois atendentes salvando ao mesmo tempo — nenhum registro se perde", { timeout: 60000 }, async () => {
  const a = newClient("novo-a"), b = newClient("novo-b");
  const criar = (db, quem, i) => createRecord(db, PAGE, { cliente: `${quem}-${i}`, status: "Em atendimento" }, 1);
  const criados = await Promise.all(Array.from({ length: N }, (_, i) => [criar(a, "A", i), criar(b, "B", i)]).flat());

  const snap = await getDocs(collection(a, "records"));
  const docs = snap.docs.map(d => d.data());
  assert.equal(docs.length, 2 * N, "todos os registros devem existir");
  assert.equal(new Set(criados).size, 2 * N, "cada registro recebeu um número único");
  assert.equal(new Set(docs.map(d => d.cliente)).size, 2 * N, "nenhum registro foi sobrescrito");
  for (const d of snap.docs) assert.equal(d.id, `${PAGE}-${d.data().id}`, "id do documento bate com o número");
});

// ── Contadores das planilhas via contagem do Firestore ─────────────────
import { contarPagina } from "../src/data.js";

test("contagem dos cartões dá os mesmos números que contar registro por registro", async () => {
  const db = newClient("contagem");
  const tipos = ["Ofício Órgão", "Outro", "Órgão Público"];
  const status = ["Resolvido", "Em atendimento", "Pendente"];
  const b = writeBatch(db);
  const recs = [];
  for (let i = 1; i <= 60; i++) {
    const r = { id: i, pageId: i % 4 === 0 ? "outra" : "pg1", status: status[i % 3], tipo: tipos[i % 3] };
    recs.push(r); b.set(doc(db, "records", `${r.pageId}-${i}`), r);
  }
  await b.commit();
  const orgao = ["Ofício Órgão", "Órgão Público"];
  const daPg = recs.filter(r => r.pageId === "pg1");
  const esperado = {
    total: daPg.length,
    resolved: daPg.filter(r => r.status === "Resolvido").length,
    inProgress: daPg.filter(r => r.status === "Em atendimento").length,
    opAbertos: daPg.filter(r => orgao.includes(r.tipo) && r.status !== "Resolvido").length,
  };
  assert.deepEqual(await contarPagina(db, "pg1", orgao), esperado);
  assert.deepEqual(await contarPagina(db, "pg1", []), { ...esperado, opAbertos: 0 });
  assert.deepEqual(await contarPagina(db, "vazia", orgao), { total: 0, resolved: 0, inProgress: 0, opAbertos: 0 });
});
