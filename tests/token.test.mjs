// Verificação do token de login do Firebase (sem rede: chaves geradas localmente no lugar das do Google).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { criarVerificadorToken } from "../server/tokenFirebase.js";

const PROJ = "projeto-do-app";
const { publicKey, privateKey } = await generateKeyPair("RS256");
const outro = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const jwks = createLocalJWKSet({ keys: [jwk] });
const agora = Math.floor(Date.now() / 1000);
const assinar = (claims = {}, { chave = privateKey, kid = "k1", alg = "RS256", exp = agora + 3600 } = {}) =>
  new SignJWT({ auth_time: agora - 10, email: "admin@x.com", ...claims }).setProtectedHeader({ alg, kid })
    .setIssuer(claims.iss || `https://securetoken.google.com/${PROJ}`).setAudience(claims.aud || PROJ)
    .setSubject(claims.sub ?? "uid-admin").setIssuedAt(agora - 10).setExpirationTime(exp).sign(chave);
const verificar = criarVerificadorToken({ projectId: PROJ, jwks });

test("token válido do projeto → devolve o UID", async () => {
  assert.deepEqual(await verificar(await assinar()), { uid: "uid-admin", email: "admin@x.com" });
});

test("recusa: assinatura de outra chave, outro projeto, outro emissor, vencido, sem usuário", async () => {
  const casos = {
    "assinado com outra chave": await assinar({}, { chave: outro.privateKey }),
    "outro projeto (aud)": await assinar({ aud: "projeto-alheio" }),
    "outro emissor": await assinar({ iss: "https://securetoken.google.com/projeto-alheio" }),
    "vencido": await assinar({}, { exp: agora - 3600 }),
    "sem usuário": await assinar({ sub: "" }),
    "login no futuro": await assinar({ auth_time: agora + 3600 }),
  };
  for (const [nome, tk] of Object.entries(casos)) await assert.rejects(verificar(tk), undefined, nome);
});

test("recusa token adulterado e lixo", async () => {
  const tk = await assinar();
  const [h, p, s] = tk.split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  const adulterado = [h, Buffer.from(JSON.stringify({ ...payload, sub: "uid-hacker" })).toString("base64url"), s].join(".");
  await assert.rejects(verificar(adulterado));
  await assert.rejects(verificar("nao.e.token"));
});

test("sem projeto configurado no servidor → recusa tudo", async () => {
  await assert.rejects(criarVerificadorToken({ projectId: "", jwks })(await assinar()));
});
