// Carrega TODAS as funções de /api como o ambiente da Vercel faz, para pegar erros de carregamento
// antes do deploy. Em 15/10/2026 um módulo (firebase-admin/auth → jwks-rsa → jose) funcionava no Node
// local mas quebrava na Vercel (ERR_REQUIRE_ESM) e derrubou todas as funções.
// Uso: npm run checar:funcoes  (o gancho de push roda isto e cancela o deploy se falhar)
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ROOT } from "./firestore-common.mjs";

const arquivos = [];
(function varrer(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) varrer(p);
    else if (/\.(m?js)$/.test(n)) arquivos.push(p);
  }
})(join(ROOT, "api"));

let falhas = 0;
for (const f of arquivos) {
  // --no-experimental-require-module: o Node local aceita require() de módulos ESM; a Vercel não.
  const r = spawnSync(process.execPath, ["--no-experimental-require-module", "--no-warnings", "--input-type=module", "-e",
    `const m = await import(${JSON.stringify(pathToFileURL(f).href)}); if (typeof m.default !== "function") { console.error("sem export default"); process.exit(2); }`],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, FIRESTORE_EMULATOR_HOST: "" } });
  const nome = relative(ROOT, f).replace(/\\/g, "/");
  if (r.status === 0) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}\n    ${(r.stderr || r.stdout).split("\n").find(l => /Error|erro|sem export/.test(l)) || r.stderr.slice(0, 300)}`); }
}
if (falhas) { console.log(`\n✗ ${falhas} função(ões) não carregam como na Vercel.`); process.exit(1); }
console.log(`\n✓ ${arquivos.length} funções carregam como na Vercel.`);
