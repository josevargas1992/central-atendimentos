// Testes do Controle de Inadimplentes — planilha sintética que imita a estrutura real
// (inclusive as colunas "Data do Pagamento" fora de ordem). Nenhum dado real de cliente.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inadLerPlanilha, inadMapearParcelas, inadResumoParcelas, inadTempo, inadTempoTexto,
  inadPlanejarImportacao, inadVindiValido, inadStatusPlanilha, inadSituacaoParcelas,
} from "../src/inadimplentes.js";

const S = (d, m, y) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; // data → número de série do Excel

// Cabeçalho como o real: a data da Parcela 6 vem DEPOIS da Parcela 8.
const H = ["Status", "Data Inad.", "Canc.", "Nº", "Nome", "Email", "Programa", "Nº Série", "Nº Cópias", "Pagamento",
  "Nº Parcelas", "Nº Parcelas Pagas", "Nº Parcelas a Receber", "Valor a Receber",
  "Parcela 1", "Data do Pagamento", "Parcela 2", "Data do Pagamento", "Parcela 3", "Data do Pagamento",
  "Parcela 4", "Data do Pagamento", "Parcela 5", "Data do Pagamento", "Parcela 6", "Parcela 7", "Data do Pagamento",
  "Parcela 8", "Data do Pagamento", "Data do Pagamento", "Parcela 9", "Data do Pagamento", "Parcela 10", "Data do Pagamento",
  "Parcela 11", "Data do Pagamento", "Parcela 12", "Data do Pagamento",
  "Retorno da Vindi", "IDFatura / IDAssinatura", "Colaborador", "Desconto"];

// pagas: lista de parcelas pagas (1..12); datas: dia do mês em que cada uma foi paga
function linha({ status = "Inadimplente", inad = S(10, 8, 2026), canc = 0, n, nome, email = "", n12 = 12, pagas = [], serie, fatura, vindi = "", colab = "" }) {
  const p = k => (pagas.includes(k) ? 1 : 0), d = k => (pagas.includes(k) ? S(5, k, 2026) : "");
  return [status, inad, canc, n, nome, email, "Previus", serie ?? `S${n}`, 1, "Boleto", n12, pagas.length, n12 - pagas.length, 99.9,
    p(1), d(1), p(2), d(2), p(3), d(3), p(4), d(4), p(5), d(5), p(6), p(7), d(7), p(8), d(6), d(8),
    p(9), d(9), p(10), d(10), p(11), d(11), p(12), d(12),
    vindi, fatura ?? `F${n}`, colab, 0];
}
const oito = [1, 2, 3, 4, 5, 6, 7, 8];
const planilha = linhas => [H, ...linhas];
const ler = linhas => inadLerPlanilha(planilha(linhas));

// ── Parcelas ──────────────────────────────────────────────────────────

test("cada coluna de data é ligada à parcela certa, mesmo fora de ordem", () => {
  const dados = [linha({ n: 1, nome: "A", pagas: oito }), linha({ n: 2, nome: "B", pagas: [1, 2, 3, 4, 5, 6] }), linha({ n: 3, nome: "C", pagas: [1, 2, 3, 4, 5, 6, 7] })];
  const mapa = inadMapearParcelas(H, dados);
  const col = n => mapa.find(p => p.n === n).colData;
  assert.equal(H[col(6)], "Data do Pagamento");
  assert.equal(col(6), H.indexOf("Parcela 8") + 1, "a data da P6 está logo após a P8");
  assert.equal(col(7), H.indexOf("Parcela 7") + 1);
  assert.equal(col(8), H.indexOf("Parcela 8") + 2);
  const r = ler(dados).linhas[0].registro;
  assert.equal(r.parcelas[5].dataPagamento, "2026-06-05", "P6 paga em junho, não com a data de outra parcela");
});

test("exemplo do pedido: 12 parcelas, 1 a 8 pagas → última paga 8, quatro não pagas", () => {
  const r = ler([linha({ n: 10, nome: "Cliente", pagas: oito })]).linhas[0].registro;
  assert.deepEqual(inadResumoParcelas(r), { total: 12, pagas: 8, naoPagas: 4, ultimaPaga: 8, comLacuna: false });
});

test("parcela não paga no meio é identificada individualmente (não só pelo total)", () => {
  const r = ler([linha({ n: 11, nome: "Lacuna", pagas: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11] })]).linhas[0].registro;
  const s = inadResumoParcelas(r);
  assert.equal(s.pagas, 10);
  assert.equal(s.ultimaPaga, 11);
  assert.equal(s.naoPagas, 2);
  assert.equal(s.comLacuna, true);
  assert.deepEqual(r.parcelas.filter(p => !p.paga).map(p => p.n), [10, 12]);
});

test("contrato com menos parcelas ignora as colunas além do total", () => {
  const r = ler([linha({ n: 12, nome: "Seis", n12: 6, pagas: [1, 2, 3] })]).linhas[0].registro;
  assert.equal(r.parcelas.length, 6);
  assert.equal(inadResumoParcelas(r).naoPagas, 3);
});

