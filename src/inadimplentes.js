// Controle de Inadimplentes — leitura da planilha, parcelas e importação sem duplicar.
// Lógica pura (sem banco, sem tela) para poder ser testada isoladamente.
import { satNorm, satParseData } from "./satisfacao.js";

export const INAD_STATUS = ["Inadimplente", "Cancelado", "Regularizado"];

// ── Colunas da planilha ───────────────────────────────────────────────

// Campos conhecidos → nomes de coluna aceitos (comparados sem acento/maiúsculas).
const COLUNAS = {
  status:          ["status"],
  dataInad:        ["data inad", "data inadimplencia", "data de inadimplencia"],
  numero:          ["n", "no", "numero", "n registro"],
  dataRenovacao:   ["data renovacao"],
  novaValidade:    ["nova validade"],
  nome:            ["nome", "cliente", "nome do cliente"],
  email:           ["email", "e mail"],
  estado:          ["estado", "uf"],
  programa:        ["programa", "sistema"],
  serie:           ["n serie", "no serie", "numero de serie", "serie"],
  tipo:            ["tipo"],
  copias:          ["n copias", "no copias", "copias"],
  valorTotal:      ["valor total"],
  valorLiquido:    ["valor liquido"],
  pagamento:       ["pagamento", "forma de pagamento"],
  numParcelas:     ["n parcelas", "no parcelas", "parcelas"],
  parcelasPagas:   ["n parcelas pagas", "no parcelas pagas", "parcelas pagas"],
  valorPago:       ["valor pago"],
  parcelasAReceber:["n parcelas a receber", "no parcelas a receber", "parcelas a receber"],
  valorAReceber:   ["valor a receber"],
  totalNaoRecebido:["total nao recebido"],
  vendedor:        ["vendedor"],
  vindiUrl:        ["retorno da vindi"],
  idFatura:        ["idfatura idassinatura", "idfatura", "id fatura", "idassinatura"],
  colaborador:     ["colaborador", "responsavel"],
  canceladoFlag:   ["canc"],
};

const normCol = s => satNorm(String(s).replace(/[º°]/g, " ")).replace(/\bn o\b/g, "no");

// Localiza as colunas pelo nome exato (normalizado). Devolve { campo: índice }.
export function inadDetectarColunas(headers) {
  const h = headers.map(normCol);
  const idx = {};
  for (const [campo, nomes] of Object.entries(COLUNAS)) {
    const i = h.findIndex(x => nomes.includes(x));
    if (i >= 0) idx[campo] = i;
  }
  return idx;
}

// As colunas "Data do Pagamento" nem sempre ficam logo após a parcela correspondente
// (na planilha de referência, a data da Parcela 6 está depois da Parcela 8). Por isso cada
// coluna de data é associada à parcela cuja situação (paga = 1) mais combina com ela estar
// preenchida; empates ficam com a parcela imediatamente anterior na planilha.
export function inadMapearParcelas(headers, linhas) {
  const parcelas = [], datas = [];
  headers.forEach((c, i) => {
    const m = normCol(c).match(/^parcela (\d{1,2})$/);
    if (m) parcelas.push({ n: +m[1], col: i });
    else if (normCol(c) === "data do pagamento") datas.push(i);
  });
  const pares = [];
  for (const dc of datas) {
    const anterior = [...parcelas].reverse().find(p => p.col < dc);
    for (const p of parcelas) {
      let acertos = 0;
      for (const r of linhas) if ((r[dc] !== "" && r[dc] != null) === (Number(r[p.col]) === 1)) acertos++;
      pares.push({ dc, n: p.n, acertos, anterior: anterior?.n === p.n ? 1 : 0 });
    }
  }
  pares.sort((a, b) => b.acertos - a.acertos || b.anterior - a.anterior);
  const dataDa = {}, usadas = new Set();
  for (const p of pares) {
    if (dataDa[p.n] !== undefined || usadas.has(p.dc)) continue;
    dataDa[p.n] = p.dc; usadas.add(p.dc);
  }
  return parcelas.map(p => ({ n: p.n, col: p.col, colData: dataDa[p.n] ?? null })).sort((a, b) => a.n - b.n);
}

// ── Leitura de cada linha ─────────────────────────────────────────────

