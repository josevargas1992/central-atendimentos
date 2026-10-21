// Sincronização de um inadimplente com a Vindi: localiza a assinatura/fatura, consulta a API,
// apura a situação e grava SOMENTE o campo "vindi" (e o status, quando as regras permitem).
// Observações, compromisso, importante, responsável e dados do Excel nunca são tocados.
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { apurarFaturas, decidirStatus } from "./apuracao.js";
import { mesclarHistorico, apurarCancelamento, vencimentoDoBoleto, linhaDigitavel } from "./historico.js";
import { ErroVindi } from "./cliente.js";

export const COL_INAD   = "inadimplentes";
export const COL_SINC   = "vindi_sincronizacoes";
export const COL_EVENTOS = "vindi_eventos";

const MAX_FATURAS_GUARDADAS = 60;

// ID da fatura no link "Retorno da Vindi" (…/customer/bills/<id>?…) — o token do link nunca é lido.
export function faturaDoLink(url) {
  try { return new URL(url).pathname.match(/\/bills\/(\d+)/)?.[1] || null; } catch { return null; }
}

// Encontra o inadimplente ligado a uma assinatura/fatura/cliente da Vindi.
// Retorna { registro, por } ou { registro: null, motivo }.
export function localizarRegistro(registros, { assinaturaId, faturaId, email }) {
  const s = assinaturaId != null ? String(assinaturaId) : null;
  const f = faturaId != null ? String(faturaId) : null;
  const unico = (lista, por) => lista.length === 1 ? { registro: lista[0], por } : lista.length > 1 ? { registro: null, motivo: `Mais de um registro corresponde (${por}).` } : null;
  return (
    (s && unico(registros.filter(r => r.vindi?.assinaturaId === s), "assinatura já vinculada")) ||
    (s && unico(registros.filter(r => String(r.idFatura || "") === s), "IDFatura/IDAssinatura")) ||
    (f && unico(registros.filter(r => (r.vindi?.faturas || []).some(x => String(x.id) === f)), "fatura já sincronizada")) ||
    (f && unico(registros.filter(r => faturaDoLink(r.vindiUrl) === f || String(r.idFatura || "") === f), "fatura do link")) ||
    (email && unico(registros.filter(r => r.email && r.email.trim().toLowerCase() === String(email).trim().toLowerCase()), "e-mail do cliente")) ||
    { registro: null, motivo: "Nenhum inadimplente corresponde a esta assinatura/fatura." }
  );
}

// Descobre a assinatura do registro: prioriza IDAssinatura; usa a fatura (link/IDFatura) para chegar nela.
async function resolverAssinatura(cliente, reg) {
  const candidatos = [...new Set([reg.vindi?.assinaturaId, reg.idFatura].filter(Boolean).map(String))];
  for (const id of candidatos) {
    const sub = await cliente.assinatura(id);
    if (sub) return { assinatura: sub, faturaAvulsa: null, via: id === reg.vindi?.assinaturaId ? "vinculada" : "IDAssinatura" };
  }
  const faturas = [...new Set([faturaDoLink(reg.vindiUrl), reg.idFatura].filter(Boolean).map(String))];
  for (const id of faturas) {
    const bill = await cliente.fatura(id);
    if (!bill) continue;
    if (bill.subscription?.id) {
      const sub = await cliente.assinatura(bill.subscription.id);
      if (sub) return { assinatura: sub, faturaAvulsa: null, via: "fatura" };
    }
    return { assinatura: null, faturaAvulsa: bill, via: "fatura avulsa" };
  }
  return null;
}

const resumoFaturas = faturas => faturas
  .sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || ""))
  .slice(0, MAX_FATURAS_GUARDADAS)
  .map(f => ({ id: String(f.id), status: f.status, valorCentavos: f.valorCentavos, vencimento: f.vencimento, vencimentoVindi: f.vencimentoVindi || null, pagoEm: f.pagoEm, vencida: f.vencida }));

