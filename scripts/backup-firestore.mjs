// Backup completo do Firestore em JSON.
// Uso: npm run backup            → salva em ./backups/AAAA-MM-DD_HHMMSS/
//      npm run backup -- --out=D:\Pasta\Backups   → salva em outra pasta (ex.: OneDrive/Google Drive)
//      --with-code   → inclui também o código (git bundle com todo o histórico)
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { collection, getDocs, terminate } from "firebase/firestore";
import { ROOT, COLLECTIONS, connect, encode } from "./firestore-common.mjs";

export async function runBackup({ outBase, label = "", withCode = false } = {}) {
  const { db, projectId } = connect();
  const n = new Date(), p = v => String(v).padStart(2, "0");
  const stamp = `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
  const dir = join(outBase || resolve(ROOT, "backups"), `${stamp}${label}`);
  mkdirSync(dir, { recursive: true });

  const manifest = { projectId, createdAt: new Date().toISOString(), collections: {} };
  let total = 0;
  for (const name of COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    const docs = snap.docs.map(d => ({ id: d.id, data: encode(d.data()) }));
    const json = JSON.stringify({ collection: name, docs }, null, 1);
    writeFileSync(join(dir, `${name}.json`), json, "utf8");
    manifest.collections[name] = { count: docs.length, sha256: createHash("sha256").update(json).digest("hex") };
    total += docs.length;
    console.log(`  ${name.padEnd(20)} ${String(docs.length).padStart(6)} documentos`);
  }
  manifest.totalDocs = total;

  // Cópia completa do repositório git (todo o histórico e branches) num único arquivo.
  // Restaurar: git clone codigo.bundle central-atendimentos
  if (withCode) {
    const bundle = join(dir, "codigo.bundle");
    execFileSync("git", ["bundle", "create", bundle, "--all"], { cwd: ROOT, stdio: "pipe" });
    execFileSync("git", ["bundle", "verify", bundle], { cwd: ROOT, stdio: "pipe" });
    const head = execFileSync("git", ["log", "-1", "--format=%h %s"], { cwd: ROOT, encoding: "utf8" }).trim();
    manifest.code = { file: "codigo.bundle", head, sha256: createHash("sha256").update(readFileSync(bundle)).digest("hex") };
    console.log(`  ${"código (git bundle)".padEnd(20)} último commit: ${head}`);
  }

  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await terminate(db);
  console.log(`\n✓ Backup concluído: ${total} documentos → ${dir}`);
  return dir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv.find(a => a.startsWith("--out="))?.slice(6);
  runBackup({ outBase: out, withCode: process.argv.includes("--with-code") }).then(() => process.exit(0)).catch(e => { console.error("✗ Falha no backup:", e.message); process.exit(1); });
}
