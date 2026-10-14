// Testes da importação de satisfação com vários meses (lógica pura, sem banco).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { satParseData, satChaveRegistro, satDistribuir } from "../src/satisfacao.js";

const reg = (o) => ({ nomeExcel: "Ana Paula", cliente: "Cliente X", protocolo: "", atendimento: 5, necessidades: 4, sistema: 5,
  temResposta: true, comentario: "", employeeId: "ana", ...o });
const ids = d => d.registros.map(r => r.protocolo).sort();

// ── Datas ─────────────────────────────────────────────────────────────

test("data do Excel às 23h30 do último dia do mês NÃO pula para o mês seguinte (bug antigo)", () => {
  const serial = 46234 + 23.5 / 24;   // 31/07/2026 23:30
  assert.equal(satParseData(serial), "2026-07-31");
  // Comportamento antigo (Date + toISOString) no fuso de São Paulo dava 2026-08-01:
  const antigo = new Date(2026, 6, 31, 23, 30).toISOString().slice(0, 10);
  if (Intl.DateTimeFormat().resolvedOptions().timeZone === "America/Sao_Paulo") assert.equal(antigo, "2026-08-01");
});

test("formatos de data aceitos", () => {
  assert.equal(satParseData(46235), "2026-08-01");
  assert.equal(satParseData("14/07/2026"), "2026-07-14");
  assert.equal(satParseData("4/7/2026 10:32"), "2026-07-04");
  assert.equal(satParseData("2026-07-14T10:32:00"), "2026-07-14");
  assert.equal(satParseData(new Date(2026, 6, 14, 22, 0)), "2026-07-14");
  for (const v of ["", "-", null, undefined, "texto"]) assert.equal(satParseData(v), null);
});

test("datas lidas de um .xlsx real gerado pelo SheetJS, sem cellDates", () => {
  const ws = XLSX.utils.aoa_to_sheet([["Data"], [46234 + 0.98], [46266.5]]);
  ws.A2.t = ws.A3.t = "n"; ws.A2.z = ws.A3.z = "dd/mm/yyyy hh:mm";
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "s");
  const lido = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array", cellDates: false });
  const linhas = XLSX.utils.sheet_to_json(lido.Sheets.s, { header: 1, defval: "" }).slice(1);
  assert.deepEqual(linhas.map(l => satParseData(l[0])), ["2026-07-31", "2026-09-01"]);
});

// ── Distribuição por mês ──────────────────────────────────────────────

test("um arquivo com 3 meses alimenta os 3 meses e cria os que não existem", () => {
  const rows = [
    reg({ protocolo: "J1", data: "2026-07-03" }), reg({ protocolo: "J2", data: "2026-07-20" }),
    reg({ protocolo: "A1", data: "2026-08-10" }),
    reg({ protocolo: "S1", data: "2026-09-01" }), reg({ protocolo: "S2", data: "2026-09-30" }),
  ];
  const { docs, resumo } = satDistribuir([], rows, "2026-10", "tri.xlsx");
  assert.deepEqual(Object.keys(docs).sort(), ["2026-07", "2026-08", "2026-09"]);
  assert.deepEqual(ids(docs["2026-07"]), ["J1", "J2"]);
  assert.equal(docs["2026-09"].mes, 9);
  assert.equal(docs["2026-09"].ano, 2026);
  assert.equal(docs["2026-09"].totalRegistros, 2);
  assert.ok(resumo.every(m => m.novo));
});

test("arquivo de um mês só continua funcionando; linhas sem data vão para o mês selecionado", () => {
  const rows = [reg({ protocolo: "X1", data: null }), reg({ protocolo: "X2", data: null })];
  const { docs } = satDistribuir([], rows, "2026-05", "maio.xlsx");
  assert.deepEqual(Object.keys(docs), ["2026-05"]);
  assert.equal(docs["2026-05"].totalRegistros, 2);
});

test("importar o MESMO arquivo de novo não duplica nada", () => {
  const rows = [reg({ protocolo: "J1", data: "2026-07-03" }), reg({ protocolo: "A1", data: "2026-08-10" }), reg({ protocolo: "", cliente: "Sem prot", data: "2026-08-11" })];
  const primeira = satDistribuir([], rows, "2026-10", "a.xlsx");
  const salvos = Object.values(primeira.docs);
  const segunda = satDistribuir(salvos, rows, "2026-10", "a.xlsx");
  assert.equal(segunda.docs["2026-07"].totalRegistros, 1);
  assert.equal(segunda.docs["2026-08"].totalRegistros, 2);
  assert.ok(segunda.resumo.every(m => m.adicionados === 0 && !m.novo));
});

test("mês que já existe recebe só os registros novos e mantém os antigos", () => {
  const existente = satDistribuir([], [reg({ protocolo: "J1", data: "2026-07-03" })], "x", "jul.xlsx").docs["2026-07"];
  const { docs, resumo } = satDistribuir([existente], [reg({ protocolo: "J1", data: "2026-07-03" }), reg({ protocolo: "J9", data: "2026-07-29" })], "x", "b.xlsx");
  assert.deepEqual(ids(docs["2026-07"]), ["J1", "J9"]);
  assert.deepEqual(resumo[0], { key: "2026-07", adicionados: 1, atualizados: 1, novo: false });
});

test("comentário já obtido não se perde se a nova importação vier sem ele", () => {
  const existente = satDistribuir([], [reg({ protocolo: "J1", data: "2026-07-03", comentario: "Ótimo" })], "x", "a").docs["2026-07"];
  const { docs } = satDistribuir([existente], [reg({ protocolo: "J1", data: "2026-07-03", comentario: "" })], "x", "b");
  assert.equal(docs["2026-07"].registros[0].comentario, "Ótimo");
});

test("meses que não estão no arquivo não são tocados", () => {
  const junho = satDistribuir([], [reg({ protocolo: "U1", data: "2026-06-05" })], "x", "a").docs["2026-06"];
  const { docs } = satDistribuir([junho], [reg({ protocolo: "J1", data: "2026-07-03" })], "x", "b");
  assert.deepEqual(Object.keys(docs), ["2026-07"]);
});

test("registro gravado no mês errado por importação antiga é MOVIDO, nunca fica em dois meses", () => {
  // importação antiga gravou 31/07 23h30 como 01/08 (bug de fuso), no documento de agosto
  const errado = reg({ protocolo: "P31", data: "2026-08-01", comentario: "Muito bom" });
  const agosto = satDistribuir([], [errado, reg({ protocolo: "A1", data: "2026-08-10" })], "x", "a").docs["2026-08"];
  const { docs } = satDistribuir([agosto], [reg({ protocolo: "P31", data: "2026-07-31" })], "x", "b");
  assert.deepEqual(ids(docs["2026-07"]), ["P31"]);
  assert.deepEqual(ids(docs["2026-08"]), ["A1"]);
  assert.equal(docs["2026-08"].totalRegistros, 1);
  assert.equal(docs["2026-07"].registros[0].comentario, "Muito bom", "comentário antigo preservado na mudança de mês");
});

test("linhas diferentes com o mesmo protocolo não são fundidas", () => {
  const rows = [reg({ protocolo: "D1", data: "2026-07-03", cliente: "A" }), reg({ protocolo: "D1", data: "2026-07-03", cliente: "B" })];
  assert.notEqual(satChaveRegistro(rows[0]), satChaveRegistro(rows[1]));
  assert.equal(satDistribuir([], rows, "x", "a").docs["2026-07"].totalRegistros, 2);
});