// Prorrogação por reemissão do boleto: a Vindi cancela a transação antiga e emite outra na MESMA
// cobrança, e o due_at da fatura passa a ser o novo. O vencimento original fica no 1º boleto emitido
// (linha digitável das transações). Só consulta cobranças cuja última transação é bem posterior à
// criação (houve reemissão) e só uma vez por transação (fica em historico.<fatura>.transacaoConferida).
// Devolve { idFatura: { vencimento, transacao } }.
export async function vencimentosDosBoletos(cliente, bills, historicoAnt = {}) {
  const res = {};
  if (typeof cliente.transacoesDaCobranca !== "function") return res;
  for (const b of bills || []) {
    for (const c of b.charges || []) {
      const lt = c.last_transaction;
      if (!lt?.id || !lt.created_at || !c.created_at) continue;
      if (Date.parse(lt.created_at) - Date.parse(c.created_at) < 60 * 60 * 1000) continue; // sem reemissão
      if (historicoAnt[String(b.id)]?.transacaoConferida === String(lt.id)) continue;      // já conferida
      const datas = (await cliente.transacoesDaCobranca(c.id))
        .map(t => vencimentoDoBoleto(linhaDigitavel(t.gateway_response_fields))).filter(Boolean).sort();
      const atual = res[String(b.id)];
      res[String(b.id)] = { vencimento: [atual?.vencimento, datas[0]].filter(Boolean).sort()[0] || null, transacao: String(lt.id) };
    }
  }
  return res;
}