// ── Tempo de inadimplência ────────────────────────────────────────────

test("tempo desde a inadimplência e o corte de 'mais de um mês'", () => {
  const hoje = new Date(2026, 9, 14); // 14/10/2026
  assert.deepEqual(inadTempo("2026-09-14", hoje), { dias: 30, meses: 1, maisDeUmMes: true });
  assert.equal(inadTempo("2026-09-15", hoje).maisDeUmMes, false);
  assert.equal(inadTempo("2026-08-12", hoje).meses, 2);
  assert.equal(inadTempoTexto(inadTempo("2026-10-10", hoje)), "há 4 dias");
  assert.equal(inadTempo(null, hoje), null);
});

// ── Validação ─────────────────────────────────────────────────────────

test("linhas inválidas viram erro sem impedir as válidas", () => {
  const L = ler([
    linha({ n: 20, nome: "Válido" }),
    linha({ n: 21, nome: "" }),
    linha({ n: "", nome: "Sem ids", serie: "", fatura: "" }),
    [...linha({ n: 22, nome: "Data ruim" }).slice(0, 1), "31/02/xx", ...linha({ n: 22, nome: "Data ruim" }).slice(2)],
  ]);
  assert.equal(L.linhas.filter(l => l.registro).length, 1);
  assert.deepEqual(L.linhas.filter(l => l.erro).map(l => l.linha), [3, 4, 5]);
  const { gravar, resumo } = inadPlanejarImportacao([], L.linhas, { novoId: () => "x" });
  assert.equal(gravar.length, 1);
  assert.equal(resumo.erros.length, 3);
});

test("link da Vindi: só https do domínio da Vindi; caso contrário fica vazio", () => {
  assert.equal(inadVindiValido("https://app.vindi.com.br/customer/bills/1?token=abc"), true);
  for (const u of ["", "javascript:alert(1)", "http://app.vindi.com.br/x", "https://vindi.com.br.golpe.com/x", "texto"])
    assert.equal(inadVindiValido(u), false, u);
  const r = ler([linha({ n: 30, nome: "Sem link", vindi: "https://exemplo.com/x" })]).linhas[0].registro;
  assert.equal(r.vindiUrl, "");
});

test("o link da Vindi não é copiado para os campos extras preservados", () => {
  const r = ler([linha({ n: 31, nome: "Token", vindi: "https://app.vindi.com.br/customer/bills/9?token=SEGREDO" })]).linhas[0].registro;
  assert.ok(!JSON.stringify(r.planilha).includes("SEGREDO"));
  assert.equal(r.planilha.Desconto, 0, "colunas não mapeadas são preservadas");
});

test("status da planilha", () => {
  assert.equal(inadStatusPlanilha("Inadimplente", 0), "Inadimplente");
  assert.equal(inadStatusPlanilha("Inadimplente", 1), "Cancelado");
  assert.equal(inadStatusPlanilha("REGULARIZADO", 0), "Regularizado");
  assert.equal(inadStatusPlanilha("???", 0), null);
});

// ── Importação sem duplicar, preservando o acompanhamento ──────────────

const plano = (existentes, linhas, extra = {}) => inadPlanejarImportacao(existentes, ler(linhas).linhas, { novoId: () => "novo", ...extra });

test("importar o mesmo arquivo de novo não duplica (tudo ignorado)", () => {
  const linhas = [linha({ n: 40, nome: "A" }), linha({ n: 41, nome: "B" })];
  const p1 = plano([], linhas);
  assert.equal(p1.resumo.incluidos, 2);
  const p2 = plano(p1.gravar, linhas);
  assert.deepEqual([p2.resumo.incluidos, p2.resumo.atualizados, p2.resumo.ignorados], [0, 0, 2]);
  assert.equal(p2.gravar.length, 0);
});

test("dados financeiros mais recentes atualizam o registro e preservam o acompanhamento", () => {
  const [base] = plano([], [linha({ n: 50, nome: "Cliente", pagas: [1, 2] })]).gravar;
  const comAcomp = { ...base, observacoes: [{ id: "o1", texto: "Ligou, prometeu pagar" }], prioridade: true,
    agendamento: { titulo: "Promessa", dataHora: "2026-10-20T10:00", concluido: false }, responsavelId: "ana" };
  const { gravar, resumo } = plano([comAcomp], [linha({ n: 50, nome: "Cliente", pagas: [1, 2, 3], colab: "Outro" })], { matchEmployee: () => "outro" });
  assert.equal(resumo.atualizados, 1);
  const r = gravar[0];
  assert.equal(inadResumoParcelas(r).pagas, 3, "financeiro atualizado");
  assert.deepEqual(r.observacoes, comAcomp.observacoes);
  assert.equal(r.prioridade, true);
  assert.deepEqual(r.agendamento, comAcomp.agendamento);
  assert.equal(r.responsavelId, "ana", "responsável já definido no app é mantido");
  assert.equal(r.id, base.id);
});

