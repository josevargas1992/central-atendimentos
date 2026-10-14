// Restaura dados de um backup para o Firestore.
// SEGURANÇA: por padrão apenas SIMULA. Nunca apaga documentos — só recria os que sumiram
// e (com --apply) volta ao conteúdo do backup os que foram alterados.
//
// Uso:
//   npm run restore -- backups\2026-10-14_153000                     → simulação (nada é gravado)
//   npm run restore -- backups\2026-10-14_153000 --only=records,pages → limita às coleções
//   npm run restore -- backups\2026-10-14_153000 --only-missing --apply → recria só o que foi apagado
//   npm run restore -- backups\2026-10-14_153000 --apply             → recria apagados + reverte alterados
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { collection, getDocs, doc, writeBatch, terminate } from "firebase/firestore";
import { ROOT, connect, encode, decode, stableStringify } from "./firestore-common.mjs";
import { runBackup } from "./backup-firestore.mjs";

const args = process.argv.slice(2);
const dirArg = args.find(a => !a.startsWith("--"));
const apply = args.includes("--apply");
const onlyMissing = args.includes("--only-missing");
const only = args.find(a => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean);

async function main() {
  if (!dirArg) throw new Error("Informe a pasta do backup. Ex.: npm run restore -- backups\\2026-10-14_153000");
  const dir = resolve(ROOT, dirArg);
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`manifest.json não encontrado em ${dir}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const { db, projectId } = connect();
  if (manifest.projectId !== projectId)
    throw new Error(`Backup é do projeto "${manifest.projectId}", mas o .env aponta para "${projectId}". Abortado.`);

  const names = Object.keys(manifest.collections).filter(n => !only || only.includes(n));
  if (only) for (const n of only) if (!manifest.collections[n]) throw new Error(`Coleção "${n}" não existe neste backup.`);

  console.log(`Backup: ${dir}\nCriado em: ${manifest.createdAt}\nModo: ${apply ? "APLICAR" : "SIMULAÇÃO (nada será gravado)"}${onlyMissing ? " — somente documentos ausentes" : ""}\n`);

  const plan = [];
  for (const name of names) {
    const raw = readFileSync(join(dir, `${name}.json`), "utf8");
    const hash = createHash("sha256").update(raw).digest("hex");
    if (hash !== manifest.collections[name].sha256) throw new Error(`Arquivo ${name}.json está corrompido ou foi alterado (SHA-256 não confere). Abortado.`);
    const { docs } = JSON.parse(raw);

    const snap = await getDocs(collection(db, name));
    const current = new Map(snap.docs.map(d => [d.id, stableStringify(encode(d.data()))]));
    const backupIds = new Set(docs.map(d => d.id));

    let missing = 0, changed = 0, same = 0;
    for (const d of docs) {
      const cur = current.get(d.id);
      if (cur === undefined)                     { missing++; plan.push({ name, d }); }
      else if (cur !== stableStringify(d.data))  { changed++; if (!onlyMissing) plan.push({ name, d }); }
      else same++;
    }
    const extra = [...current.keys()].filter(id => !backupIds.has(id)).length;
    console.log(`  ${name.padEnd(20)} ausentes: ${String(missing).padStart(5)}   alterados: ${String(changed).padStart(5)}   iguais: ${String(same).padStart(5)}   novos (mantidos): ${extra}`);
  }

  console.log(`\nTotal a gravar: ${plan.length} documento(s).`);
  if (!apply) { console.log("Simulação concluída. Para gravar, repita o comando com --apply."); await terminate(db); return; }
  if (!plan.length) { console.log("Nada a restaurar."); await terminate(db); return; }

  console.log("\nCriando backup de segurança do estado atual antes de restaurar...");
  await runBackup({ label: "_antes-de-restaurar" });

  for (let i = 0; i < plan.length; i += 400) {
    const batch = writeBatch(db);
    for (const { name, d } of plan.slice(i, i + 400)) batch.set(doc(db, name, d.id), decode(d.data, db));
    await batch.commit();
    console.log(`  gravados ${Math.min(i + 400, plan.length)}/${plan.length}`);
  }
  await terminate(db);
  console.log("\n✓ Restauração concluída.");
}

main().then(() => process.exit(0)).catch(e => { console.error("✗", e.message); process.exit(1); });
