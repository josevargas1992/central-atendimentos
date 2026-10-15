// Modo seguro: roda o app no localhost usando o EMULADOR do Firestore carregado com uma
// cópia do backup. Nada do que for feito aqui chega ao banco real, e tudo é descartado ao fechar.
// Uso: npm run dev:seguro         → faz um backup novo (só leitura) e carrega ele
//      npm run dev:seguro:rapido  → usa o backup mais recente que já existe
//      DEV_SEGURO_BACKUP="caminho\da\pasta" npm run dev:seguro:rapido → usa um backup específico
// (Este script é chamado por "firebase emulators:exec", que sobe o emulador antes. Opções depois
//  de "--" no npm iriam para o firebase, não para este script — por isso os comandos separados.)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, writeBatch, terminate } from "firebase/firestore";
import { ROOT, decode } from "./firestore-common.mjs";
import { runBackup } from "./backup-firestore.mjs";

const DRIVE = "G:/Meu Drive/Backups/Central de Atendimentos";
const args = process.argv.slice(2);

function latestBackup() {
  const found = [resolve(ROOT, "backups"), DRIVE].filter(existsSync).flatMap(base =>
    readdirSync(base).filter(n => /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(n)).map(n => join(base, n))
  ).filter(d => existsSync(join(d, "manifest.json")));
  found.sort((a, b) => JSON.parse(readFileSync(join(a, "manifest.json"))).createdAt
                     .localeCompare(JSON.parse(readFileSync(join(b, "manifest.json"))).createdAt));
  return found.at(-1);
}

async function pickBackup() {
  const explicit = args.find(a => a.startsWith("--backup="))?.slice(9) || process.env.DEV_SEGURO_BACKUP;
  if (explicit) return resolve(ROOT, explicit);
  if (!args.includes("--sem-backup")) {
    try {
      console.log("▶ Fazendo backup novo do banco real (somente leitura)...");
      return await runBackup();
    } catch (e) {
      console.log(`! Não foi possível fazer backup novo (${e.message}). Usando o mais recente disponível.`);
    }
  }
  const dir = latestBackup();
  if (!dir) throw new Error("Nenhum backup encontrado. Rode 'npm run backup' primeiro.");
  return dir;
}

async function loadIntoEmulator(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  // Conexão EXCLUSIVA com o emulador, num projeto "demo-" que não existe no Firebase real.
  const app = initializeApp({ projectId: "demo-central", apiKey: "demo" }, "dev-seguro");
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);

  let total = 0;
  for (const [name, info] of Object.entries(manifest.collections)) {
    const raw = readFileSync(join(dir, `${name}.json`), "utf8");
    if (createHash("sha256").update(raw).digest("hex") !== info.sha256) throw new Error(`${name}.json corrompido (SHA-256 não confere).`);
    const { docs } = JSON.parse(raw);
    for (let i = 0; i < docs.length; i += 400) {
      const b = writeBatch(db);
      docs.slice(i, i + 400).forEach(d => b.set(doc(db, name, d.id), decode(d.data, db)));
      await b.commit();
    }
    total += docs.length;
  }
  await terminate(db);
  return { total, createdAt: manifest.createdAt };
}

const dir = await pickBackup();
console.log(`▶ Carregando no emulador: ${dir}`);
const { total, createdAt } = await loadIntoEmulator(dir);
const label = new Date(createdAt).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
console.log(`✓ ${total} documentos carregados (backup de ${label}).\n`);
console.log("════════════════════════════════════════════════════════════");
console.log("  MODO SEGURO: http://localhost:5180");
console.log("  Banco de TESTE. Nada aqui afeta os dados reais.");
console.log("  Tudo é descartado ao fechar (Ctrl+C).");
console.log("════════════════════════════════════════════════════════════\n");

const vite = spawn(process.execPath, [resolve(ROOT, "node_modules/vite/bin/vite.js"), "--mode", "emulador", "--port", "5180", "--strictPort"], {
  cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SAFE_BACKUP_LABEL: label },
});
vite.on("exit", code => process.exit(code ?? 0));
