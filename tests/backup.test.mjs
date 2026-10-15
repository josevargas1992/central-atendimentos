// Backup diário: no máximo um backup de DADOS por dia (cada um gasta ~5.500 leituras da cota gratuita).
// Estes testes nunca tocam o banco real: só usam pastas temporárias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupDeDadosDoDia, runBackup } from "../scripts/backup-firestore.mjs";

const p2 = v => String(v).padStart(2, "0");
const hoje = new Date(), ontem = new Date(Date.now() - 86400000);
const nomeDia = (d, hhmmss) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${hhmmss}`;
function pastaFake(base, nome, manifest) { mkdirSync(join(base, nome), { recursive: true }); writeFileSync(join(base, nome, "manifest.json"), JSON.stringify(manifest)); }

test("reconhece o backup de dados de hoje; ignora o de ontem, pasta incompleta e pasta sem coleções", () => {
  const base = mkdtempSync(join(tmpdir(), "bk-"));
  try {
    assert.equal(backupDeDadosDoDia(base), null, "pasta vazia");
    pastaFake(base, nomeDia(ontem, "090000"), { collections: { records: { count: 1 } } });
    assert.equal(backupDeDadosDoDia(base), null, "backup de ontem não conta");
    mkdirSync(join(base, nomeDia(hoje, "080000")));                       // sem manifest
    pastaFake(base, nomeDia(hoje, "081000"), { collections: {} });         // sem dados
    pastaFake(base, `${nomeDia(hoje, "082000")}_antes-de-restaurar`, { collections: { records: {} } });
    assert.equal(backupDeDadosDoDia(base), null, "incompletas e de restauração não contam");
    pastaFake(base, nomeDia(hoje, "090000"), { createdAt: new Date().toISOString(), collections: { records: { count: 5 } } });
    assert.equal(backupDeDadosDoDia(base), join(base, nomeDia(hoje, "090000")));
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("com backup de hoje: NÃO lê o banco e só atualiza o código na pasta de hoje", async () => {
  const base = mkdtempSync(join(tmpdir(), "bk-"));
  try {
    const nome = nomeDia(hoje, "070000");
    pastaFake(base, nome, { createdAt: new Date().toISOString(), collections: { records: { count: 5, sha256: "x" } }, totalDocs: 5 });
    // trava de segurança: só chama o backup se a pasta de hoje foi reconhecida (senão leria o banco real)
    assert.ok(backupDeDadosDoDia(base), "pré-condição");
    const dir = await runBackup({ outBase: base, withCode: true, diario: true });
    assert.equal(dir, join(base, nome));
    assert.ok(existsSync(join(dir, "codigo.bundle")), "código salvo");
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    assert.deepEqual(m.collections, { records: { count: 5, sha256: "x" } }, "dados intactos");
    assert.ok(m.code?.head && m.code?.atualizadoEm);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