test("Cancelado/Regularizado definidos no app não são sobrescritos pela planilha", () => {
  const [base] = plano([], [linha({ n: 60, nome: "Cliente" })]).gravar;
  for (const st of ["Cancelado", "Regularizado"]) {
    const { gravar, resumo } = plano([{ ...base, status: st }], [linha({ n: 60, nome: "Cliente", pagas: [1] })]);
    assert.equal(gravar[0].status, st);
    assert.equal(resumo.statusPreservado, 1);
  }
});

test("planilha marcando cancelamento atualiza quem ainda está Inadimplente", () => {
  const [base] = plano([], [linha({ n: 61, nome: "Cliente" })]).gravar;
  const { gravar } = plano([base], [linha({ n: 61, nome: "Cliente", canc: 1 })]);
  assert.equal(gravar[0].status, "Cancelado");
});

test("identificação: Nº primeiro; IDFatura/Nº Série só valem para o mesmo cliente", () => {
  const manual = { id: "inad-m-1", numero: "", idFatura: "F70", serie: "S70", nome: "Maria Silva", email: "maria@x.com", status: "Inadimplente", observacoes: [{ id: "o" }] };
  const igual = plano([manual], [linha({ n: 70, nome: "Maria Silva", email: "maria@x.com", fatura: "F70" })]);
  assert.equal(igual.resumo.atualizados, 1);
  assert.equal(igual.gravar[0].id, "inad-m-1", "atualiza o registro manual em vez de criar outro");
  assert.equal(igual.gravar[0].observacoes.length, 1);

  const outro = plano([manual], [linha({ n: 71, nome: "João Souza", email: "joao@x.com", fatura: "F70" })]);
  assert.equal(outro.resumo.erros.length, 1, "IDFatura de outro cliente não sobrescreve ninguém");
  assert.equal(outro.gravar.length, 0);
});

test("mesmo cliente com dois contratos continua com dois registros", () => {
  const { gravar } = plano([], [linha({ n: 80, nome: "Fulano", email: "f@x.com" }), linha({ n: 81, nome: "Fulano", email: "f@x.com" })]);
  assert.equal(gravar.length, 2);
});

test("linha repetida no mesmo arquivo é apontada como erro", () => {
  const { resumo } = plano([], [linha({ n: 90, nome: "A" }), linha({ n: 90, nome: "A" })]);
  assert.equal(resumo.incluidos, 1);
  assert.equal(resumo.erros.length, 1);
});

// ── Cores dos quadradinhos (situação de cada parcela) ─────────────────

const fat = (venc, status, pagoEm = null) => ({ id: venc, status, vencimento: venc, pagoEm });
const sit = (reg, hoje = "2026-10-15") => inadSituacaoParcelas(reg, hoje).map(p => p.situacao);

test("com Vindi: pagas verde, vencidas laranja, a vencer e não geradas cinza — por parcela", () => {
  const reg = { numParcelas: 6, parcelas: [], vindi: { faturas: [
    fat("2026-09-10", "pending"), fat("2026-07-10", "paid", "2026-07-11"), fat("2026-08-10", "paid", "2026-08-12"), fat("2026-10-20", "pending"),
  ] } };
  // ordem por vencimento: jul (paga), ago (paga), set (vencida), out/20 (a vencer), 5 e 6 não geradas
  assert.deepEqual(sit(reg), ["paga", "paga", "vencida", "aVencer", "naoGerada", "naoGerada"]);
});

test("vence hoje não é atraso; vencida ontem é", () => {
  const reg = { numParcelas: 2, vindi: { faturas: [fat("2026-10-14", "pending"), fat("2026-10-15", "pending")] } };
  assert.deepEqual(sit(reg), ["vencida", "aVencer"]);
});

test("a Vindi tem prioridade sobre a planilha (pagamento feito depois da planilha)", () => {
  const reg = { numParcelas: 3, parcelas: [{ n: 1, paga: true }, { n: 2, paga: false }, { n: 3, paga: false }],
    vindi: { faturas: [fat("2026-08-10", "paid"), fat("2026-09-10", "paid"), fat("2026-10-10", "pending")] } };
  assert.deepEqual(sit(reg), ["paga", "paga", "vencida"]);
});

test("faturas canceladas não ocupam lugar de parcela", () => {
  const reg = { numParcelas: 3, vindi: { faturas: [fat("2026-08-10", "paid"), fat("2026-08-20", "canceled"), fat("2026-09-10", "pending")] } };
  assert.deepEqual(sit(reg), ["paga", "vencida", "naoGerada"]);
});

test("sem dados da Vindi: paga pela planilha; não paga fica 'naoPaga' (não presume atraso)", () => {
  const reg = { numParcelas: 3, parcelas: [{ n: 1, paga: true }, { n: 2, paga: false }, { n: 3, paga: false }] };
  assert.deepEqual(sit(reg), ["paga", "naoPaga", "naoPaga"]);
});
