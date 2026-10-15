// Firestore no servidor (funções da Vercel) via Firebase Admin SDK.
// Produção: credencial da conta de serviço em FIREBASE_SERVICE_ACCOUNT (JSON) — variável de ambiente da Vercel.
// Testes/local: se FIRESTORE_EMULATOR_HOST estiver definido, usa o emulador (sem credencial).
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let db = null;

export function getDb() {
  if (db) return db;
  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-central-testes" });
    } else {
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
  }
  db = getFirestore();
  // Em funções serverless a conexão gRPC padrão pode ficar presa; REST é a opção indicada para esse ambiente.
  // (No emulador o modo REST tenta buscar credenciais do Google e fica lento — lá fica o padrão.)
  if (!process.env.FIRESTORE_EMULATOR_HOST) db.settings({ preferRest: true });
  return db;
}
