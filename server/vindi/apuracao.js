// Apuração da situação financeira a partir das faturas da Vindi — lógica pura (sem rede, sem banco).
//
// Regras:
// • Fatura "pending" só é VENCIDA se a data de vencimento (no fuso de São Paulo) já passou.
//   Pendente com vencimento hoje ou no futuro = em aberto, mas NÃO é inadimplência.
// • "paid" = paga (data = maior paid_at entre as cobranças pagas, quando houver).
// • "canceled" não é dívida nem pagamento. "review"/"scheduled" não contam como vencidas.
// • Valores em centavos (inteiros) — sem erros de arredondamento.
// • O que não dá para saber com segurança fica null; nada é inventado.

export const FUSO = "America/Sao_Paulo";

// "1234.5" | 1234.5 | "1234,56" → 123450 (centavos). Inválido → null.
export function centavos(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const s = String(valor).trim().replace(",", ".");
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const frac = (m[3] || "").padEnd(3, "0");
  let c = Number(m[2]) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) c += 1; // arredonda a 3ª casa
  return m[1] ? -c : c;
}

// Data de calendário em São Paulo ("AAAA-MM-DD") de um instante ISO. Inválido → null.
export function dataSP(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const diasEntre = (a, b) => Math.round((Date.UTC(...b.split("-").map((n, i) => i === 1 ? n - 1 : +n)) - Date.UTC(...a.split("-").map((n, i) => i === 1 ? n - 1 : +n))) / 86400000);

// originais: { idFatura: "AAAA-MM-DD" } — vencimentos já vistos antes. A Vindi ALTERA o due_at da
// própria fatura quando o vencimento é prorrogado (visto em 20/10/2026: 36 faturas vencidas passaram
// a vencer "hoje", sem pagamento). Por isso "vencimento" é sempre o MAIS ANTIGO conhecido (original);
// o atual da Vindi fica em "vencimentoVindi". Prorrogar não tira o cliente da inadimplência.
export function apurarFaturas(bills, agora = new Date(), originais = {}) {
  const hoje = dataSP(agora.toISOString());
  const faturas = [];
  let semVencimento = 0, atualizadoFonte = null;

  for (const b of bills || []) {
    const vencimentoVindi = dataSP(b.due_at);
    // Reemissão (2ª via) cancela a cobrança antiga e cria outra: a antiga continua na fatura com o
    // vencimento anterior — assim se recupera o original mesmo de prorrogações antigas.
    const datas = [originais[String(b.id)], vencimentoVindi, ...(b.charges || []).map(c => dataSP(c.due_at))].filter(Boolean).sort();
    const vencimento = datas[0] || null;
    const pagas = (b.charges || []).filter(c => c.status === "paid" && c.paid_at).map(c => c.paid_at).sort();
    const f = {
      id: b.id,
      status: b.status || null,
      valorCentavos: centavos(b.amount),
      vencimento,
      vencimentoVindi,
      pagoEm: b.status === "paid" && pagas.length ? dataSP(pagas[pagas.length - 1]) : null,
      vencida: b.status === "pending" && !!vencimento && vencimento < hoje,
      ciclo: Number.isInteger(b.period?.cycle) ? b.period.cycle : null,
      inicioPeriodo: dataSP(b.period?.start_at),
      // Fatura cancelada vem com valor zerado na Vindi; o valor da cobrança serve de referência.
      valorCobrancaCentavos: Math.max(0, ...(b.charges || []).map(c => centavos(c.amount) ?? 0)) || null,
      atualizadoFonte: b.updated_at || null,
    };
    if (b.status === "pending" && !vencimento) semVencimento++;
    if (b.updated_at && (!atualizadoFonte || b.updated_at > atualizadoFonte)) atualizadoFonte = b.updated_at;
    faturas.push(f);
  }

  const vencidas = faturas.filter(f => f.vencida).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const pagas = faturas.filter(f => f.status === "paid").sort((a, b) => (a.pagoEm || "").localeCompare(b.pagoEm || ""));
  const ultimaPaga = pagas.length ? pagas[pagas.length - 1] : null;
  const valoresOk = vencidas.every(f => f.valorCentavos !== null);

  return {
    hoje,
    faturas,
    vencidas: {
      qtd: vencidas.length,
      valorCentavos: valoresOk ? vencidas.reduce((s, f) => s + f.valorCentavos, 0) : null,
      maisAntiga: vencidas[0] ? { id: vencidas[0].id, vencimento: vencidas[0].vencimento, valorCentavos: vencidas[0].valorCentavos } : null,
      maisRecente: vencidas.length ? (f => ({ id: f.id, vencimento: f.vencimento, valorCentavos: f.valorCentavos }))(vencidas[vencidas.length - 1]) : null,
      diasDesdeMaisAntiga: vencidas[0] ? diasEntre(vencidas[0].vencimento, hoje) : null,
    },
    abertasNaoVencidas: faturas.filter(f => f.status === "pending" && f.vencimento && f.vencimento >= hoje).length,
    semVencimento,
    ultimaPaga: ultimaPaga ? { id: ultimaPaga.id, valorCentavos: ultimaPaga.valorCentavos, pagoEm: ultimaPaga.pagoEm } : null,
    atualizadoFonte,
    // Só é possível afirmar "sem dívida vencida" se toda pendente tiver vencimento conhecido
    confiavel: semVencimento === 0 && valoresOk,
  };
}

// Decide se o status do inadimplente muda, com regras conservadoras:
// • Só age se a consulta foi completa e a apuração é confiável.
// • Inadimplente → Regularizado quando não há nenhuma fatura vencida.
// • Regularizado → Inadimplente só se o Regularizado tiver sido definido pela própria Vindi.
// • Status definido manualmente (ou Cancelado/Regularizado sem origem conhecida) nunca muda;
//   se a Vindi divergir, devolve um aviso de divergência.
// • Assinatura cancelada na Vindi → Cancelado, qualquer que seja o status atual (inclusive manual).
//   Cancelamento NÃO significa dívida quitada: a situação financeira fica guardada à parte.
// • Cancelado nunca é trocado por Regularizado/Inadimplente numa sincronização posterior.
//   assinaturaCancelada: true / false / null (fatura avulsa — sem assinatura para conferir).
// • A troca automática para Cancelado acontece quando o cancelamento é detectado. Se depois disso
//   alguém alterar o status manualmente, a escolha manual é respeitada (só fica o aviso).
// • Quitado: todas as parcelas do contrato pagas (quitado = true, apurado pelo histórico). Segue as
//   mesmas proteções de Regularizado (status manual não muda; só avisa).
export function decidirStatus({ status, statusOrigem, apuracao, consultaCompleta, assinaturaCancelada = null, cancelamentoJaRegistrado = false, quitado = false }) {
  if (!consultaCompleta) return { novoStatus: null, divergencia: null };
  if (assinaturaCancelada) {
    if (status === "Cancelado") return { novoStatus: null, divergencia: null };
    if (cancelamentoJaRegistrado && statusOrigem === "manual") return { novoStatus: null, divergencia: `A assinatura está cancelada na Vindi, mas o status foi alterado manualmente para ${status}.` };
    return { novoStatus: "Cancelado", divergencia: null };
  }
  if (status === "Cancelado") return { novoStatus: null, divergencia: statusOrigem === "vindi" && assinaturaCancelada === false ? "A assinatura não está mais cancelada na Vindi, mas o status continua Cancelado (altere manualmente se ela foi reativada)." : null };
  if (!apuracao?.confiavel) return { novoStatus: null, divergencia: null };
  const temVencida = apuracao.vencidas.qtd > 0;
  const emDia = status === "Regularizado" || status === "Quitado";
  const protegido = statusOrigem === "manual" || (status !== "Inadimplente" && statusOrigem !== "vindi");

  if (protegido) {
    if (emDia && temVencida) return { novoStatus: null, divergencia: `A Vindi indica ${apuracao.vencidas.qtd} fatura(s) vencida(s), mas o status foi definido manualmente como ${status}.` };
    if (status === "Inadimplente" && !temVencida) return { novoStatus: null, divergencia: "A Vindi não indica faturas vencidas, mas o status foi definido manualmente como Inadimplente." };
    return { novoStatus: null, divergencia: null };
  }
  const alvo = temVencida ? "Inadimplente" : quitado ? "Quitado" : "Regularizado";
  if (status === "Inadimplente" && !temVencida) return { novoStatus: alvo, divergencia: null };
  if (emDia && statusOrigem === "vindi" && alvo !== status) return { novoStatus: alvo, divergencia: null };
  return { novoStatus: null, divergencia: null };
}