const num = v => {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/[R$\s]/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return isNaN(n) ? null : n;
};
const txt = v => (v === "" || v == null ? "" : String(v).trim());

// Normaliza o status vindo da planilha. Desconhecido → null (o chamador decide).
export function inadStatusPlanilha(valor, canceladoFlag) {
  const s = satNorm(valor);
  if (s.startsWith("cancel") || Number(canceladoFlag) === 1) return "Cancelado";
  if (s.startsWith("regulariz") || s === "pago" || s === "quitado") return "Regularizado";
  if (s.startsWith("inadimpl")) return "Inadimplente";
  return null;
}

// Só aceita links https da Vindi — o botão "Consultar na Vindi" fica indisponível nos demais.
export function inadVindiValido(url) {
  try {
    const u = new URL(String(url || "").trim());
    return u.protocol === "https:" && (u.hostname === "vindi.com.br" || u.hostname.endsWith(".vindi.com.br"));
  } catch { return false; }
}

// Converte uma linha da planilha num registro. Devolve { registro } ou { erro }.
export function inadLerLinha(r, idx, mapaParcelas, headers) {
  const g = campo => (idx[campo] === undefined ? "" : r[idx[campo]]);
  const nome = txt(g("nome"));
  const numero = txt(g("numero"));
  const idFatura = txt(g("idFatura"));
  const serie = txt(g("serie"));
  if (!nome) return { erro: "Nome do cliente vazio" };
  if (!numero && !idFatura && !serie) return { erro: "Sem Nº, Nº Série ou IDFatura para identificar o registro" };

  const dataInad = satParseData(g("dataInad"));
  if (g("dataInad") !== "" && !dataInad) return { erro: "Data de inadimplência inválida" };

  const numParcelas = num(g("numParcelas"));
  if (numParcelas !== null && (!Number.isInteger(numParcelas) || numParcelas < 0 || numParcelas > 60))
    return { erro: "Nº de parcelas inválido" };

  const total = numParcelas ?? mapaParcelas.length;
  const parcelas = mapaParcelas.filter(p => p.n <= total).map(p => {
    const paga = Number(r[p.col]) === 1;
    return { n: p.n, paga, dataPagamento: paga && p.colData !== null ? satParseData(r[p.colData]) : null };
  });

  const url = txt(g("vindiUrl"));
  // Demais colunas preservadas para melhorias futuras (sem o link da Vindi, que pode ter token).
  const usadas = new Set([...Object.values(idx), ...mapaParcelas.flatMap(p => [p.col, p.colData])]);
  const planilha = {};
  headers.forEach((h, i) => {
    if (usadas.has(i) || !String(h).trim()) return;
    let k = String(h).trim(); while (k in planilha) k += " (2)";
    planilha[k] = r[i] === undefined ? "" : r[i];
  });

  return { registro: {
    numero, idFatura, serie, nome,
    email: txt(g("email")), estado: txt(g("estado")), programa: txt(g("programa")), tipo: txt(g("tipo")),
    copias: num(g("copias")), pagamento: txt(g("pagamento")),
    valorTotal: num(g("valorTotal")), valorLiquido: num(g("valorLiquido")), valorPago: num(g("valorPago")),
    valorAReceber: num(g("valorAReceber")), totalNaoRecebido: num(g("totalNaoRecebido")),
    numParcelas: total, parcelas,
    parcelasPagasInformadas: num(g("parcelasPagas")), parcelasAReceberInformadas: num(g("parcelasAReceber")),
    dataInadimplencia: dataInad, dataRenovacao: satParseData(g("dataRenovacao")), novaValidade: satParseData(g("novaValidade")),
    vendedor: txt(g("vendedor")), colaboradorPlanilha: txt(g("colaborador")),
    vindiUrl: inadVindiValido(url) ? url : "",
    statusPlanilha: inadStatusPlanilha(g("status"), g("canceladoFlag")),
    planilha,
  } };
}

