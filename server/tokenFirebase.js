// Verificação do token de login do Firebase (ID token) no servidor, com a biblioteca "jose".
// Método documentado pelo Firebase para verificar tokens sem o Admin SDK ("Verify ID tokens using a
// third-party JWT library"): assinatura RS256 com as chaves públicas do Google, emissor
// https://securetoken.google.com/<projeto>, público = <projeto>, validade (exp/iat/auth_time) e "sub" = UID.
// (O módulo firebase-admin/auth não é usado: no ambiente da Vercel ele quebra ao carregar —
//  ERR_REQUIRE_ESM em jwks-rsa → jose —, o que derrubou as funções em 15/10/2026.)
import { createRemoteJWKSet, jwtVerify } from "jose";

const CHAVES_GOOGLE = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwksRemoto = null;

export function criarVerificadorToken({ projectId, jwks } = {}) {
  return async function verificar(token) {
    if (!projectId) throw new Error("Projeto do Firebase não configurado no servidor.");
    const chaves = jwks || (jwksRemoto ||= createRemoteJWKSet(new URL(CHAVES_GOOGLE)));
    const { payload } = await jwtVerify(token, chaves, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: 30,
    });
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) throw new Error("Token sem usuário.");
    if (typeof payload.auth_time !== "number" || payload.auth_time * 1000 > Date.now() + 30000) throw new Error("Horário de login inválido.");
    return { uid: payload.sub, email: payload.email || null };
  };
}

// Verificador de produção: projeto lido das variáveis da Vercel (o mesmo que o app usa).
export const verificarTokenFirebase = token => criarVerificadorToken({ projectId: process.env.VITE_FIREBASE_PROJECT_ID })(token);