// Sincroniza um registro. Nunca lança erro: devolve { resultado, ... } e grava o histórico.
// ambiente "sandbox" → apenas registra no histórico (marcado como teste), nunca altera o inadimplente.
export async function sincronizarRegistro({ db, cliente, registro, origem, evento = null, ambiente, agora = new Date() }) {
  const ref = db.collection(COL_INAD).doc(registro.id);
  const base = { em: agora.toISOString(), origem, ambiente, evento: evento?.tipo || null, inadId: registro.id,
    faturaId: evento?.faturaId || null, assinaturaId: evento?.assinaturaId || registro.vindi?.assinaturaId || null };
  const log = dados => db.collection(COL_SINC).add({ ...base, ...dados });
  const teste = ambiente !== "producao";

  try {
    const r = await resolverAssinatura(cliente, registro);
    if (!r) {
      // Distingue "registro sem identificadores" de "identificadores não encontrados neste ambiente da Vindi"
      // (ex.: no sandbox não existem as assinaturas reais de produção).
      const temIds = !!(registro.vindi?.assinaturaId || registro.idFatura || faturaDoLink(registro.vindiUrl));
      const amb = ambiente === "producao" ? "produção" : "teste (sandbox)";
      const msg = !temIds
        ? "Não foi possível localizar a assinatura ou fatura na Vindi: este registro não tem IDAssinatura/IDFatura nem link da Vindi."
        : `Não foi possível localizar a assinatura ou fatura na Vindi: os identificadores deste registro não foram encontrados no ambiente de ${amb}.` +
          (ambiente !== "producao" ? " No sandbox só existem dados de teste — os clientes reais só serão encontrados com a chave de produção." : "");
      if (!teste) await ref.update({ "vindi.sincStatus": "erro", "vindi.sincErro": msg, "vindi.ultimaTentativa": base.em });
      await log({ resultado: "sem_identificador", erro: msg });
      return { resultado: "sem_identificador", mensagem: msg };
    }
    const bills = r.assinatura ? await cliente.faturasDaAssinatura(r.assinatura.id) : [r.faturaAvulsa];
    const boletos = await vencimentosDosBoletos(cliente, bills, registro.vindi?.historico);
    // true/false conforme a assinatura; null para fatura avulsa (não há assinatura para conferir)
    const assinaturaCancelada = r.assinatura ? r.assinatura.status === "canceled" : null;

    // Monta o novo campo "vindi" a partir do estado ATUAL do registro (lido de novo na transação).
    const montar = atual => {
      const vAnt = atual.vindi || {};
      // Vencimentos já conhecidos (histórico e última sincronização) — preservam o original se a Vindi prorrogar.
      const originais = {};
      for (const f of [...(vAnt.faturas || []), ...Object.values(vAnt.historico || {})])
        if (f?.id != null && f.vencimento && (!originais[String(f.id)] || f.vencimento < originais[String(f.id)])) originais[String(f.id)] = f.vencimento;
      for (const [id, x] of Object.entries(boletos)) if (x.vencimento && (!originais[id] || x.vencimento < originais[id])) originais[id] = x.vencimento;
      const ap = apurarFaturas(bills, agora, originais);
      for (const f of ap.faturas) if (boletos[String(f.id)]) f.transacaoConferida = boletos[String(f.id)].transacao;
      // Proteção contra dados antigos: se a Vindi devolver algo mais velho do que já gravado, não aplica.
      if (vAnt.atualizadoFonte && ap.atualizadoFonte && ap.atualizadoFonte < vAnt.atualizadoFonte) return { antigo: true };
      // Histórico permanente por fatura: só acrescenta/atualiza, nunca apaga.
      const { historico } = mesclarHistorico(vAnt.historico, ap.faturas, base.em);
      // Valor em aberto no cancelamento: usa o valor guardado no histórico (a Vindi zera o das canceladas).
      const cancelApurado = r.assinatura ? apurarCancelamento(r.assinatura, ap.faturas.map(f => ({ ...f, valorCentavos: historico[String(f.id)]?.valorCentavos ?? f.valorCentavos }))) : null;
      // Cancelamento já registrado (mesma data) não é refeito — webhook repetido não muda nada.
      const jaRegistrado = !!(cancelApurado && vAnt.cancelamento?.em && vAnt.cancelamento.em === cancelApurado.em);
      const cancelamento = cancelApurado
        ? (jaRegistrado ? vAnt.cancelamento : { ...cancelApurado, detectadoEm: base.em, origem })
        : (vAnt.cancelamento || null);
      const { novoStatus, divergencia } = decidirStatus({ status: atual.status, statusOrigem: atual.statusOrigem, apuracao: ap, consultaCompleta: true, assinaturaCancelada, cancelamentoJaRegistrado: jaRegistrado });
      const vindi = {
        ambiente,
        assinaturaId: r.assinatura ? String(r.assinatura.id) : null,
        assinaturaStatus: r.assinatura?.status || null,
        vinculadoPor: r.via,
        faturaAvulsaId: r.faturaAvulsa ? String(r.faturaAvulsa.id) : null,
        vencidasQtd: ap.vencidas.qtd,
        vencidoCentavos: ap.vencidas.valorCentavos,
        vencidaMaisAntiga: ap.vencidas.maisAntiga,
        vencidaMaisRecente: ap.vencidas.maisRecente,
        diasEmAtraso: ap.vencidas.diasDesdeMaisAntiga,
        inadimplenteDesde: ap.vencidas.maisAntiga?.vencimento || null,
        abertasNaoVencidas: ap.abertasNaoVencidas,
        ultimaPaga: ap.ultimaPaga,
        faturas: resumoFaturas(ap.faturas),
        historico,
        totalParcelasVindi: Number.isInteger(r.assinatura?.billing_cycles) ? r.assinatura.billing_cycles : (vAnt.totalParcelasVindi ?? null),
        cancelamento,
        apuracaoConfiavel: ap.confiavel,
        divergencia: divergencia || null,
        atualizadoFonte: ap.atualizadoFonte,
        ultimaSincronizacao: base.em,
        ultimaTentativa: base.em,
        sincStatus: ap.confiavel ? "ok" : "incompleto",
        sincErro: ap.confiavel ? null : "A Vindi não informou dados suficientes (vencimento ou valor) para concluir a situação.",
      };
      const alteracoes = {
        vencidasDe: vAnt.vencidasQtd ?? null, vencidasPara: vindi.vencidasQtd,
        vencidoDe: vAnt.vencidoCentavos ?? null, vencidoPara: vindi.vencidoCentavos,
        statusDe: atual.status, statusPara: novoStatus || atual.status,
      };
      return { vindi, novoStatus, divergencia, alteracoes };
    };

    let m;
    if (teste) m = montar(registro);
    else m = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { removido: true };
      const res = montar({ id: snap.id, ...snap.data() });
      if (res.antigo) return res;
      const upd = { vindi: res.vindi };
      if (res.novoStatus) { upd.status = res.novoStatus; upd.statusOrigem = "vindi"; }
      tx.update(ref, upd);
      return res;
    });
    if (m.removido) {
      await log({ resultado: "erro", erro: "O registro foi excluído durante a sincronização." });
      return { resultado: "erro", codigo: "interno", mensagem: "O registro foi excluído durante a sincronização." };
    }
    if (m.antigo) {
      await log({ resultado: "ignorado_antigo", assinaturaId: r.assinatura ? String(r.assinatura.id) : null });
      return { resultado: "ignorado_antigo" };
    }
    const { vindi, novoStatus, divergencia, alteracoes } = m;
    await log({ resultado: teste ? "teste" : "ok", assinaturaId: vindi.assinaturaId, alteracoes, divergencia: vindi.divergencia,
      ...(vindi.cancelamento && novoStatus === "Cancelado" ? { cancelamento: { em: vindi.cancelamento.em, vencidasQtd: vindi.cancelamento.vencidasQtd, valorEmAbertoCentavos: vindi.cancelamento.valorEmAbertoCentavos } } : {}) });
    return { resultado: teste ? "teste" : "ok", vindi, novoStatus, divergencia };
  } catch (e) {
    const codigo = e instanceof ErroVindi ? e.codigo : "interno";
    const msg = e instanceof ErroVindi ? e.message : "Erro interno ao sincronizar.";
    if (!(e instanceof ErroVindi)) console.error("sincronizarRegistro", registro.id, e?.message);
    // Mantém os últimos dados confiáveis: só marca o erro e a tentativa.
    if (!teste) await ref.update({ "vindi.sincStatus": "erro", "vindi.sincErro": msg, "vindi.ultimaTentativa": base.em }).catch(() => {});
    await log({ resultado: "erro", codigo, erro: msg }).catch(() => {});
    return { resultado: "erro", codigo, mensagem: msg };
  }
}

