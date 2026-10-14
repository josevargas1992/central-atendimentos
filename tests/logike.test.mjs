// Testes da integração com a API Lógike — usam respostas simuladas (nenhuma chamada real).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { consultarLogike, descreverTesteLogike } from "../src/logike.js";

const CFG = { baseUrl: "https://api.exemplo.com/v1/", apiKey: "chave", endpoint: "/pesquisas/{protocolo}" };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function simular(resposta) {
  const chamadas = [];
  globalThis.fetch = async (url, opts) => {
    chamadas.push({ url, opts });
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
  return chamadas;
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("monta a URL com o protocolo e envia a chave", async () => {
  const chamadas = simular(json(200, { comentario: "Ótimo atendimento" }));
  await consultarLogike(" 123/45 ", CFG);
  assert.equal(chamadas[0].url, "https://api.exemplo.com/v1/pesquisas/123%2F45");
  assert.equal(chamadas[0].opts.headers.Authorization, "Bearer chave");
});

test("sucesso: devolve o texto do comentário", async () => {
  simular(json(200, { comentario: "Ótimo atendimento" }));
  const r = await consultarLogike("1", CFG);
  assert.deepEqual(r, { ok: true, status: 200, texto: "Ótimo atendimento", erro: null });
  assert.equal(descreverTesteLogike(r).ok, true);
});

test("falha de rede / CORS: NÃO pode aparecer como conexão ok (bug antigo)", async () => {
  simular(new TypeError("Failed to fetch"));
  const r = await consultarLogike("TESTE", CFG);
  assert.equal(r.erro, "rede");
  const d = descreverTesteLogike(r);
  assert.equal(d.ok, false);
  assert.match(d.msg, /CORS/);
});

test("chave recusada (401/403) aparece como erro de chave", async () => {
  for (const status of [401, 403]) {
    simular(json(status, { error: "unauthorized" }));
    const d = descreverTesteLogike(await consultarLogike("TESTE", CFG));
    assert.equal(d.ok, false);
    assert.match(d.msg, /chave/i);
  }
});

test("404 no protocolo de teste conta como servidor alcançado", async () => {
  simular(json(404, {}));
  assert.equal(descreverTesteLogike(await consultarLogike("TESTE", CFG)).ok, true);
});

test("resposta que não é JSON é erro (endpoint errado)", async () => {
  simular(new Response("<html>login</html>", { status: 200 }));
  const r = await consultarLogike("1", CFG);
  assert.equal(r.erro, "json");
  assert.equal(descreverTesteLogike(r).ok, false);
});

test("erro 500 do servidor é erro", async () => {
  simular(json(500, {}));
  const d = descreverTesteLogike(await consultarLogike("1", CFG));
  assert.equal(d.ok, false);
  assert.match(d.msg, /500/);
});