// Lê a planilha inteira: { linhas: [{ linha, registro } | { linha, erro }], colunas }.
export function inadLerPlanilha(matriz) {
  const hi = matriz.findIndex(r => r.some(c => normCol(c) === "nome"));
  if (hi < 0) throw new Error("Cabeçalho não encontrado — a planilha precisa ter a coluna 'Nome'.");
  const headers = matriz[hi].map(String);
  const dados = matriz.slice(hi + 1).map((r, i) => ({ r, linha: hi + i + 2 })).filter(x => x.r.some(c => String(c).trim()));
  const idx = inadDetectarColunas(headers);
  const mapa = inadMapearParcelas(headers, dados.map(x => x.r));
  return {
    colunas: idx, parcelas: mapa,
    linhas: dados.map(({ r, linha }) => ({ linha, ...inadLerLinha(r, idx, mapa, headers) })),
  };
}

// ── Cálculos das parcelas e do tempo de inadimplência ──────────────────

export function inadResumoParcelas(reg) {
  const ps = reg.parcelas || [];
  const pagas = ps.filter(p => p.paga).length;
  const ultimaPaga = ps.reduce((m, p) => (p.paga && p.n > m ? p.n : m), 0) || null;
  return {
    total: reg.numParcelas ?? ps.length,
    pagas,
    naoPagas: ps.length - pagas,
    ultimaPaga,
    // parcela não paga com número menor que a última paga ("buraco" no histórico)
    comLacuna: ps.some(p => !p.paga && ultimaPaga && p.n < ultimaPaga),
  };
}

// Situação de cada parcela para exibição (quadradinhos da lista):
//   "paga"      → paga
//   "vencida"   → fatura gerada, não paga e com vencimento já passado (atrasada)
//   "aVencer"   → fatura gerada, não paga, vencimento hoje ou no futuro (ainda não atrasada)
//   "naoGerada" → a Vindi ainda não gerou a fatura desta parcela
//   "naoPaga"   → sem dados da Vindi: só se sabe que não foi paga (não dá para dizer se venceu)
// Com dados da Vindi, cada fatura da assinatura corresponde a uma parcela, na ordem de vencimento
// (conferido em 15/10/2026 nos 84 contratos: nunca há mais faturas que parcelas). A Vindi tem
// prioridade sobre a planilha. hoje = "AAAA-MM-DD".
//
// Com o histórico permanente (vindi.historico, gravado pelo servidor a partir de 20/10/2026):
//   "pagaAtraso" → paga depois do vencimento original (com diasAtraso)
//   a parcela é o ciclo da assinatura na Vindi (period.cycle); sem ciclo, a ordem de vencimento.
//   Faturas canceladas não aparecem — exceto as que estavam vencidas quando a assinatura foi
//   cancelada (valor que ficou em aberto), que continuam laranja.
const PRIORIDADE_ENTRADA = { paga: 4, pagaAtraso: 4, pagaSemData: 4, pendente: 3, outro: 2, cancelada: 1 };
function situacaoPeloHistorico(reg, hoje) {
  const v = reg.vindi;
  const abertasNoCancel = new Set(v.cancelamento?.faturas || []);
  const ents = Object.values(v.historico).filter(e => e.situacao !== "cancelada" || abertasNoCancel.has(e.id));
  const porN = new Map();
  if (ents.length && ents.every(e => Number.isInteger(e.ciclo) && e.ciclo > 0)) {
    for (const e of ents) {
      const ja = porN.get(e.ciclo);
      // 2ª via/renegociação no mesmo ciclo: vale a paga; senão a de vencimento mais recente
      if (!ja || PRIORIDADE_ENTRADA[e.situacao] > PRIORIDADE_ENTRADA[ja.situacao] ||
          (PRIORIDADE_ENTRADA[e.situacao] === PRIORIDADE_ENTRADA[ja.situacao] && (e.vencimento || "") > (ja.vencimento || ""))) porN.set(e.ciclo, e);
    }
  } else {
    ents.sort((a, b) => (a.vencimento || "9999").localeCompare(b.vencimento || "9999")).forEach((e, i) => porN.set(i + 1, e));
  }
  const total = Math.max(reg.numParcelas ?? v.totalParcelasVindi ?? (reg.parcelas || []).length, ...porN.keys(), 0);
  return Array.from({ length: total }, (_, i) => {
    const n = i + 1, e = porN.get(n);
    if (!e) return { n, total, situacao: "naoGerada" };
    const base = { n, total, faturaId: e.id, vencimento: e.vencimento || null, valorCentavos: e.valorCentavos ?? null };
    if (e.situacao === "pagaAtraso") return { ...base, situacao: "pagaAtraso", pagoEm: e.pagoEm, diasAtraso: e.diasAtraso };
    if (e.situacao === "paga" || e.situacao === "pagaSemData") return { ...base, situacao: "paga", pagoEm: e.pagoEm || null, diasAtraso: e.diasAtraso ?? null };
    if (e.situacao === "cancelada") return { ...base, situacao: "vencida", canceladaNaVindi: true };
    if (e.status === "pending" && e.vencimento && e.vencimento < hoje) return { ...base, situacao: "vencida" };
    return { ...base, situacao: "aVencer" };
  });
}

