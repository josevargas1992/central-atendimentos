// Atualização automática do app após deploy — regras de segurança (sem navegador, sem banco).
import { test } from "node:test";
import assert from "node:assert/strict";
import { seguroRecarregar, guardarRetorno, lerRetorno, versaoPublicada } from "../src/atualizacao.js";

const AGORA = 1_000_000_000;
const doc = ({ modal = false, foco = "BODY", hidden = false } = {}) => ({
  hidden, activeElement: { tagName: foco, isContentEditable: false },
  querySelector: sel => (sel === "[data-modal]" && modal ? {} : null),
});
const parado = { agora: AGORA, ultimaAtividade: AGORA - 10 * 60_000, ultimaDigitacao: AGORA - 10 * 60_000 };

test("recarrega sozinho só quando ninguém pode perder nada", () => {
  assert.equal(seguroRecarregar({ documento: doc(), ...parado }), true, "parado há 10 min, sem nada aberto");
  assert.equal(seguroRecarregar({ documento: doc({ hidden: true }), ...parado, ultimaAtividade: AGORA }), true, "aba em segundo plano");
  assert.equal(seguroRecarregar({ documento: doc({ modal: true }), ...parado }), false, "janela de edição aberta");
  assert.equal(seguroRecarregar({ documento: doc({ foco: "INPUT" }), ...parado }), false, "campo em foco");
  assert.equal(seguroRecarregar({ documento: doc({ foco: "TEXTAREA", hidden: true }), ...parado }), false);
  assert.equal(seguroRecarregar({ documento: doc(), ...parado, ultimaDigitacao: AGORA - 30_000 }), false, "digitou há pouco");
  assert.equal(seguroRecarregar({ documento: doc(), ...parado, ultimaAtividade: AGORA - 60_000 }), false, "está usando a tela");
});

function armazenamento() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

test("depois de atualizar, volta para a mesma tela — uma vez só e por no máximo 2 minutos", () => {
  const s = armazenamento();
  guardarRetorno({ view: "inadimplentes", user: { id: "ana" } }, s, AGORA);
  assert.deepEqual(lerRetorno(s, AGORA + 5_000), { em: AGORA, view: "inadimplentes", user: { id: "ana" } });
  assert.equal(lerRetorno(s, AGORA + 6_000), null, "não restaura de novo (um F5 normal continua levando ao login)");
  guardarRetorno({ view: "home" }, s, AGORA);
  assert.equal(lerRetorno(s, AGORA + 3 * 60_000), null, "expirado");
  assert.equal(lerRetorno(armazenamento(), AGORA), null);
});

test("versão publicada: lê o arquivo; sem rede ou resposta estranha → null (não atualiza)", async () => {
  assert.equal(await versaoPublicada(async () => ({ ok: true, json: async () => ({ versao: "v2" }) })), "v2");
  assert.equal(await versaoPublicada(async () => ({ ok: false })), null);
  assert.equal(await versaoPublicada(async () => { throw new Error("offline"); }), null);
  assert.equal(await versaoPublicada(async () => ({ ok: true, json: async () => ({}) })), null);
});