// ── Webhooks ────────────────────────────────────────────────────────────

export const EVENTOS_SUPORTADOS = ["bill_paid", "bill_canceled", "bill_overdue", "charge_rejected", "subscription_canceled"];

// Valida o formato { event: { type, created_at, data: {...} } } e extrai só o necessário (sem dados pessoais/links).
export function lerEvento(corpo) {
  const ev = corpo?.event;
  if (!ev || typeof ev !== "object" || typeof ev.type !== "string" || typeof ev.created_at !== "string" || !ev.data || typeof ev.data !== "object")
    return { erro: "Formato inválido: esperado { event: { type, created_at, data } }." };
  const d = ev.data;
  const bill = d.bill, charge = d.charge, sub = d.subscription;
  const obj = bill || charge || sub || null;
  return { evento: {
    tipo: ev.type.slice(0, 60),
    criadoEmVindi: ev.created_at.slice(0, 40),
    objetoTipo: bill ? "bill" : charge ? "charge" : sub ? "subscription" : null,
    objetoId: obj?.id != null ? String(obj.id) : null,
    objetoStatus: obj?.status ? String(obj.status).slice(0, 30) : null,
    objetoAtualizadoEm: obj?.updated_at ? String(obj.updated_at).slice(0, 40) : null,
    faturaId: bill?.id != null ? String(bill.id) : charge?.bill?.id != null ? String(charge.bill.id) : null,
    assinaturaId: sub?.id != null ? String(sub.id) : bill?.subscription?.id != null ? String(bill.subscription.id) : null,
    clienteEmail: (bill?.customer || charge?.customer || sub?.customer)?.email || null,
  } };
}

