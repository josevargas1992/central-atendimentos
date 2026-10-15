// Utilitários compartilhados pelos scripts de backup e restauração do Firestore.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getFirestore, Timestamp, GeoPoint, DocumentReference, Bytes, doc } from "firebase/firestore";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Todas as coleções com dados de negócio. "presence" fica de fora (status online, temporário).
export const COLLECTIONS = [
  "employees", "pages", "records", "tipos", "departments", "signatures",
  "satisfacao", "satisfacao_config",
  "gc_vendors", "gc_collabs", "gc_months",
  "relatorios_publicos",
  "inadimplentes",
];

function loadEnv() {
  const file = resolve(ROOT, ".env");
  if (!existsSync(file)) throw new Error(`Arquivo .env não encontrado em ${file}`);
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

export function connect() {
  const env = loadEnv();
  const app = initializeApp({
    apiKey:            env.VITE_FIREBASE_API_KEY,
    authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             env.VITE_FIREBASE_APP_ID,
  });
  return { db: getFirestore(app), projectId: env.VITE_FIREBASE_PROJECT_ID };
}

// Converte tipos especiais do Firestore em JSON marcado, para voltar ao tipo original na restauração.
export function encode(v) {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Timestamp)         return { __fs: "timestamp", seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (v instanceof GeoPoint)          return { __fs: "geopoint", latitude: v.latitude, longitude: v.longitude };
  if (v instanceof DocumentReference) return { __fs: "ref", path: v.path };
  if (v instanceof Bytes)             return { __fs: "bytes", base64: v.toBase64() };
  if (Array.isArray(v)) return v.map(encode);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
}

export function decode(v, db) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(x => decode(x, db));
  switch (v.__fs) {
    case "timestamp": return new Timestamp(v.seconds, v.nanoseconds);
    case "geopoint":  return new GeoPoint(v.latitude, v.longitude);
    case "ref":       return doc(db, v.path);
    case "bytes":     return Bytes.fromBase64String(v.base64);
  }
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x, db)]));
}

// JSON com chaves ordenadas — permite comparar documentos de forma estável.
export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
}
