// Histórico financeiro permanente das parcelas (faturas da Vindi) — lógica pura (sem rede, sem banco).
//
// Fontes (documentação da API da Vindi, GET /v1/bills):
// • Vencimento original = bill.due_at. A Vindi só permite alterar o due_at de faturas AGENDADAS;
//   novo vencimento de cobrança / 2ª via fica em charge.due_at — por isso usamos sempre o da fatura.
// • Data do pagamento = charge.paid_at ("data do pagamento da cobrança").
// • Nº da parcela = bill.period.cycle (ciclo da assinatura).
// • Cancelamento: subscription.cancel_at. Ao cancelar, a Vindi cancela as faturas pendentes
//   (parâmetro cancel_bills, padrão true) — o valor em aberto é reconstruído a partir delas.
//
// Regra de atraso: vencimento em fim de semana ou feriado bancário nacional pode ser pago no
// próximo dia útil sem atraso (regra bancária). Os dias de atraso contam do vencimento original.
// Sem as duas datas, a parcela NÃO é classificada (nada é inventado).

// Tolerância extra em dias úteis após o vencimento. 0 = regra rígida.
// Conferido em 20/10/2026 nos dados reais: o paid_at da Vindi é igual à data de pagamento informada
// pelo banco (payment_date; no PIX, até a hora) — não é data de compensação. Por isso fica 0.
export const TOLERANCIA_DIAS_UTEIS = 0;

// Vencimento codificado na linha digitável do boleto (fator de vencimento FEBRABAN: base 07/10/1997,
// reiniciado em 1000 no dia 22/02/2025). Conferido no boleto real: fator 1600 → 15/10/2026.
export function vencimentoDoBoleto(linha) {
  const n = String(linha || "").replace(/\D/g, "");
  const f = n.length === 47 ? +n.slice(33, 37) : n.length === 44 ? +n.slice(5, 9) : NaN;
  if (!f || f < 1000) return null;
  const novo = somarDias("2025-02-22", f - 1000), antigo = somarDias("1997-10-07", f);
  return novo < "2035-01-01" ? novo : antigo;
}
export const linhaDigitavel = campos => Object.values(campos || {}).find(v => typeof v === "string" && /^\d{44}$|^\d{47}$/.test(v.replace(/[\s.]/g, ""))) || null;

const somarDias = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
export const diasEntre = (a, b) => {
  const u = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(b) - u(a)) / 86400000);
};

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) → "AAAA-MM-DD".
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Dias sem expediente bancário em todo o país (feriados municipais/estaduais não entram).
const cacheFeriados = new Map();
export function feriadosBancarios(ano) {
  if (cacheFeriados.has(ano)) return cacheFeriados.get(ano);
  const p = pascoa(ano);
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25", "12-31"];
  if (ano >= 2024) fixos.push("11-20"); // Consciência Negra: feriado nacional desde 2024
  const s = new Set([
    ...fixos.map(md => `${ano}-${md}`),
    somarDias(p, -48), somarDias(p, -47), // Carnaval (segunda e terça)
    somarDias(p, -2),                     // Sexta-feira Santa
    somarDias(p, 60),                     // Corpus Christi
  ]);
  cacheFeriados.set(ano, s);
  return s;
}

export function diaUtil(iso) {
  const dow = new Date(iso + "T12:00:00Z").getUTCDay();
  return dow !== 0 && dow !== 6 && !feriadosBancarios(Number(iso.slice(0, 4))).has(iso);
}

// Último dia em que o pagamento ainda conta como no prazo.
export function limiteSemAtraso(vencimento, toleranciaDiasUteis = TOLERANCIA_DIAS_UTEIS) {
  let d = vencimento;
  while (!diaUtil(d)) d = somarDias(d, 1);
  for (let n = 0; n < toleranciaDiasUteis; n++) { d = somarDias(d, 1); while (!diaUtil(d)) d = somarDias(d, 1); }
  return d;
}

// { emAtraso, diasAtraso } — null quando falta alguma das datas.
export function classificarPagamento(vencimento, pagoEm, toleranciaDiasUteis = TOLERANCIA_DIAS_UTEIS) {
  if (!vencimento || !pagoEm) return { emAtraso: null, diasAtraso: null };
  const emAtraso = pagoEm > limiteSemAtraso(vencimento, toleranciaDiasUteis);
  return { emAtraso, diasAtraso: emAtraso ? diasEntre(vencimento, pagoEm) : 0 };
}

// Situação gravada de cada fatura. "Vencida" × "a vencer" não é gravada: depende do dia de hoje
// e é calculada na tela a partir do vencimento.
//   paga | pagaAtraso | pagaSemData | pendente | cancelada | outro
export function entradaHistorico(f) {
  let situacao = "outro", emAtraso = null, diasAtraso = null;
  if (f.status === "paid") {
    ({ emAtraso, diasAtraso } = classificarPagamento(f.vencimento, f.pagoEm));
    situacao = emAtraso === null ? "pagaSemData" : emAtraso ? "pagaAtraso" : "paga";
  } else if (f.status === "pending" || f.status === "scheduled" || f.status === "review") situacao = "pendente";
  else if (f.status === "canceled") situacao = "cancelada";
  return {
    id: String(f.id), ciclo: f.ciclo ?? null, vencimento: f.vencimento || null, vencimentoVindi: f.vencimentoVindi || f.vencimento || null, valorCentavos: f.valorCentavos ?? null,
    status: f.status || null, situacao, pagoEm: f.pagoEm || null, diasAtraso, atualizadoFonte: f.atualizadoFonte || null,
    ...(f.transacaoConferida ? { transacaoConferida: f.transacaoConferida } : {}),
  };
}

