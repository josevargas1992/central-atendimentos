import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";

// No navegador as variáveis vêm do Vite; nos scripts de teste (Node), de process.env.
const env = import.meta.env ?? process.env;

const firebaseConfig = {
  apiKey:            env.VITE_FIREBASE_API_KEY,
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
// Login do Firebase (Authentication). Etapa 1: usado só pelo administrador nas integrações protegidas.
export const auth = getAuth(app);
// A sessão do Firebase dura só enquanto a aba estiver aberta (computadores compartilhados no atendimento).
setPersistence(auth, browserSessionPersistence).catch(() => {});

// Com VITE_FIRESTORE_EMULATOR=127.0.0.1:8080 o app usa o emulador local em vez do banco real.
export const isSafeMode = !!env.VITE_FIRESTORE_EMULATOR;
if (isSafeMode) {
  if (!String(firebaseConfig.projectId).startsWith("demo-"))
    throw new Error("Modo emulador exige um projeto 'demo-' — abortado para não misturar com o banco real.");
  const [host, port] = env.VITE_FIRESTORE_EMULATOR.split(":");
  connectFirestoreEmulator(db, host, +port);
}