export function inadSituacaoParcelas(reg, hoje) {
  if (reg.vindi?.historico && Object.keys(reg.vindi.historico).length) return situacaoPeloHistorico(reg, hoje);
  const total = reg.numParcelas ?? (reg.parcelas || []).length;
  const faturas = (reg.vindi?.faturas || []).filter(f => f.status !== "canceled")
    .sort((a, b) => (a.vencimento || "9999").localeCompare(b.vencimento || "9999"));
  const planilha = Object.fromEntries((reg.parcelas || []).map(p => [p.n, p]));
  return Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    if (faturas.length) {
      const f = faturas[i];
      if (!f) return { n, situacao: "naoGerada" };
      if (f.status === "paid") return { n, situacao: "paga", pagoEm: f.pagoEm || null, vencimento: f.vencimento || null };
      if (f.status === "pending" && f.vencimento && f.vencimento < hoje) return { n, situacao: "vencida", vencimento: f.vencimento };
      return { n, situacao: "aVencer", vencimento: f.vencimento || null };
    }
    return planilha[n]?.paga ? { n, situacao: "paga", pagoEm: planilha[n].dataPagamento || null } : { n, situacao: "naoPaga" };
  });
}

// Dias e meses completos desde a data de inadimplência ("AAAA-MM-DD"), sem fuso.
export function inadTempo(dataISO, hoje = new Date()) {
  if (!dataISO) return null;
  const [y, m, d] = dataISO.split("-").map(Number);
  const inicio = Date.UTC(y, m - 1, d);
  const fim = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.max(0, Math.round((fim - inicio) / 86400000));
  let meses = (hoje.getFullYear() - y) * 12 + (hoje.getMonth() + 1 - m);
  if (hoje.getDate() < d) meses--;
  return { dias, meses: Math.max(0, meses), maisDeUmMes: meses >= 1 };
}

export function inadTempoTexto(t) {
  if (!t) return "—";
  if (t.meses >= 1) return `há ${t.meses} ${t.meses === 1 ? "mês" : "meses"} (${t.dias} dias)`;
  return t.dias === 0 ? "hoje" : `há ${t.dias} ${t.dias === 1 ? "dia" : "dias"}`;
}

// ── Importação: identifica existentes, mescla e preserva o acompanhamento ──

// Campos que vêm da planilha (a importação pode atualizar). Os demais pertencem ao app.
const CAMPOS_PLANILHA = ["numero", "idFatura", "serie", "nome", "email", "estado", "programa", "tipo", "copias", "pagamento",
  "valorTotal", "valorLiquido", "valorPago", "valorAReceber", "totalNaoRecebido", "numParcelas", "parcelas",
  "parcelasPagasInformadas", "parcelasAReceberInformadas",
  "dataInadimplencia", "dataRenovacao", "novaValidade", "vendedor", "colaboradorPlanilha", "vindiUrl", "statusPlanilha", "planilha"];

// Ao atualizar um registro existente, a importação grava SOMENTE estes campos (update parcial):
// o histórico da Vindi, observações e compromisso nunca são reescritos pela importação — nem se
// a Vindi ou um atendente alterarem o registro entre a leitura e a gravação.
export function inadCamposImportacao(item) {
  return Object.fromEntries([...CAMPOS_PLANILHA, "status", "statusOrigem", "responsavelId", "importadoEm", "arquivoNome"]
    .filter(k => item[k] !== undefined).map(k => [k, item[k]]));
}

const estavel = v => (v === null || typeof v !== "object") ? JSON.stringify(v ?? null)
  : Array.isArray(v) ? `[${v.map(estavel).join(",")}]`
  : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${estavel(v[k])}`).join(",")}}`;

const mesmoCliente = (a, b) =>
  (a.email && b.email && satNorm(a.email) === satNorm(b.email)) || satNorm(a.nome) === satNorm(b.nome);