// A Vindi não envia ID de evento: a duplicidade é detectada por uma impressão digital do conteúdo relevante.
export function chaveEvento(ev) {
  return createHash("sha256").update([ev.tipo, ev.criadoEmVindi, ev.objetoTipo, ev.objetoId, ev.objetoStatus, ev.objetoAtualizadoEm].join("|")).digest("hex").slice(0, 40);
}

// Grava o evento antes de processar (nunca se perde). Devolve { chave, duplicado, jaProcessado }.
export async function registrarEvento(db, ev, ambiente, agora = new Date()) {
  const chave = chaveEvento(ev);
  const ref = db.collection(COL_EVENTOS).doc(chave);
  try {
    // email não é guardado no evento (dado pessoal); fica só em memória para localizar o registro
    const { clienteEmail, ...semEmail } = ev;
    await ref.create({ ...semEmail, ambiente, status: "pendente", tentativas: 0, recebidoEm: agora.toISOString() });
    return { chave, duplicado: false, jaProcessado: false };
  } catch (e) {
    if (e?.code === 6 || /already exists/i.test(e?.message || "")) {
      const snap = await ref.get();
      return { chave, duplicado: true, jaProcessado: snap.exists && snap.data().status === "processado" };
    }
    throw e;
  }
}

// Processa um evento já registrado: localiza o inadimplente e sincroniza pela API (o webhook nunca é a verdade).
export async function processarEvento({ db, cliente, chave, ev, ambiente, agora = new Date() }) {
  const evRef = db.collection(COL_EVENTOS).doc(chave);
  const fim = (status, dados = {}) => evRef.update({ status, processadoEm: new Date().toISOString(), ...dados });
  try {
    await evRef.update({ tentativas: FieldValue.increment(1) });
    if (!EVENTOS_SUPORTADOS.includes(ev.tipo)) { await fim("ignorado", { motivo: "Tipo de evento não monitorado." }); return { resultado: "ignorado" }; }

    // Para cobrança rejeitada, chega-se à assinatura pela fatura da cobrança.
    let assinaturaId = ev.assinaturaId;
    if (!assinaturaId && ev.faturaId) { const b = await cliente.fatura(ev.faturaId); assinaturaId = b?.subscription?.id != null ? String(b.subscription.id) : null; }

    const registros = (await db.collection(COL_INAD).get()).docs.map(d => ({ id: d.id, ...d.data() }));
    const loc = localizarRegistro(registros, { assinaturaId, faturaId: ev.faturaId, email: ev.clienteEmail });
    if (!loc.registro) {
      await db.collection(COL_SINC).add({ em: agora.toISOString(), origem: "webhook", ambiente, evento: ev.tipo, faturaId: ev.faturaId, assinaturaId, inadId: null, resultado: "nao_vinculado", erro: loc.motivo });
      await fim("nao_vinculado", { motivo: loc.motivo });
      return { resultado: "nao_vinculado", mensagem: loc.motivo };
    }
    const reg = assinaturaId && !loc.registro.vindi?.assinaturaId ? { ...loc.registro, vindi: { ...(loc.registro.vindi || {}), assinaturaId } } : loc.registro;
    const r = await sincronizarRegistro({ db, cliente, registro: reg, origem: "webhook", evento: { ...ev, assinaturaId }, ambiente, agora });
    if (r.resultado === "erro") { await fim("erro", { erro: r.mensagem }); return r; }
    await fim("processado", { inadId: reg.id, resultado: r.resultado });
    return r;
  } catch (e) {
    const msg = e instanceof ErroVindi ? e.message : "Erro interno ao processar o evento.";
    await fim("erro", { erro: msg }).catch(() => {});
    return { resultado: "erro", mensagem: msg };
  }
}