// Junta o histórico gravado com as faturas recém-consultadas, por ID da fatura:
// • entradas nunca são removidas (mesmo que a fatura não venha mais na consulta);
// • dado mais antigo (updated_at menor) não sobrescreve o gravado — eventos fora de ordem;
// • um pagamento já registrado não se perde se a fatura mudar depois (estorno/cancelamento):
//   fica em "pagamentoAnterior".
// Devolve { historico, mudou }.
export function mesclarHistorico(anterior, faturas, agoraISO) {
  const historico = { ...(anterior || {}) };
  let mudou = false;
  for (const f of faturas || []) {
    if (f?.id === undefined || f?.id === null) continue;
    const id = String(f.id), ant = historico[id];
    if (ant?.atualizadoFonte && f.atualizadoFonte && f.atualizadoFonte < ant.atualizadoFonte) continue;
    // Vencimento original: o mais antigo já visto (prorrogação na Vindi não apaga o original).
    const fo = ant?.vencimento && f.vencimento && ant.vencimento < f.vencimento ? { ...f, vencimento: ant.vencimento } : f;
    const nova = { ...entradaHistorico(fo), registradoEm: ant?.registradoEm || agoraISO };
    const pagaAntes = ant && (ant.situacao === "paga" || ant.situacao === "pagaAtraso" || ant.situacao === "pagaSemData");
    const pagaAgora = nova.situacao === "paga" || nova.situacao === "pagaAtraso" || nova.situacao === "pagaSemData";
    // A Vindi zera o valor da fatura cancelada: guarda o valor conhecido de antes (ou o da cobrança).
    if (!nova.transacaoConferida && ant?.transacaoConferida) nova.transacaoConferida = ant.transacaoConferida;
    if (nova.situacao === "cancelada" && !(nova.valorCentavos > 0)) {
      const conhecido = ant?.valorCentavos > 0 ? ant.valorCentavos : f.valorCobrancaCentavos > 0 ? f.valorCobrancaCentavos : null;
      nova.valorCentavos = conhecido;
      nova.valorZeradoNaVindi = true;
    }
    if (pagaAntes && !pagaAgora) nova.pagamentoAnterior = { situacao: ant.situacao, pagoEm: ant.pagoEm, diasAtraso: ant.diasAtraso };
    else if (ant?.pagamentoAnterior) nova.pagamentoAnterior = ant.pagamentoAnterior;
    if (!ant || JSON.stringify(semData(ant)) !== JSON.stringify(semData(nova))) { historico[id] = nova; mudou = true; }
  }
  return { historico, mudou };
}
const semData = e => { const { registradoEm, ...resto } = e; return Object.keys(resto).sort().map(k => [k, resto[k]]); };

// Resumo do cancelamento: data e o que estava vencido (em aberto) naquele momento.
// Faturas que estavam vencidas e foram canceladas JUNTO com a assinatura (updated_at a partir de
// 1 h antes do cancel_at) contam como valor em aberto; renegociações antigas não entram.
// Faturas do mesmo ciclo (2ª via/renegociação) contam uma vez só.
// Valor zero em fatura cancelada = desconhecido (a Vindi zera ao cancelar) — nunca soma R$ 0 como se fosse real.
export function apurarCancelamento(assinatura, faturas, { janelaMs = 60 * 60 * 1000 } = {}) {
  if (assinatura?.status !== "canceled") return null;
  const em = assinatura.cancel_at || null;
  const t = em ? new Date(em).getTime() : NaN;
  if (!em || isNaN(t)) return { em: null, data: null, vencidasQtd: null, valorEmAbertoCentavos: null, faturas: [], confiavel: false };
  const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  const abertas = (faturas || []).filter(f => f.vencimento && f.vencimento < data && (
    f.status === "pending" ||
    (f.status === "canceled" && f.atualizadoFonte && new Date(f.atualizadoFonte).getTime() >= t - janelaMs)));
  const porCiclo = new Map();
  for (const f of abertas) {
    const k = f.ciclo != null ? `c${f.ciclo}` : `f${f.id}`;
    const ja = porCiclo.get(k);
    if (!ja || (f.vencimento || "") > (ja.vencimento || "")) porCiclo.set(k, f);
  }
  const lista = [...porCiclo.values()].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const valoresOk = lista.every(f => f.valorCentavos !== null && f.valorCentavos !== undefined && !(f.status === "canceled" && f.valorCentavos === 0));
  return {
    em, data,
    vencidasQtd: lista.length,
    valorEmAbertoCentavos: valoresOk ? lista.reduce((s, f) => s + f.valorCentavos, 0) : null,
    faturas: lista.map(f => String(f.id)),
    confiavel: valoresOk,
  };
}
