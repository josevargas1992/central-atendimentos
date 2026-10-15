// Freshdesk (teste de conexão) e autorização de administrador — tudo simulado, sem rede e sem banco.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerConfigFreshdesk, testarConexaoFreshdesk } from "../server/freshdesk/cliente.js";
import { criarHandlerFreshdeskStatus } from "../server/freshdesk/endpoints.js";
import { verificarAdmin, lerAdminUids } from "../server/authAdmin.js";

const CHAVE = "CHAVE-SECRETA-123";
const TOKEN_ADMIN = "token.admin.valido.aaaaaaaaaaaaaaaaaaaa";
const TOKEN_COMUM = "token.atendente.valido.aaaaaaaaaaaaaaa";
const verificarToken = async t => {
  if (t === TOKEN_ADMIN) return { uid: "uid-admin" };
  if (t === TOKEN_COMUM) return { uid: "uid-atendente" };
  throw new Error("token inválido");
};
const resp = (status, corpo = { id: 1, contact: { name: "Agente", email: "agente@x.com" } }) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

// ── Configuração ──────────────────────────────────────────────────────

test("domínio: aceita subdomínio ou URL https do freshdesk; recusa outros", () => {
  assert.equal(lerConfigFreshdesk({ FRESHDESK_DOMINIO: "logikesoftwares", FRESHDESK_API_KEY: "k" }).baseUrl, "https://logikesoftwares.freshdesk.com/api/v2");
  assert.equal(lerConfigFreshdesk({ FRESHDESK_DOMINIO: "https://logikesoftwares.freshdesk.com", FRESHDESK_API_KEY: "k" }).baseUrl, "https://logikesoftwares.freshdesk.com/api/v2");
  for (const d of ["https://evil.com", "http://logikesoftwares.freshdesk.com", "logike.freshdesk.com.evil.com", "a b"]) {
    const c = lerConfigFreshdesk({ FRESHDESK_DOMINIO: d, FRESHDESK_API_KEY: "k" });
    assert.equal(c.configurado, false, d);
    assert.equal(c.dominioInvalido, true, d);
  }
  assert.equal(lerConfigFreshdesk({ FRESHDESK_DOMINIO: "logikesoftwares" }).configurado, false, "sem chave");
});

// ── Cliente ───────────────────────────────────────────────────────────

test("cliente: Basic com a chave como usuário e 'X' como senha, em GET /api/v2/agents/me", async () => {
  let chamada;
  const r = await testarConexaoFreshdesk({ baseUrl: "https://logikesoftwares.freshdesk.com/api/v2", apiKey: CHAVE,
    fetchImpl: async (url, opts) => { chamada = { url, opts }; return resp(200); } });
  assert.deepEqual(r, { ok: true }, "não devolve dados do agente");
  assert.equal(chamada.url, "https://logikesoftwares.freshdesk.com/api/v2/agents/me");
  assert.equal(chamada.opts.headers.Authorization, "Basic " + Buffer.from(`${CHAVE}:X`).toString("base64"));
  assert.equal(chamada.opts.method, undefined, "só leitura (GET padrão)");
});

test("cliente: erros traduzidos, sem vazar a chave", async () => {
  const casos = { 401: "credenciais", 403: "permissao", 404: "dominio", 302: "dominio", 429: "limite", 500: "indisponivel" };
  for (const [st, codigo] of Object.entries(casos)) {
    const r = await testarConexaoFreshdesk({ baseUrl: "https://x.freshdesk.com/api/v2", apiKey: CHAVE, fetchImpl: async () => new Response("", { status: +st }) });
    assert.equal(r.ok, false); assert.equal(r.codigo, codigo, st);
    assert.ok(!r.mensagem.includes(CHAVE));
  }
  const rede = await testarConexaoFreshdesk({ baseUrl: "https://x.freshdesk.com/api/v2", apiKey: CHAVE, fetchImpl: async () => { throw new TypeError("x"); } });
  assert.equal(rede.codigo, "rede");
});

// ── Autorização de administrador ──────────────────────────────────────

