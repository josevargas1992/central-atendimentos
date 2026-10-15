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
      initializeApp({ credential: cert(conta), projectId: conta.project_id });
    }
  }
  db = getFirestore();
  return db;
}
