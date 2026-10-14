// Satisfação — leitura de datas e distribuição dos registros importados por mês.
import * as XLSX from "xlsx";

// No navegador (Vite, xlsx.mjs) o SSF vem direto; no Node (testes), em default.
const SSF = XLSX.SSF ?? XLSX.default?.SSF;

export function satNorm(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

const pad2 = n => String(n).padStart(2, "0");

// Converte a data de uma célula em "AAAA-MM-DD" sem passar por fuso horário
// (um registro de 31/07 às 23h30 não pode cair em agosto).
export function satParseData(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {                       // número de série do Excel
    const p = SSF.parse_date_code(v);
    return p && p.y > 1900 ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}` : null;
  }
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  }
  const s = String(v).trim();
  if (!s || s === "-") return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);          // 14/07/2026 [10:32]
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\D|$)/);                    // 2026-07-14[T10:32]
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// Identifica um registro da pesquisa — usado para não duplicar ao importar de novo.
// Com protocolo, a data fica de fora: importações antigas podem ter gravado a data
// com um dia a mais (bug de fuso já corrigido), e isso não pode gerar duplicata.
export function satChaveRegistro(r) {
  const base = [satNorm(r.nomeExcel), satNorm(r.cliente), r.atendimento, r.necessidades, r.sistema];
  const partes = r.protocolo ? ["p", String(r.protocolo).trim(), ...base] : ["d", r.data, ...base];
  return partes.map(v => v ?? "").join("|");
}

// Separa as linhas por mês ("AAAA-MM") conforme a data; linhas sem data vão para fallbackKey.
export function satAgruparPorMes(rows, fallbackKey) {
  const grupos = {};
  for (const r of rows) {
    const key = r.data ? r.data.slice(0, 7) : fallbackKey;
    (grupos[key] ||= []).push(r);
  }
  return grupos;
}

// Junta os registros já salvos de um mês com os novos, sem duplicar.
// Um registro igual é atualizado pelo novo, mas mantém o comentário já obtido se o novo vier sem.
export function satMesclarRegistros(existentes, novos) {
  const porChave = new Map((existentes || []).map(r => [satChaveRegistro(r), r]));
  let adicionados = 0, atualizados = 0;
  for (const n of novos) {
    const k = satChaveRegistro(n);
    const antigo = porChave.get(k);
    if (antigo) {
      atualizados++;
      porChave.set(k, { ...n, comentario: n.comentario || antigo.comentario || "" });
    } else {
      adicionados++;
      porChave.set(k, n);
    }
  }
  return { registros: [...porChave.values()], adicionados, atualizados };
}

// Distribui as linhas importadas pelos meses e junta com o que já existe, sem duplicar.
// importacoes: documentos atuais da coleção "satisfacao". Devolve só os meses que mudaram:
// { docs: { "AAAA-MM": documento }, resumo: [{ key, adicionados, atualizados, novo }] }
// Se um registro já existe em OUTRO mês (data gravada errada por importação antiga),
// ele é retirado de lá — nunca fica em dois meses.
export function satDistribuir(importacoes, rows, fallbackKey, arquivoNome) {
  const existentes = Object.fromEntries((importacoes || []).map(i => [i.key, i]));
  const grupos = satAgruparPorMes(rows, fallbackKey);
  const destino = new Map();
  for (const [key, lista] of Object.entries(grupos)) for (const r of lista) destino.set(satChaveRegistro(r), key);

  const docs = {}, resumo = [];
  for (const [key, lista] of Object.entries(grupos)) {
    const antigos = (existentes[key]?.registros || []);
    const { registros, adicionados, atualizados } = satMesclarRegistros(antigos, lista);
    docs[key] = satDocumentoMes(key, registros, arquivoNome);
    resumo.push({ key, adicionados, atualizados, novo: !existentes[key] });
  }
  // Retira de outros meses os registros que agora pertencem a um mês diferente.
  for (const imp of importacoes || []) {
    const atual = docs[imp.key]?.registros || imp.registros || [];
    const movidos = atual.filter(r => { const d = destino.get(satChaveRegistro(r)); return d && d !== imp.key; });
    if (!movidos.length) continue;
    // Preserva o comentário que só existia na cópia antiga
    for (const r of movidos) {
      const k = satChaveRegistro(r), alvo = docs[destino.get(k)];
      const reg = alvo?.registros.find(x => satChaveRegistro(x) === k);
      if (reg && !reg.comentario && r.comentario) reg.comentario = r.comentario;
    }
    const restantes = atual.filter(r => !movidos.includes(r));
    const base = docs[imp.key] || imp;
    docs[imp.key] = { ...satDocumentoMes(imp.key, restantes, base.arquivoNome), importadoEm: base.importadoEm };
  }
  resumo.sort((a, b) => a.key.localeCompare(b.key));
  return { docs, resumo };
}

// Monta o documento do mês no mesmo formato usado pela coleção "satisfacao".
export function satDocumentoMes(key, registros, arquivoNome) {
  const [ano, mes] = key.split("-").map(Number);
  const totalResp = registros.filter(r => r.temResposta).length;
  return {
    key, mes, ano, arquivoNome,
    importadoEm: new Date().toISOString(),
    totalRegistros: registros.length,
    totalRespondidos: totalResp,
    totalSemResposta: registros.length - totalResp,
    registros,
  };
}
