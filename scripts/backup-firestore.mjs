// Backup completo do Firestore em JSON.
// Uso: npm run backup            → salva em ./backups/AAAA-MM-DD_HHMMSS/
//      npm run backup -- --out=D:\Pasta\Backups   → salva em outra pasta (ex.: OneDrive/Google Drive)
//      --with-code   → inclui também o código (git bundle com todo o histórico)
//      --diario      → no máximo UM backup de dados por dia nessa pasta: se já existe o de hoje, não lê
//                      o banco de novo (cada backup gasta ~5.500 leituras da cota gratuita do Firebase);
//                      só atualiza a cópia do código dentro da pasta de hoje (isso não gasta leituras).
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { collection, getDocs, terminate } from "firebase/firestore";
import { ROOT, COLLECTIONS, connect, encode } from "./firestore-common.mjs";

const p2 = v => String(v).padStart(2, "0");
const dia = n => `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}`;

// Pasta do backup de DADOS de hoje (AAAA-MM-DD_HHMMSS com manifest e coleções), ou null.
export function backupDeDadosDoDia(outBase, agora = new Date()) {
  if (!outBase || !existsSync(outBase)) return null;
  const hoje = dia(agora);
  const candidatas = readdirSync(outBase).filter(n => new RegExp(`^${hoje}_\\d{6}$`).test(n)).sort();
  for (const nome of candidatas) {
    try {
      const m = JSON.parse(readFileSync(join(outBase, nome, "manifest.json"), "utf8"));
      if (m.collections && Object.keys(m.collections).length) return join(outBase, nome);
    } catch { /* pasta incompleta: ignora */ }
  }
  return null;
}

// Cópia completa do repositório git (todo o histórico e branches) num único arquivo.
// Restaurar: git clone codigo.bundle central-atendimentos
function salvarCodigo(dir, manifest) {
  const bundle = join(dir, "codigo.bundle");
  execFileSync("git", ["bundle", "create", bundle, "--all"], { cwd: ROOT, stdio: "pipe" });
  execFileSync("git", ["bundle", "verify", bundle], { cwd: ROOT, stdio: "pipe" });
  const head = execFileSync("git", ["log", "-1", "--format=%h %s"], { cwd: ROOT, encoding: "utf8" }).trim();
  manifest.code = { file: "codigo.bundle", head, sha256: createHash("sha256").update(readFileSync(bundle)).digest("hex"), atualizadoEm: new Date().toISOString() };
  console.log(`  ${"código (git bundle)".padEnd(20)} último commit: ${head}`);
}

export async function runBackup({ outBase, label = "", withCode = false, diario = false } = {}) {
  if (diario) {
    const existente = backupDeDadosDoDia(outBase);
    if (existente) {
      const manifest = JSON.parse(readFileSync(join(existente, "manifest.json"), "utf8"));
      const hora = new Date(manifest.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      console.log(`  Backup de dados de hoje já existe (feito às ${hora}) — o banco NÃO foi lido de novo.`);
      if (withCode) {
        salvarCodigo(existente, manifest);
        writeFileSync(join(existente, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
      }
      console.log(`\n✓ ${withCode ? "Código atualizado" : "Nada a fazer"} → ${existente}`);
      return existente;
    }
  }

  const { db, projectId } = connect();
  const n = new Date();
  const stamp = `${dia(n)}_${p2(n.getHours())}${p2(n.getMinutes())}${p2(n.getSeconds())}`;
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
  if (withCode) salvarCodigo(dir, manifest);

  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await terminate(db);
  console.log(`\n✓ Backup concluído: ${total} documentos → ${dir}`);
  return dir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv.find(a => a.startsWith("--out="))?.slice(6);
  runBackup({ outBase: out, withCode: process.argv.includes("--with-code"), diario: process.argv.includes("--diario") })
    .then(() => process.exit(0)).catch(e => { console.error("✗ Falha no backup:", e.message); process.exit(1); });
}
