// Firebase Admin SDK no servidor (funções da Vercel): Firestore e verificação de login (Auth).
// Produção: credencial da conta de serviço em FIREBASE_SERVICE_ACCOUNT (JSON) — variável de ambiente da Vercel.
// Testes/local: se FIRESTORE_EMULATOR_HOST estiver definido, usa o emulador (sem credencial).
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let db = null;

function iniciarApp() {
  if (getApps().length) return;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-central-testes" });
    return;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT não configurada no servidor.");
  let conta;
  try { conta = JSON.parse(raw); } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT não é um JSON válido."); }
  // Trava: a conta de serviço tem que ser do MESMO projeto que o app usa — senão gravaria no banco errado.
  const doApp = process.env.VITE_FIREBASE_PROJECT_ID;
  if (doApp && conta.project_id !== doApp)
    throw new Error(`A conta de serviço é do projeto "${conta.project_id}", mas o app usa "${doApp}". Gere a chave no projeto correto.`);
  initializeApp({ credential: cert(conta), projectId: conta.project_id });
}

export function getDb() {
  if (db) return db;
  iniciarApp();
  db = getFirestore();
  // Em funções serverless a conexão gRPC padrão pode ficar presa; REST é a opção indicada para esse ambiente.
  // (No emulador o modo REST tenta buscar credenciais do Google e fica lento — lá fica o padrão.)
  if (!process.env.FIRESTORE_EMULATOR_HOST) db.settings({ preferRest: true });
  return db;
}

// Confere um token de login do Firebase (assinatura, validade, projeto e se não foi revogado).
// Devolve os dados verificados do token; lança erro se for inválido.
export async function verificarTokenFirebase(token) {
  iniciarApp();
  return getAuth().verifyIdToken(token, true);
}