// Planeja a importação. Nada é gravado aqui: devolve os documentos a gravar e o resumo.
// existentes: registros atuais da coleção (com id). matchEmployee(nome) → id do atendente ou null.
export function inadPlanejarImportacao(existentes, lidas, { matchEmployee = () => null, arquivoNome = "", agora = new Date().toISOString(), novoId } = {}) {
  const porNumero = new Map(), porFatura = new Map(), porSerie = new Map();
  for (const e of existentes) {
    if (e.numero)   porNumero.set(String(e.numero), e);
    if (e.idFatura) porFatura.set(String(e.idFatura), e);
    if (e.serie)    porSerie.set(String(e.serie), e);
  }
  const gravar = [], novosIds = new Set(), resumo = { incluidos: 0, atualizados: 0, ignorados: 0, erros: [], statusPreservado: 0 };
  const vistos = new Set();

  for (const { linha, registro: r, erro } of lidas) {
    if (erro) { resumo.erros.push({ linha, motivo: erro }); continue; }
    const chaves = [r.numero && `n:${r.numero}`, r.idFatura && `f:${r.idFatura}`].filter(Boolean);
    if (chaves.some(k => vistos.has(k))) { resumo.erros.push({ linha, motivo: "Registro repetido no mesmo arquivo" }); continue; }
    chaves.forEach(k => vistos.add(k));

    // Nº identifica o contrato; IDFatura e Nº Série só valem se forem do mesmo cliente.
    let atual = r.numero ? porNumero.get(r.numero) : null;
    if (!atual) {
      const cand = (r.idFatura && porFatura.get(r.idFatura)) || (r.serie && porSerie.get(r.serie));
      if (cand && !mesmoCliente(cand, r)) {
        resumo.erros.push({ linha, motivo: "Identificador (IDFatura/Nº Série) já pertence a outro cliente" });
        continue;
      }
      if (cand && cand.numero && r.numero && cand.numero !== r.numero) {
        resumo.erros.push({ linha, motivo: "Nº diferente do registro com o mesmo IDFatura/Nº Série" });
        continue;
      }
      atual = cand || null;
    }

    const daPlanilha = Object.fromEntries(CAMPOS_PLANILHA.map(k => [k, r[k]]));
    // Identificador ausente na planilha não apaga o que já estava salvo.
    if (atual) for (const k of ["numero", "idFatura", "serie"]) if (!daPlanilha[k] && atual[k]) daPlanilha[k] = atual[k];
    if (!atual) {
      gravar.push({
        id: r.numero ? `inad-${r.numero}` : novoId(),
        ...daPlanilha,
        status: r.statusPlanilha || "Inadimplente", statusOrigem: "planilha",
        responsavelId: matchEmployee(r.colaboradorPlanilha) || null,
        prioridade: false, agendamento: null, observacoes: [],
        origem: "importacao", criadoEm: agora, importadoEm: agora, arquivoNome,
      });
      novosIds.add(gravar[gravar.length - 1].id);
      resumo.incluidos++;
      continue;
    }

    // Cancelado/Regularizado definidos no app não são trocados pela planilha.
    const statusManual = atual.status === "Cancelado" || atual.status === "Regularizado";
    const status = statusManual ? atual.status : (r.statusPlanilha || atual.status || "Inadimplente");
    if (statusManual && r.statusPlanilha && r.statusPlanilha !== atual.status) resumo.statusPreservado++;
    const responsavelId = atual.responsavelId || matchEmployee(r.colaboradorPlanilha) || null;

    const mudou = CAMPOS_PLANILHA.some(k => estavel(atual[k]) !== estavel(daPlanilha[k]))
      || status !== atual.status || responsavelId !== (atual.responsavelId || null);
    if (!mudou) { resumo.ignorados++; continue; }

    // Mantém tudo que é do app (observações, compromisso, importante...) e troca só o que vem da planilha.
    const statusOrigem = status !== atual.status ? "planilha" : atual.statusOrigem;
    gravar.push({ ...atual, ...daPlanilha, status, ...(statusOrigem ? { statusOrigem } : {}), responsavelId, importadoEm: agora, arquivoNome });
    resumo.atualizados++;
  }
  return { gravar, novosIds, resumo };
}