test("admin: sem token → 401; token inválido → 401; usuário comum → 403; admin → ok", async () => {
  const admins = new Set(["uid-admin"]);
  const v = h => verificarAdmin({ headers: h }, { verificarToken, adminUids: admins });
  assert.equal((await v({})).status, 401);
  assert.equal((await v({ authorization: "Bearer xpto.invalido.aaaaaaaaaaaaaaaa" })).status, 401);
  assert.equal((await v({ authorization: `Basic ${TOKEN_ADMIN}` })).status, 401, "só aceita Bearer");
  assert.equal((await v({ authorization: `Bearer ${TOKEN_COMUM}` })).status, 403);
  assert.deepEqual(await v({ authorization: `Bearer ${TOKEN_ADMIN}` }), { ok: true, uid: "uid-admin" });
});

test("admin: lista de admins vazia ou ausente → ninguém é admin; espaços são ignorados", async () => {
  assert.equal(lerAdminUids({}).size, 0);
  assert.equal((await verificarAdmin({ headers: { authorization: `Bearer ${TOKEN_ADMIN}` } }, { verificarToken, adminUids: lerAdminUids({ ADMIN_UIDS: "" }) })).status, 403);
  assert.deepEqual([...lerAdminUids({ ADMIN_UIDS: " uid-admin , outro " })], ["uid-admin", "outro"]);
});

// ── Endpoint ──────────────────────────────────────────────────────────

const CFG_OK = () => lerConfigFreshdesk({ FRESHDESK_DOMINIO: "logikesoftwares", FRESHDESK_API_KEY: CHAVE });
function chamar(handler, req) {
  return new Promise(async resolve => {
    const res = { h: {}, status(c) { this.c = c; return this; }, setHeader(k, v) { this.h[k] = v; return this; }, json(b) { resolve({ status: this.c, body: b }); return this; } };
    await handler(req, res);
  });
}
const handler = ({ cfg = CFG_OK, fetchImpl, admins = "uid-admin" } = {}) =>
  criarHandlerFreshdeskStatus({ lerConfig: cfg, verificarToken, lerAdmins: () => lerAdminUids({ ADMIN_UIDS: admins }), fetchImpl });

test("endpoint: sem login ou sem permissão → recusa e NÃO chama o Freshdesk nem revela a configuração", async () => {
  let chamou = false;
  const fetchImpl = async () => { chamou = true; return resp(200); };
  const semLogin = await chamar(handler({ fetchImpl }), { method: "GET", headers: {} });
  const comum = await chamar(handler({ fetchImpl }), { method: "GET", headers: { authorization: `Bearer ${TOKEN_COMUM}` } });
  assert.equal(semLogin.status, 401); assert.equal(comum.status, 403);
  assert.equal(chamou, false);
  assert.ok(!JSON.stringify([semLogin.body, comum.body]).match(/configur|freshdesk\.com/i));
});

test("endpoint: admin + conexão ok → { conectado: true } e nada mais", async () => {
  const r = await chamar(handler({ fetchImpl: async () => resp(200) }), { method: "GET", headers: { authorization: `Bearer ${TOKEN_ADMIN}` } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { conectado: true });
});

test("endpoint: admin + chave recusada → conectado false com mensagem genérica, sem a chave", async () => {
  const r = await chamar(handler({ fetchImpl: async () => new Response("", { status: 401 }) }), { method: "GET", headers: { authorization: `Bearer ${TOKEN_ADMIN}` } });
  assert.deepEqual(r.body, { conectado: false, erro: "O Freshdesk recusou a chave de API (verifique a chave)." });
});

test("endpoint: sem configuração → 503; método POST → 405", async () => {
  const r = await chamar(handler({ cfg: () => lerConfigFreshdesk({}) }), { method: "GET", headers: { authorization: `Bearer ${TOKEN_ADMIN}` } });
  assert.equal(r.status, 503);
  assert.equal((await chamar(handler(), { method: "POST", headers: { authorization: `Bearer ${TOKEN_ADMIN}` } })).status, 405);
});
