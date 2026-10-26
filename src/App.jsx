import { useState, useEffect, useRef, createContext, useContext } from "react";
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, arrayUnion, deleteDoc, writeBatch, query, where, onSnapshot } from "firebase/firestore";
import { db, auth, isSafeMode } from "./firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "firebase/auth";
import * as store from "./data";
import { consultarLogike, descreverTesteLogike } from "./logike";
import { satNorm, satParseData, satAgruparPorMes, satDistribuir } from "./satisfacao";
import { INAD_STATUS, inadLerPlanilha, inadResumoParcelas, inadSituacaoParcelas, inadTempo, inadTempoTexto, inadPlanejarImportacao, inadCamposImportacao, inadVindiValido } from "./inadimplentes";
import * as XLSX from "xlsx";

// ── Constants ─────────────────────────────────────────────────────────

// Login do admin — Etapa 2 da migração para o Firebase Authentication:
// • VITE_ADMIN_LOGIN_FIREBASE=1 (variável da Vercel, lida no build): só o login do Firebase; a senha fixa
//   abaixo NÃO entra no código publicado (o build elimina o ramo e a constante).
// • Sem a variável: a senha de sempre continua valendo, com a opção de entrar pelo Firebase (para testar).
const ADMIN_LOGIN_SO_FIREBASE = import.meta.env.VITE_ADMIN_LOGIN_FIREBASE === "1";
const ADMIN_CRED = ADMIN_LOGIN_SO_FIREBASE ? null : { id:"admin", password:"462b525C" };

const DEFAULT_EMPLOYEES = [
  { id:"gabriele",    name:"Gabriele",    password:"gabi123",    color:"#8b5cf6" },
  { id:"ana",         name:"Ana",         password:"ana123",     color:"#06b6d4" },
  { id:"andrea",      name:"Andrea",      password:"andrea123",  color:"#f59e0b" },
  { id:"adriel",      name:"Adriel",      password:"adriel123",  color:"#10b981" },
  { id:"elisandra",   name:"Elisandra",   password:"eli123",     color:"#ef4444" },
  { id:"recuperacao", name:"Recuperação", password:"recup123",   color:"#3b82f6" },
];

const PALETTE = ["#8b5cf6","#6366f1","#3b82f6","#06b6d4","#10b981","#22c55e","#f59e0b","#f97316","#ef4444","#ec4899","#14b8a6","#84cc16","#a78bfa","#fb923c","#64748b"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SHORT = ["jan.","fev.","mar.","abr.","mai.","jun.","jul.","ago.","set.","out.","nov.","dez."];
const DEPARTMENTS = ["Suporte ao Cliente","Financeiro","Jurídico","Comercial","Recuperação","Treinamento","Geral","Outro"];

const STATUS_CFG = {
  "Em atendimento": { bar:"#f59e0b", dot:"#f59e0b", bg:"#fef3c7", text:"#b45309", darkBg:"rgba(245,158,11,0.14)", darkText:"#fbbf24", darkBorder:"rgba(245,158,11,0.25)" },
  "Resolvido":      { bar:"#22c55e", dot:"#22c55e", bg:"#dcfce7", text:"#15803d", darkBg:"rgba(34,197,94,0.12)",  darkText:"#4ade80", darkBorder:"rgba(34,197,94,0.22)"   },
  "Pendente":       { bar:"#ef4444", dot:"#f87171", bg:"#fee2e2", text:"#b91c1c", darkBg:"rgba(239,68,68,0.14)", darkText:"#f87171", darkBorder:"rgba(239,68,68,0.25)"  },
};
const TIPO_CFG = {
  "Transferido": { bg:"#dbeafe", text:"#1e40af" },
  "Inadimplente":{ bg:"#fde68a", text:"#92400e" },
  "Segunda via": { bg:"#fce7f3", text:"#9d174d" },
  "Cancelamento":{ bg:"#fee2e2", text:"#991b1b" },
  "Outro":       { bg:"#f1f5f9", text:"#475569" },
  "Nota Fiscal": { bg:"#dcfce7", text:"#166534" },
};

const TIPO_COLORS = [
  { bg:"#dbeafe", text:"#1e40af" },
  { bg:"#fde68a", text:"#92400e" },
  { bg:"#fce7f3", text:"#9d174d" },
  { bg:"#fee2e2", text:"#991b1b" },
  { bg:"#f1f5f9", text:"#475569" },
  { bg:"#dcfce7", text:"#166534" },
  { bg:"#ede9fe", text:"#6d28d9" },
  { bg:"#fef3c7", text:"#b45309" },
  { bg:"#e0f2fe", text:"#0369a1" },
  { bg:"#fce7f3", text:"#be185d" },
];

const DEFAULT_DEPARTMENTS = [
  { id:"suporte-ao-cliente", name:"Suporte ao Cliente" },
  { id:"financeiro",         name:"Financeiro" },
  { id:"juridico",           name:"Jurídico" },
  { id:"comercial",          name:"Comercial" },
  { id:"recuperacao",        name:"Recuperação" },
  { id:"treinamento",        name:"Treinamento" },
  { id:"geral",              name:"Geral" },
  { id:"outro",              name:"Outro" },
];

const DEFAULT_TIPOS = [
  { id:"transferido",  label:"Transferido",  department:"Geral",      bg:"#dbeafe", text:"#1e40af" },
  { id:"inadimplente", label:"Inadimplente", department:"Geral",      bg:"#fde68a", text:"#92400e" },
  { id:"segunda-via",  label:"Segunda via",  department:"Geral",      bg:"#fce7f3", text:"#9d174d" },
  { id:"cancelamento", label:"Cancelamento", department:"Geral",      bg:"#fee2e2", text:"#991b1b" },
  { id:"outro",        label:"Outro",        department:"Geral",      bg:"#f1f5f9", text:"#475569" },
  { id:"nota-fiscal",  label:"Nota Fiscal",  department:"Financeiro", bg:"#dcfce7", text:"#166534" },
];

// ── Themes ────────────────────────────────────────────────────────────

const THEMES = {
  light: {
    pageBg:         "#f1f5f9",
    card:           "#fff",
    border:         "#e2e8f0",
    header:         "#0f172a",
    text:           "#1e293b",
    textSub:        "#64748b",
    textMuted:      "#94a3b8",
    inputBg:        "#fff",
    inputBorder:    "#e2e8f0",
    inputText:      "#1e293b",
    btnSecBg:       "#f1f5f9",
    btnSecText:     "#475569",
    rowEven:        "#fff",
    rowOdd:         "#fafbfc",
    rowHover:       "#f0f9ff",
    rowPrio:        "#fffbeb",
    thead:          "#f8fafc",
    theadBorder:    "#e2e8f0",
    tabActiveBg:    "#0f172a",
    tabActiveText:  "#fff",
    tabInactiveText:"#64748b",
    metaBg:         "#fff",
    metaBorder:     "#e2e8f0",
    // login
    loginBg:        "#f8fafc",
    loginText:      "#1e293b",
    loginSub:       "#64748b",
    loginCardBg:    "#fff",
    loginCardBorder:"1.5px solid #e2e8f0",
    loginEmpBg:     "#fff",
    loginEmpBgHover:"#f1f5f9",
    loginEmpBorder: "1.5px solid #e2e8f0",
    loginEmpText:   "#1e293b",
    loginAdmBg:     "#f1f5f9",
    loginAdmBorder: "1px solid #e2e8f0",
    loginAdmText:   "#475569",
    dInpBg:         "#fff",
    dInpBorder:     "1.5px solid #e2e8f0",
    dInpText:       "#1e293b",
    codeSnippetBg:  "#f1f5f9",
    codeSnippetText:"#475569",
    senhaHint:      "#64748b",
  },
  dark: {
    pageBg:         "#0f172a",
    card:           "#1e293b",
    border:         "#334155",
    header:         "#020617",
    text:           "#f1f5f9",
    textSub:        "#94a3b8",
    textMuted:      "#64748b",
    inputBg:        "#0f172a",
    inputBorder:    "#334155",
    inputText:      "#f1f5f9",
    btnSecBg:       "#334155",
    btnSecText:     "#cbd5e1",
    rowEven:        "#1e293b",
    rowOdd:         "#172032",
    rowHover:       "#1d3461",
    rowPrio:        "#27240e",
    thead:          "#172032",
    theadBorder:    "#334155",
    tabActiveBg:    "#334155",
    tabActiveText:  "#f1f5f9",
    tabInactiveText:"#64748b",
    metaBg:         "#1e293b",
    metaBorder:     "#334155",
    // login
    loginBg:        "#020617",
    loginText:      "#f8fafc",
    loginSub:       "#64748b",
    loginCardBg:    "rgba(255,255,255,0.05)",
    loginCardBorder:"1.5px solid rgba(255,255,255,0.08)",
    loginEmpBg:     "rgba(255,255,255,0.05)",
    loginEmpBgHover:"rgba(255,255,255,0.1)",
    loginEmpBorder: "1.5px solid rgba(255,255,255,0.1)",
    loginEmpText:   "#f1f5f9",
    loginAdmBg:     "rgba(255,255,255,0.04)",
    loginAdmBorder: "1px solid rgba(255,255,255,0.08)",
    loginAdmText:   "#475569",
    dInpBg:         "rgba(255,255,255,0.08)",
    dInpBorder:     "1.5px solid rgba(255,255,255,0.15)",
    dInpText:       "#f8fafc",
    codeSnippetBg:  "rgba(255,255,255,0.07)",
    codeSnippetText:"#94a3b8",
    senhaHint:      "#334155",
  },
};

// ── Theme Context ─────────────────────────────────────────────────────

const ThemeCtx = createContext(null);
const useTheme = () => useContext(ThemeCtx);

// ── Helpers ───────────────────────────────────────────────────────────

const todayStr = () => { const d = new Date(); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; };
const nowMY    = () => { const d = new Date(); return { month: d.getMonth()+1, year: d.getFullYear() }; };
const fmtMY    = (m,y) => `${MONTHS[m-1]} ${y}`;
const genId    = ()    => `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
const slugify  = s     => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");
const maskPhone = raw  => {
  const d = raw.replace(/\D/g,"").slice(0,11);
  if (d.length <=  2) return d.length ? `(${d}` : "";
  if (d.length <=  6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35].forEach(t => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 880;
      g.gain.setValueAtTime(0.4, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.3);
    });
  } catch(e) {}
}

// ── Seed Data ─────────────────────────────────────────────────────────

const SEED_PAGE = { id:"page-maio-2026", name:"Atendimentos - Maio 2026", department:"Suporte ao Cliente", responsibleId:"gabriele", month:5, year:2026, createdAt:"2026-05-01" };

const SEED_RECORDS = [
  { id:1,  status:"Resolvido",      data:"4 mai.", cliente:"Hélio Endeler",                        via:"Ticket",   contato:"freshdesk.com/13001", tipo:"Transferido",  atendenteId:"gabriele",    prioridade:false, descricao:"E-mail encaminhado ao Fábio" },
  { id:2,  status:"Em atendimento", data:"4 mai.", cliente:"Suzan Pirana",                         via:"WhatsApp", contato:"11910002200",          tipo:"Inadimplente", atendenteId:"ana",         prioridade:true,  descricao:"Solicitou fatura atualizada para regularização" },
  { id:3,  status:"Resolvido",      data:"4 mai.", cliente:"Mara de Oliveira Burger",              via:"WhatsApp", contato:"24988318532",          tipo:"Transferido",  atendenteId:"gabriele",    prioridade:true,  descricao:"Entrou pela opção de NF, é renovação > Transferido" },
  { id:4,  status:"Em atendimento", data:"4 mai.", cliente:"Luana Lima Batista de Castro",         via:"WhatsApp", contato:"6593162743",           tipo:"Inadimplente", atendenteId:"andrea",      prioridade:false, descricao:"Solicitou fatura atualizada para regularização" },
  { id:5,  status:"Resolvido",      data:"4 mai.", cliente:"Ana Lucia Carneiro Cunha",             via:"Ticket",   contato:"freshdesk.com/13002", tipo:"Segunda via",  atendenteId:"gabriele",    prioridade:true,  descricao:"Solicitou 2ª via de boleto (fatura com erro)" },
  { id:6,  status:"Resolvido",      data:"4 mai.", cliente:"Eutiquio Alves Pereira Neto",          via:"Ticket",   contato:"freshdesk.com/13003", tipo:"Outro",        atendenteId:"adriel",      prioridade:false, descricao:"Fez pedido pelo site e reclamou da cobrança" },
  { id:7,  status:"Resolvido",      data:"4 mai.", cliente:"Ester Ramos Bitencourt",               via:"Ticket",   contato:"freshdesk.com/13004", tipo:"Cancelamento", atendenteId:"elisandra",   prioridade:true,  descricao:"Cancelamento com Estorno (7 dias) - Renovação" },
  { id:8,  status:"Resolvido",      data:"4 mai.", cliente:"Sirlene Freitas Bonfim",               via:"Ticket",   contato:"freshdesk.com/13005", tipo:"Cancelamento", atendenteId:"elisandra",   prioridade:true,  descricao:"Cancelamento com Estorno (7 dias) - Renovação" },
  { id:9,  status:"Resolvido",      data:"4 mai.", cliente:"Inácio Gomes Soc. de Advogados",       via:"Ticket",   contato:"freshdesk.com/13006", tipo:"Inadimplente", atendenteId:"recuperacao", prioridade:false, descricao:"Solicitou fatura atualizada para regularização" },
  { id:10, status:"Em atendimento", data:"4 mai.", cliente:"Flavia Yuri Yoshimura Diniz",          via:"Telefone", contato:"11968630622",          tipo:"Cancelamento", atendenteId:"andrea",      prioridade:false, descricao:"Estorno PIX via Vindi, aguardando efetivação" },
  { id:11, status:"Resolvido",      data:"4 mai.", cliente:"Naiala Miranda Rosa de Souza",         via:"WhatsApp", contato:"freshdesk.com/13007", tipo:"Cancelamento", atendenteId:"gabriele",    prioridade:true,  descricao:"Cancelamento com Multa e Estorno Parcial" },
  { id:12, status:"Resolvido",      data:"4 mai.", cliente:"Carolina Pires de Mendonça",           via:"Ticket",   contato:"freshdesk.com/13008", tipo:"Outro",        atendenteId:"ana",         prioridade:false, descricao:"Registro de erro no e-mail" },
  { id:13, status:"Resolvido",      data:"4 mai.", cliente:"Luis Fernando Pozzer Soc. Advoc.",     via:"WhatsApp", contato:"16991636478",          tipo:"Nota Fiscal",  atendenteId:"gabriele",    prioridade:true,  descricao:"Solicitou NF" },
  { id:14, status:"Resolvido",      data:"5 mai.", cliente:"Patricia (Roberto Lopes de Souza)",    via:"Telefone", contato:"freshdesk.com/13009", tipo:"Cancelamento", atendenteId:"adriel",      prioridade:true,  descricao:"Cancelamento com Estorno (7 dias) - Renovação" },
  { id:15, status:"Resolvido",      data:"5 mai.", cliente:"Fernando Pinto Morais",                via:"Ticket",   contato:"freshdesk.com/13010", tipo:"Outro",        atendenteId:"ana",         prioridade:false, descricao:"Registro de erro no e-mail" },
  { id:16, status:"Em atendimento", data:"5 mai.", cliente:"Wagner Bernardo",                      via:"Ticket",   contato:"freshdesk.com/13011", tipo:"Inadimplente", atendenteId:"andrea",      prioridade:true,  descricao:"Enviou comprovante de pgto por boleto" },
  { id:17, status:"Resolvido",      data:"5 mai.", cliente:"Thais Carvalho da Silva",              via:"Ticket",   contato:"freshdesk.com/13012", tipo:"Segunda via",  atendenteId:"gabriele",    prioridade:true,  descricao:"Solicitou 2ª via de boleto" },
  { id:18, status:"Em atendimento", data:"5 mai.", cliente:"Cristiane Pinheiro Cavalcante Basili", via:"WhatsApp", contato:"11990267881",          tipo:"Inadimplente", atendenteId:"elisandra",   prioridade:false, descricao:"Solicitou fatura atualizada para regularização" },
  { id:19, status:"Em atendimento", data:"5 mai.", cliente:"Antonio Carlos Leao Matos",            via:"Ticket",   contato:"freshdesk.com/13013", tipo:"Cancelamento", atendenteId:"recuperacao", prioridade:false, descricao:"Cancelamento por Chargeback" },
  { id:20, status:"Em atendimento", data:"5 mai.", cliente:"Juliano Luiz Pozeti",                  via:"Ticket",   contato:"freshdesk.com/13014", tipo:"Cancelamento", atendenteId:"recuperacao", prioridade:false, descricao:"Cancelamento por Chargeback" },
];

// ── Shared UI ─────────────────────────────────────────────────────────

const FF = { fontFamily:"'Segoe UI', system-ui, sans-serif" };

// Shared style helpers
const INP = (t) => ({ width:"100%", padding:"10px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:8, fontSize:14, color:t.inputText, outline:"none", boxSizing:"border-box", background:t.inputBg, transition:"border-color 0.15s, box-shadow 0.15s", ...FF });
const SEL = (t) => ({ ...INP(t), cursor:"pointer" });
const BTN_SEC = (t) => ({ padding:"10px 18px", background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:8, color:t.btnSecText, fontWeight:600, fontSize:14, cursor:"pointer", ...FF });

function DarkToggle() {
  const { dark, toggle } = useTheme();
  return (
    <div
      onClick={toggle}
      title={dark ? "Modo claro" : "Modo escuro"}
      style={{ width:46, height:26, borderRadius:13, background:dark?"#6366f1":"#94a3b8", position:"relative", cursor:"pointer", transition:"background 0.25s", flexShrink:0 }}
    >
      <div style={{ position:"absolute", top:3, left:dark?23:3, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left 0.25s", boxShadow:"0 1px 4px rgba(0,0,0,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11 }}>
        {dark ? "🌙" : "☀️"}
      </div>
    </div>
  );
}

function Avatar({ name, color, size=40 }) {
  const i = name.trim().split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  return <div style={{ width:size, height:size, borderRadius:"50%", background:color, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:size*0.38, flexShrink:0, userSelect:"none" }}>{i}</div>;
}

function StatusBadge({ status }) {
  const { dark } = useTheme();
  const c = STATUS_CFG[status] || { bg:"#f1f5f9", text:"#475569", dot:"#94a3b8", darkBg:"rgba(148,163,184,0.1)", darkText:"#94a3b8", darkBorder:"transparent" };
  const bg  = dark ? c.darkBg    : c.bg;
  const clr = dark ? c.darkText  : c.text;
  const dot = dark ? c.darkText  : c.dot;
  const brd = dark ? c.darkBorder : "transparent";
  return <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:bg, color:clr, border:`1px solid ${brd}`, padding:"3px 10px 3px 7px", borderRadius:20, fontSize:11.5, fontWeight:600, whiteSpace:"nowrap" }}><span style={{ width:6, height:6, borderRadius:"50%", background:dot, flexShrink:0 }} />{status}</span>;
}
function TipoBadge({ tipo, tipoObj, onClick }) {
  const c = tipoObj || TIPO_CFG[tipo] || { bg:"#f1f5f9", text:"#475569" };
  return <span onClick={onClick} style={{ background:c.bg, color:c.text, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:"nowrap", display:"inline-block", cursor:onClick?"pointer":"default", letterSpacing:0.1 }}>{tipo}</span>;
}
function ViaBadge({ via }) {
  const emailSvg = <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 7l10 7 10-7"/></svg>;
  const waSvg    = <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>;
  const tgSvg    = <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
  const phoneSvg = <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
  const map = { Ticket:[emailSvg,"#6366f1","#ede9fe"], WhatsApp:[waSvg,"#16a34a","#dcfce7"], Telefone:[phoneSvg,"#0369a1","#e0f2fe"], Telegram:[tgSvg,"#0369a1","#e0f2fe"] };
  const [icon, color, bg] = map[via] || [null,"#475569","#f1f5f9"];
  return <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, color, fontWeight:600, background:bg, padding:"3px 9px", borderRadius:20, whiteSpace:"nowrap" }}>{icon}{via}</span>;
}
function DeptBadge({ dept }) {
  return <span style={{ background:"#f1f5f9", color:"#475569", padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:"nowrap", display:"inline-block", letterSpacing:0.1 }}>{dept}</span>;
}

// ── Record list primitives ─────────────────────────────────────────────

function Sep({ dark }) {
  return <span style={{ width:3, height:3, borderRadius:"50%", background:dark?"#334155":"#cbd5e1", flexShrink:0, display:"inline-block" }} />;
}

function IconBtn({ children, onClick, title, active=false, activeColor="#10b981", danger=false, dark, t }) {
  const bgOn  = active ? `${activeColor}22` : "none";
  const brdOn = active ? `${activeColor}55` : (dark ? "#2d3f55" : "#dde3ea");
  const clr   = danger ? "#f87171" : (active ? activeColor : t.textMuted);
  return (
    <button onClick={onClick} title={title}
      style={{ background:bgOn, border:`1px solid ${danger?"rgba(248,113,113,0.35)":brdOn}`, borderRadius:7, width:28, height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:clr, transition:"background 0.12s, color 0.12s", flexShrink:0, ...FF }}
      onMouseEnter={e=>{ e.currentTarget.style.background=danger?"rgba(239,68,68,0.12)":(active?`${activeColor}33`:(dark?"rgba(255,255,255,0.07)":"#eef1f5")); e.currentTarget.style.color=danger?"#f87171":(active?activeColor:t.text); }}
      onMouseLeave={e=>{ e.currentTarget.style.background=bgOn; e.currentTarget.style.color=clr; }}>
      {children}
    </button>
  );
}

function RecordRow({ r, employees, tiposMap, togglePrio, togglePesquisa, updateStatus, setModal, setConfirmId, setAgendaModal, setTipoEdit }) {
  const { t, dark } = useTheme();
  const [hover, setHover]           = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [dropPos, setDropPos]       = useState(null);
  const statusRef                   = useRef(null);

  const atend = employees.find(e => e.id === r.atendenteId);
  const cfg   = STATUS_CFG[r.status] || { bar:"#94a3b8", bg:"#f1f5f9", text:"#475569", dot:"#94a3b8", darkBg:"rgba(148,163,184,0.1)", darkText:"#94a3b8", darkBorder:"transparent" };

  const rowBg = dark
    ? (hover ? "#1c3048" : (r.prioridade ? "#1d1f13" : "#1e293b"))
    : (hover ? "#f6f9fc" : (r.prioridade ? "#fff8f1" : "#fff"));

  function openDrop(e) {
    e.stopPropagation();
    if (statusRef.current) {
      const rect = statusRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setStatusOpen(v => !v);
  }

  useEffect(() => {
    if (!statusOpen) return;
    const close = () => setStatusOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [statusOpen]);

  const sbg = dark ? cfg.darkBg    : cfg.bg;
  const scl = dark ? cfg.darkText  : cfg.text;
  const sbd = dark ? cfg.darkBorder : "transparent";

  return (
    <>
      <div
        style={{ position:"relative", display:"flex", alignItems:"stretch", background:rowBg, borderRadius:10, border:`1px solid ${dark?"rgba(255,255,255,0.07)":"#e8edf2"}`, overflow:"hidden", transition:"background 0.12s, box-shadow 0.12s", boxShadow:hover?(dark?"0 2px 14px rgba(0,0,0,0.35)":"0 2px 10px rgba(0,0,0,0.07)"):"none", ...FF }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* Status color bar */}
        <div style={{ width:4, alignSelf:"stretch", background:cfg.bar, flexShrink:0 }} />

        {/* BLOCK 0 — Status selector */}
        <div style={{ flexShrink:0, padding:"0 16px", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <button ref={statusRef} onClick={openDrop}
            style={{ display:"inline-flex", alignItems:"center", gap:6, background:dark?"rgba(255,255,255,0.05)":"#f1f5f9", color:t.textMuted, border:`1px solid ${dark?"#2d3f55":"#dde3ea"}`, padding:"5px 9px 5px 8px", borderRadius:20, fontSize:11.5, fontWeight:500, whiteSpace:"nowrap", cursor:"pointer", ...FF, minWidth:136, transition:"opacity 0.12s" }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:cfg.bar, flexShrink:0, opacity:0.7 }} />
            {r.status}
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft:"auto" }}><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>

        {/* BLOCK 1 — Title · metadata · tipo badge */}
        <div style={{ width:400, flexShrink:0, padding:"11px 18px 11px 16px", borderRight:"none", display:"flex", flexDirection:"column", justifyContent:"center", gap:4 }}>
          <div style={{ fontWeight:600, fontSize:13.5, color:t.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {r.cliente}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, color:t.textMuted, fontWeight:500, fontVariantNumeric:"tabular-nums" }}>#{r.id}</span>
            <Sep dark={dark} />
            <span style={{ fontSize:11, color:t.textMuted }}>{r.data}</span>
            {atend && (<>
              <Sep dark={dark} />
              <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                <Avatar name={atend.name} color={atend.color} size={13} />
                <span style={{ fontSize:11, color:t.textMuted }}>{atend.name}</span>
              </div>
            </>)}
          </div>
          <div>
            <TipoBadge tipo={r.tipo} tipoObj={tiposMap[r.tipo]} onClick={() => tiposMap[r.tipo] && setTipoEdit({...tiposMap[r.tipo]})} />
          </div>
        </div>

        <div style={{ width:1, height:22, background:dark?"rgba(255,255,255,0.13)":"#d1d5db", alignSelf:"center", flexShrink:0 }} />

        {/* BLOCK 2 — Canal de atendimento */}
        <div style={{ width:250, flexShrink:0, padding:"11px 18px", borderRight:"none", display:"flex", flexDirection:"column", justifyContent:"center", gap:4 }}>
          {r.via && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flexShrink:0, width:88 }}><ViaBadge via={r.via} /></div>
              {r.contato && (
                r.via === "Ticket"
                  ? <a href={/^https?:\/\//i.test(r.contato)?r.contato:`https://${r.contato}`} target="_blank" rel="noreferrer"
                      style={{ fontSize:11, color:"#818cf8", fontWeight:500, textDecoration:"none", display:"flex", alignItems:"center", gap:3, overflow:"hidden", whiteSpace:"nowrap" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:100 }}>{r.contato}</span>
                    </a>
                  : <span style={{ fontSize:11, color:t.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:100 }}>{r.contato}</span>
              )}
            </div>
          )}
          {r.via2 && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flexShrink:0, width:88 }}><ViaBadge via={r.via2} /></div>
              {r.contato2 && (
                r.via2 === "Ticket"
                  ? <a href={/^https?:\/\//i.test(r.contato2)?r.contato2:`https://${r.contato2}`} target="_blank" rel="noreferrer"
                      style={{ fontSize:11, color:"#818cf8", fontWeight:500, textDecoration:"none", display:"flex", alignItems:"center", gap:3, overflow:"hidden", whiteSpace:"nowrap" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:100 }}>{r.contato2}</span>
                    </a>
                  : <span style={{ fontSize:11, color:t.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:100 }}>{r.contato2}</span>
              )}
            </div>
          )}
        </div>

        {/* BLOCK 3 — Descrição / informação complementar */}
        <div style={{ flex:1, padding:"11px 18px", borderRight:"none", display:"flex", alignItems:"center", minWidth:0 }}>
          {r.descricao
            ? <span style={{ fontSize:11.5, color:t.textMuted, lineHeight:1.55 }}>{r.descricao}</span>
            : <span style={{ fontSize:11, color:dark?"#334155":"#d1d5db" }}>—</span>
          }
        </div>

        {/* BLOCK 4 — Ações + Status */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"0 13px", flexShrink:0 }}>
          <IconBtn title={r.prioridade?"Remover prioridade":"Marcar como prioritário"} active={!!r.prioridade} activeColor="#f97316" onClick={()=>togglePrio(r.id)} dark={dark} t={t}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="19.78" y1="4.22" x2="18.36" y2="5.64"/>
              <line x1="1.5" y1="10" x2="3.5" y2="10"/>
              <line x1="20.5" y1="10" x2="22.5" y2="10"/>
              <path d="M7 18h10l1 3H6l1-3z"/>
              <path d="M8 18V9.5a4 4 0 0 1 8 0V18"/>
              <path d="M10 13h1.5"/>
            </svg>
          </IconBtn>
          <IconBtn title={r.pesquisaEnviada?"Pesquisa enviada":"Marcar pesquisa enviada"} active={!!r.pesquisaEnviada} activeColor="#10b981" onClick={()=>togglePesquisa(r.id)} dark={dark} t={t}>
            <svg width="13" height="10" viewBox="0 0 34 26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="0" y1="7" x2="8" y2="7"/><line x1="2" y1="13" x2="8" y2="13"/><rect x="10" y="3" width="22" height="16" rx="2"/><polyline points="10,3 21,12 32,3"/></svg>
          </IconBtn>
          {r.agendamento && !r.agendamento.concluido && (
            <IconBtn title={r.agendamento.titulo} active activeColor="#f59e0b" onClick={()=>setAgendaModal(r)} dark={dark} t={t}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </IconBtn>
          )}
          <IconBtn title="Editar" onClick={()=>setModal({mode:"edit",record:r})} dark={dark} t={t}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </IconBtn>
          <IconBtn title="Excluir" danger onClick={()=>setConfirmId(r.id)} dark={dark} t={t}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </IconBtn>
        </div>
      </div>

      {/* Status dropdown — position:fixed escapes overflow:hidden */}
      {statusOpen && dropPos && (
        <div style={{ position:"fixed", top:dropPos.top, right:dropPos.right, zIndex:9999, background:dark?"#1e293b":"#fff", border:`1px solid ${dark?"#334155":"#e2e8f0"}`, borderRadius:10, boxShadow:"0 10px 32px rgba(0,0,0,0.25)", overflow:"hidden", minWidth:172, ...FF }}
          onClick={e=>e.stopPropagation()}>
          {["Em atendimento","Resolvido","Pendente"].map(s => {
            const sc  = STATUS_CFG[s] || {};
            const act = r.status === s;
            return (
              <button key={s} onClick={()=>{updateStatus(r,s);setStatusOpen(false);}}
                style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"9px 14px", background:act?(dark?"rgba(255,255,255,0.06)":"#f8fafc"):"none", border:"none", cursor:"pointer", fontSize:12.5, fontWeight:act?600:400, color:dark?sc.darkText:sc.text, textAlign:"left", ...FF }}
                onMouseEnter={e=>{if(!act)e.currentTarget.style.background=dark?"rgba(255,255,255,0.04)":"#f1f5f9";}}
                onMouseLeave={e=>{if(!act)e.currentTarget.style.background="none";}}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:sc.bar||"#94a3b8", flexShrink:0 }} />
                {s}
                {act && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft:"auto" }}><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────

const CHANGELOG_VERSION = "1.6.4";
const CHANGELOG_KEY = `changelog_seen_${CHANGELOG_VERSION}`;

const CHANGELOG = [
  {
    version: "1.6.4",
    date: "Out 2026",
    entries: [
      { type: "novo", text: "Inadimplentes: novo status Quitado — quando todas as parcelas do contrato estão pagas na Vindi (inclusive quando o cliente antecipa as últimas), o status muda sozinho para Quitado." },
      { type: "novo", text: "Inadimplentes: parcelas pagas antecipadamente aparecem como \"Paga antecipada\" no histórico financeiro e na dica do quadradinho." },
    ],
  },
  {
    version: "1.6.3",
    date: "Out 2026",
    entries: [
      { type: "correcao", text: "Inadimplentes: assinatura cancelada na Vindi agora muda o status para Cancelado automaticamente (antes podia aparecer como Regularizado). O valor que ficou em aberto no cancelamento aparece nos detalhes." },
      { type: "melhoria", text: "Inadimplentes: novas cores de status — Inadimplente em laranja e Cancelado em vermelho." },
      { type: "novo",     text: "Inadimplentes: todo dia de madrugada o app confere todos os clientes na Vindi automaticamente — inclusive os recém-importados da planilha e faturas que venceram sem pagamento." },
      { type: "novo",     text: "Inadimplentes: quadradinho azul = parcela paga em atraso. Passe o mouse para ver o vencimento original, a data do pagamento e os dias de atraso." },
      { type: "correcao", text: "Inadimplentes: fatura com vencimento prorrogado na Vindi continua contando como vencida desde o vencimento original — prorrogar não regulariza o cliente." },
      { type: "novo",     text: "Inadimplentes: histórico financeiro das parcelas nos detalhes do cliente (no prazo, em atraso, vencidas, não geradas), mantido mesmo depois de Regularizado ou Cancelado." },
    ],
  },
  {
    version: "1.6.2",
    date: "Out 2026",
    entries: [
      { type: "novo", text: "Administrador: novo acesso com e-mail e senha (conta Firebase), com opção \"Esqueci a senha\". O acesso dos atendentes não muda." },
      { type: "novo", text: "Administrador: teste de conexão com o Freshdesk no painel (só confere a conexão — não cria tickets nem envia e-mails)." },
    ],
  },
  {
    version: "1.6.1",
    date: "Out 2026",
    entries: [
      { type: "melhoria", text: "Inadimplentes: os quadradinhos das parcelas mostram a situação real — verde = paga, laranja = atrasada, cinza = ainda não gerada. Passe o mouse para ver datas." },
      { type: "melhoria", text: "Inadimplentes: a lista ficou mais limpa — o responsável não aparece mais abaixo do valor (continua nos detalhes do cliente)." },
    ],
  },
  {
    version: "1.6.0",
    date: "Out 2026",
    entries: [
      { type: "novo",     text: "Controle de Inadimplentes: acompanhe clientes inadimplentes com data de inadimplência, parcelas pagas e pendentes, valor em aberto e status (Inadimplente, Cancelado, Regularizado)." },
      { type: "novo",     text: "Inadimplentes: registre observações de cobrança, compromissos (ex.: promessa de pagamento) e marque clientes como importantes." },
      { type: "novo",     text: "Inadimplentes: botão \"Consultar na Vindi\" abre a cobrança do cliente em uma nova aba." },
      { type: "novo",     text: "Inadimplentes: pesquisa, filtros (status, sistema, responsável, há mais de 1 mês) e ordenação." },
      { type: "melhoria", text: "O acesso aos Inadimplentes é liberado individualmente pelo administrador no cadastro de cada atendente." },
      { type: "novo",     text: "Inadimplentes: integração com a Vindi — botão \"Atualizar pela Vindi\" mostra faturas vencidas, valor vencido, última fatura paga e o histórico de faturas. Pagamentos confirmados pela Vindi atualizam o registro automaticamente." },
    ],
  },
  {
    version: "1.5.1",
    date: "Out 2026",
    entries: [
      { type: "melhoria", text: "Satisfação: um único arquivo Excel pode ter vários meses — cada avaliação vai automaticamente para o mês da sua data." },
      { type: "melhoria", text: "Satisfação: importar o mesmo arquivo de novo não duplica avaliações." },
      { type: "correcao", text: "Satisfação: avaliações feitas no fim da noite do último dia do mês não são mais contadas no mês seguinte." },
      { type: "novo",     text: "Botão ⭐ Satisfação dentro da planilha — veja seus indicadores sem sair do atendimento." },
      { type: "melhoria", text: "A janela de Novidades agora também fecha com a tecla ESC." },
    ],
  },
  {
    version: "1.5.0",
    date: "Out 2026",
    entries: [
      { type: "novo",     text: "Filtro de status \"Não resolvidos\" — mostra juntos os atendimentos Em atendimento e Pendentes." },
      { type: "melhoria", text: "Filtro de canal agora inclui Telegram e considera também a 2ª via do atendimento." },
      { type: "melhoria", text: "A busca também procura no contato da 2ª via." },
      { type: "melhoria", text: "Dois atendentes registrando ao mesmo tempo não sobrescrevem mais o atendimento um do outro." },
      { type: "melhoria", text: "Se a conexão falhar ao registrar um atendimento, o sistema avisa e mantém os dados digitados no formulário." },
      { type: "melhoria", text: "Satisfação (admin): o teste da API Lógike mostra o motivo real de falhas e a importação exibe um resumo dos comentários obtidos." },
      { type: "correcao", text: "Quando os dados não carregam, aparece um aviso com opção de tentar novamente, em vez de uma lista vazia." },
      { type: "correcao", text: "Busca não trava mais com atendimentos antigos sem descrição ou contato." },
      { type: "correcao", text: "O ponto de \"Novidades\" na planilha só aparece quando há novidades ainda não vistas." },
    ],
  },
  {
    version: "1.4.0",
    date: "Out 2025",
    entries: [
      { type: "novo",     text: "Novo layout de listagem em blocos — Título, Canal, Descrição e Ações separados visualmente." },
      { type: "novo",     text: "Seletor de status movido para o início do card, com visual neutro e ponto colorido." },
      { type: "melhoria", text: "Ícones de ação redesenhados com botões menores e mais discretos." },
      { type: "melhoria", text: "Barras de cor laterais nos cards indicam o status de forma imediata." },
      { type: "melhoria", text: "Dropdown de status com posição fixa — não é cortado por nenhum container." },
    ],
  },
  {
    version: "1.3.0",
    date: "Set 2025",
    entries: [
      { type: "novo",     text: "Ícone de prioridade (sirene) substitui o checkbox — fica laranja quando ativo." },
      { type: "novo",     text: "Logo da empresa no cabeçalho." },
      { type: "melhoria", text: "Ícones de olho para mostrar/ocultar senha padronizados em SVG." },
      { type: "melhoria", text: "Badges de canal (WhatsApp, Telegram, Ticket, Telefone) atualizados com ícones SVG." },
      { type: "correcao", text: "Borda preta aparecia nos cards de funcionários após passar o mouse — corrigido." },
    ],
  },
  {
    version: "1.2.0",
    date: "Ago 2025",
    entries: [
      { type: "novo",     text: "Pesquisa de satisfação com controle de envio por atendimento." },
      { type: "novo",     text: "Agendamentos vinculados aos atendimentos com alerta visual." },
      { type: "melhoria", text: "Modo escuro com tokens de cor independentes para cada componente." },
      { type: "correcao", text: "Filtros de listagem agora são salvos localmente entre sessões." },
    ],
  },
];

const TYPE_CFG = {
  novo:     { label:"Novo",     bg:"#dbeafe", text:"#1d4ed8", darkBg:"rgba(59,130,246,0.15)", darkText:"#93c5fd" },
  melhoria: { label:"Melhoria", bg:"#dcfce7", text:"#15803d", darkBg:"rgba(34,197,94,0.15)",  darkText:"#86efac" },
  correcao: { label:"Correção", bg:"#fee2e2", text:"#b91c1c", darkBg:"rgba(239,68,68,0.15)",  darkText:"#fca5a5" },
};

function ChangelogModal({ onClose, onDismiss }) {
  const { t, dark } = useTheme();
  const [noShow, setNoShow] = useState(false);

  function handleClose() {
    if (noShow) { try { localStorage.setItem(CHANGELOG_KEY, "1"); } catch {} onDismiss?.(); }
    onClose();
  }

  // ESC fecha do mesmo jeito que o X (respeitando "Não mostrar novamente")
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [noShow]);

  return (
    <Overlay>
      <div style={{ background:t.card, borderRadius:16, width:"100%", maxWidth:560, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:"0 25px 60px rgba(0,0,0,0.4)", ...FF }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"20px 24px 16px", borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:10, background:dark?"rgba(99,102,241,0.18)":"#ede9fe", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:t.text }}>Novidades</div>
              <div style={{ fontSize:11, color:t.textMuted, marginTop:1 }}>Atualizações e melhorias do sistema</div>
            </div>
          </div>
          <button onClick={handleClose}
            style={{ background:"none", border:`1px solid ${t.border}`, borderRadius:8, width:30, height:30, cursor:"pointer", fontSize:18, color:t.textMuted, display:"flex", alignItems:"center", justifyContent:"center", ...FF }}
            onMouseEnter={e=>e.currentTarget.style.background=t.pageBg}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>×</button>
        </div>
        {/* Body */}
        <div style={{ overflowY:"auto", flex:1, padding:"20px 24px", display:"flex", flexDirection:"column", gap:28 }}>
          {CHANGELOG.map((release, ri) => (
            <div key={ri}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <span style={{ fontSize:13, fontWeight:700, color:t.text }}>v{release.version}</span>
                <span style={{ fontSize:11, color:t.textMuted, background:dark?"rgba(255,255,255,0.05)":"#f1f5f9", border:`1px solid ${t.border}`, borderRadius:20, padding:"2px 10px" }}>{release.date}</span>
                {ri === 0 && <span style={{ fontSize:10, fontWeight:700, color:"#818cf8", background:dark?"rgba(99,102,241,0.15)":"#ede9fe", border:"1px solid rgba(99,102,241,0.3)", borderRadius:20, padding:"2px 9px", letterSpacing:0.3 }}>ATUAL</span>}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {release.entries.map((e, ei) => {
                  const cfg = TYPE_CFG[e.type];
                  return (
                    <div key={ei} style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, background:dark?cfg.darkBg:cfg.bg, color:dark?cfg.darkText:cfg.text, flexShrink:0, marginTop:1, letterSpacing:0.2 }}>{cfg.label}</span>
                      <span style={{ fontSize:12.5, color:t.textSub, lineHeight:1.55 }}>{e.text}</span>
                    </div>
                  );
                })}
              </div>
              {ri < CHANGELOG.length - 1 && <div style={{ height:1, background:t.border, marginTop:24 }} />}
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{ padding:"14px 24px", borderTop:`1px solid ${t.border}`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", userSelect:"none" }}>
            <input type="checkbox" checked={noShow} onChange={e=>setNoShow(e.target.checked)}
              style={{ width:15, height:15, accentColor:"#6366f1", cursor:"pointer" }} />
            <span style={{ fontSize:12.5, color:t.textMuted }}>Não mostrar novamente ao entrar</span>
          </label>
          <button onClick={handleClose}
            style={{ padding:"7px 20px", background:"#6366f1", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer", ...FF }}
            onMouseEnter={e=>e.currentTarget.style.background="#4f46e5"}
            onMouseLeave={e=>e.currentTarget.style.background="#6366f1"}>
            Entendido
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, z=1000 }) {
  return <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.78)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:z, padding:16, ...FF }}>{children}</div>;
}

function ModalShell({ title, onClose, children, footer, maxWidth=560 }) {
  const { t } = useTheme();
  return (
    <Overlay>
      <div style={{ background:t.card, borderRadius:14, width:"100%", maxWidth, maxHeight:"92vh", display:"flex", flexDirection:"column", boxShadow:"0 25px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 22px 16px", borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
          <h2 style={{ margin:0, fontSize:15, fontWeight:700, color:t.text, letterSpacing:-0.2 }}>{title}</h2>
          <button onClick={onClose}
            onMouseEnter={e=>e.currentTarget.style.background=t.pageBg}
            onMouseLeave={e=>e.currentTarget.style.background="none"}
            style={{ background:"none", border:`1px solid ${t.border}`, borderRadius:8, width:30, height:30, cursor:"pointer", fontSize:18, color:t.textMuted, display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.15s", lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:"20px 22px", overflowY:"auto", flex:1 }}>{children}</div>
        {footer && <div style={{ padding:"14px 22px", borderTop:`1px solid ${t.border}`, flexShrink:0, display:"flex", justifyContent:"flex-end", gap:10 }}>{footer}</div>}
      </div>
    </Overlay>
  );
}

function Field({ label, children }) {
  const { t } = useTheme();
  return <div style={{ marginBottom:16 }}><label style={{ display:"block", fontSize:11.5, fontWeight:600, color:t.textMuted, marginBottom:6, userSelect:"none" }}>{label}</label>{children}</div>;
}

// Mostrado quando os dados não puderam ser carregados — evita exibir (e salvar por cima) dados incompletos.
function LoadErrorBox() {
  const { t } = useTheme();
  return (
    <div style={{ textAlign:"center", padding:"56px 24px", background:t.card, borderRadius:18, border:"1px solid #fecaca", ...FF }}>
      <div style={{ fontSize:44, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:17, fontWeight:700, color:t.text, marginBottom:6 }}>Não foi possível carregar os dados</div>
      <div style={{ fontSize:13.5, color:t.textMuted, marginBottom:20 }}>Verifique sua conexão com a internet. Nenhum dado foi alterado.</div>
      <button onClick={()=>window.location.reload()} style={{ padding:"10px 24px", background:"#6366f1", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>Tentar novamente</button>
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:"#1e293b", color:"#f1f5f9", padding:"10px 18px", borderRadius:10, fontSize:13.5, fontWeight:500, boxShadow:"0 8px 32px rgba(0,0,0,0.35)", zIndex:3000, whiteSpace:"nowrap", border:"1px solid #334155", display:"flex", alignItems:"center", gap:8, ...FF }}>{msg}</div>;
}

const btnP = (dis) => ({ flex:1, padding:"10px 20px", background:dis?"#e2e8f0":"#6366f1", border:"none", borderRadius:8, color:dis?"#94a3b8":"#fff", fontWeight:600, fontSize:14, cursor:dis?"not-allowed":"pointer", ...FF });
const btnD = { flex:1, padding:"10px 20px", background:"#ef4444", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer", ...FF };

function ConfirmDialog({ message, onConfirm, onCancel }) {
  const { t } = useTheme();
  return (
    <Overlay z={1100}>
      <div style={{ background:t.card, borderRadius:14, padding:"26px 26px 22px", maxWidth:400, width:"90%", boxShadow:"0 25px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ width:42, height:42, borderRadius:10, background:"#fef2f2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, marginBottom:14 }}>⚠️</div>
        <h3 style={{ margin:"0 0 8px", color:t.text, fontSize:15, fontWeight:700 }}>Confirmar ação</h3>
        <p style={{ color:t.textSub, fontSize:13.5, margin:"0 0 22px", lineHeight:1.6 }}>{message}</p>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onCancel} style={{ padding:"9px 18px", background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:8, color:t.btnSecText, fontWeight:600, fontSize:14, cursor:"pointer", ...FF }}>Cancelar</button>
          <button onClick={onConfirm} style={{ ...btnD, flex:"none", padding:"9px 18px" }}>Excluir</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Storage helpers (Firestore) ───────────────────────────────────────

// Regras de segurança das leituras e gravações: ver src/data.js
const loadOrSeed = (colName, seed) => store.loadOrSeed(db, colName, seed);

// Contadores dos cartões de planilha (Admin e tela inicial) via contagem do Firestore — ver store.contarPagina.
const normOrgao = s => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
const tiposDeOrgao = tps => tps.filter(tp => normOrgao(tp.department).includes("orgao") || normOrgao(tp.label).includes("orgao")).map(tp => tp.label);
async function contarPaginas(pgs, tps) {
  const org = tiposDeOrgao(tps), cnts = {};
  await Promise.all(pgs.map(async p => { cnts[p.id] = await store.contarPagina(db, p.id, org); }));
  return cnts;
}
const saveItem   = (colName, item) => store.saveItem(db, colName, item);
const deleteItem = (colName, id)   => store.deleteItem(db, colName, id);

async function loadEmployees() {
  return await loadOrSeed("employees", b => DEFAULT_EMPLOYEES.forEach(x => b.set(doc(db, "employees", x.id), x))) ?? DEFAULT_EMPLOYEES;
}

async function loadPages() {
  return await loadOrSeed("pages", b => {
    b.set(doc(db, "pages", SEED_PAGE.id), SEED_PAGE);
    SEED_RECORDS.forEach(r => b.set(doc(db, "records", `${SEED_PAGE.id}-${r.id}`), { ...r, pageId: SEED_PAGE.id }));
  }) ?? [SEED_PAGE];
}


async function deletePageRecords(pageId) {
  try {
    const q = query(collection(db, "records"), where("pageId", "==", pageId));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } catch {}
}

async function loadTipos() {
  return await loadOrSeed("tipos", b => DEFAULT_TIPOS.forEach(x => b.set(doc(db, "tipos", x.id), x))) ?? DEFAULT_TIPOS;
}

async function loadDepartments() {
  return await loadOrSeed("departments", b => DEFAULT_DEPARTMENTS.forEach(x => b.set(doc(db, "departments", x.id), x))) ?? DEFAULT_DEPARTMENTS;
}

// ── Signature Functions ───────────────────────────────────────────────

async function loadSignature(id) {
  try {
    const snap = await getDoc(doc(db, "signatures", id));
    return snap.exists() ? snap.data().base64 : null;
  } catch { return null; }
}

async function saveSignature(id, base64) {
  try {
    await setDoc(doc(db, "signatures", id), { base64, updatedAt: new Date().toISOString() });
    return true;
  } catch(e) {
    console.error("saveSignature error:", id, e);
    return false;
  }
}

async function deleteSignature(id) {
  try { await deleteDoc(doc(db, "signatures", id)); } catch {}
}

async function loadAllSignatures() {
  try {
    const snap = await getDocs(collection(db, "signatures"));
    const map = {};
    snap.docs.forEach(d => { map[d.id] = d.data().base64; });
    return map;
  } catch { return {}; }
}

// ── Satisfação — Firebase helpers ────────────────────────────────────

async function loadSatImportacoes() {
  try {
    const snap = await getDocs(collection(db, "satisfacao"));
    return snap.docs.map(d => d.data())
      .sort((a, b) => (b.ano * 100 + b.mes) - (a.ano * 100 + a.mes));
  } catch { return []; }
}

async function deleteSatImportacao(mes, ano) {
  await deleteDoc(doc(db, "satisfacao", `${ano}-${String(mes).padStart(2, "0")}`));
}

async function loadSatMapeamentos() {
  try {
    const d = await getDoc(doc(db, "satisfacao_config", "mapeamentos"));
    return d.exists() ? (d.data().nomesMap || {}) : {};
  } catch { return {}; }
}

async function saveSatMapeamentos(map) {
  try { await setDoc(doc(db, "satisfacao_config", "mapeamentos"), { nomesMap: map }); } catch {}
}

async function loadSatApiConfig() {
  try {
    const d = await getDoc(doc(db, "satisfacao_config", "api"));
    return d.exists() ? d.data() : {};
  } catch { return {}; }
}

async function saveSatApiConfig(data) {
  try { await setDoc(doc(db, "satisfacao_config", "api"), data); } catch {}
}


// ── Satisfação — parsing utilities ───────────────────────────────────

function satDetectCol(headers, keywords) {
  const normH = headers.map(satNorm);
  // Iterate keywords first (priority order) so a specific keyword wins
  // over a generic one that might match an earlier column
  for (const kw of keywords.map(satNorm))
    for (let i = 0; i < normH.length; i++)
      if (normH[i] === kw || normH[i].includes(kw)) return i;
  return -1;
}

const SAT_SCORE_MAP = {
  "muito insatisfeito": 1, "insatisfeito": 2, "indiferente": 3,
  "neutro": 3, "satisfeito": 4, "muito satisfeito": 5,
};

function satParseScore(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = satNorm(String(v));
  if (!s || ["sem resposta", "-", "n a", "nao respondeu", "nr"].includes(s)) return null;
  if (s in SAT_SCORE_MAP) return SAT_SCORE_MAP[s];
  const n = parseFloat(String(v));
  if (!isNaN(n) && n >= 1 && n <= 5) return Math.round(n);
  return null;
}

const SAT_AMOSTRAGEM_MIN = 5;

function satCalcMetricas(importacoes, employeeId, inicio, fim) {
  const todos = [];
  for (const imp of importacoes) {
    for (const reg of (imp.registros || [])) {
      if (reg.employeeId !== employeeId) continue;
      const d = reg.data ? new Date(reg.data) : new Date(imp.ano, imp.mes - 1, 15);
      if (d >= inicio && d <= fim) todos.push(reg);
    }
  }
  const resp = todos.filter(r => r.temResposta);

  function calcInd(field) {
    const vals = resp.map(r => r[field]).filter(v => v != null);
    if (!vals.length) return null;
    const media = vals.reduce((a, b) => a + b, 0) / vals.length;
    const pos = vals.filter(v => v >= 4).length;
    return { media: Math.round(media * 10) / 10, total: vals.length, pctPos: Math.round(pos / vals.length * 1000) / 10 };
  }

  const at  = calcInd("atendimento");
  const nec = calcInd("necessidades");
  const sis = calcInd("sistema");
  const inds = [at, nec, sis].filter(Boolean);
  const geral = inds.length ? Math.round(inds.reduce((a, b) => a + b.media, 0) / inds.length * 10) / 10 : null;

  let totalVals = 0, totalPos = 0;
  for (const r of resp) {
    const scores = [r.atendimento, r.necessidades, r.sistema].filter(v => v != null);
    totalVals += scores.length;
    totalPos  += scores.filter(v => v >= 4).length;
  }
  const pctPos = totalVals > 0 ? Math.round(totalPos / totalVals * 1000) / 10 : null;

  const dist = { muitoInsatisfeito: 0, insatisfeito: 0, indiferente: 0, satisfeito: 0, muitoSatisfeito: 0 };
  for (const r of resp) {
    const scores = [r.atendimento, r.necessidades, r.sistema].filter(v => v != null);
    if (!scores.length) continue;
    const c = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (c <= 1) dist.muitoInsatisfeito++;
    else if (c === 2) dist.insatisfeito++;
    else if (c === 3) dist.indiferente++;
    else if (c === 4) dist.satisfeito++;
    else dist.muitoSatisfeito++;
  }

  const hist = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = d.getMonth() + 1, ano = d.getFullYear();
    const imp = importacoes.find(im => im.mes === mes && im.ano === ano);
    if (!imp) continue;
    const recs = (imp.registros || []).filter(r => r.employeeId === employeeId && r.temResposta);
    const vals = recs.flatMap(r => [r.atendimento, r.necessidades, r.sistema]).filter(v => v != null);
    if (!vals.length) continue;
    hist.push({
      label: `${MONTHS_SHORT[mes - 1].replace(".", "")}.${String(ano).slice(2)}`,
      media: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10,
    });
  }

  return {
    totalEnviadas: todos.length,
    totalRespostas: resp.length,
    taxaResposta: todos.length ? Math.round(resp.length / todos.length * 1000) / 10 : 0,
    geral, pctPos, at, nec, sis, dist, hist,
    respostas: resp
      .sort((a, b) => ((b.data || "") > (a.data || "") ? 1 : -1))
      .slice(0, 100)
      .map(r => {
        const scores = [r.atendimento, r.necessidades, r.sistema].filter(v => v != null);
        return { ...r, mediaGeral: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null };
      }),
  };
}

function satFindEmployee(nome, nmEmp) {
  const norm = satNorm(nome);
  if (!norm) return null;

  // Strip trailing suffix after separators: "Adriel Santos - Comercial" → "adriel santos"
  const core = norm.replace(/\s*[-\/|([].*/,"").trim() || norm;

  // 1. Exact match (full or stripped)
  let m = nmEmp.find(e => e.norm === norm || e.norm === core);
  if (m) return m.id;

  // 2. One name fully contained in the other ("adriel" ↔ "adriel santos")
  m = nmEmp.find(e =>
    e.norm.includes(norm) || norm.includes(e.norm) ||
    e.norm.includes(core) || core.includes(e.norm)
  );
  if (m) return m.id;

  // 3. Word-overlap: ≥60% of the employee's significant words appear in the Excel name
  //    (handles "Maria da Silva" vs "Maria Silva" — "da" filtered as too short)
  const excelWords = new Set([...norm.split(" "), ...core.split(" ")].filter(w => w.length > 2));
  let bestScore = 0, bestEmp = null;
  for (const emp of nmEmp) {
    const empWords = emp.norm.split(" ").filter(w => w.length > 2);
    if (!empWords.length) continue;
    const hits = empWords.filter(w => excelWords.has(w)).length;
    const score = hits / empWords.length;
    if (score > bestScore && score >= 0.6) { bestScore = score; bestEmp = emp; }
  }
  if (bestEmp) return bestEmp.id;

  // 4. First-name match — only when unambiguous (exactly one employee has that first name)
  const firstName = (core.split(" ")[0] || norm.split(" ")[0]);
  if (firstName.length > 2) {
    const candidates = nmEmp.filter(e => e.norm.split(" ")[0] === firstName);
    if (candidates.length === 1) return candidates[0].id;
  }

  return null;
}

// ── Image compression helper ──────────────────────────────────────────
// Resizes and compresses image to stay safely below Firestore's 1MB doc limit.
function compressImage(dataUrl, maxW = 600, maxH = 400, keepAlpha = false) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      let out = canvas.toDataURL("image/png");
      // Never convert to JPEG when transparency must be preserved
      if (!keepAlpha && out.length > 200000) out = canvas.toDataURL("image/jpeg", 0.82);
      resolve(out);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── SigUploadRow — reused in admin assinaturas tab ────────────────────

function SigUploadRow({ current, saving, onUpload, onDelete, t, keepAlpha = false }) {
  const fileRef = useRef(null);
  async function handleFile(f) {
    if (!f || !f.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const compressed = await compressImage(e.target.result, 600, 400, keepAlpha);
      onUpload(compressed);
    };
    reader.readAsDataURL(f);
  }
  if (current) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <img src={current} alt="" style={{ height:36, maxWidth:120, objectFit:"contain", border:`1px solid ${t.border}`, borderRadius:8, background:"#fff", padding:4 }} />
        <button onClick={() => fileRef.current?.click()} disabled={saving}
          style={{ padding:"6px 12px", background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:8, cursor:"pointer", fontSize:12, color:t.btnSecText, fontWeight:500, ...FF }}>
          {saving ? "Salvando…" : "Trocar"}
        </button>
        <button onClick={onDelete} disabled={saving}
          style={{ padding:"6px 12px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, cursor:"pointer", fontSize:12, color:"#dc2626", fontWeight:500, ...FF }}>
          {saving ? "…" : "Remover"}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display:"none" }} onChange={e => { handleFile(e.target.files?.[0]); e.target.value=""; }} />
      </div>
    );
  }
  return (
    <div>
      <button onClick={() => fileRef.current?.click()} disabled={saving}
        style={{ padding:"8px 16px", background:t.btnSecBg, border:`1.5px dashed ${t.border}`, borderRadius:8, cursor:"pointer", fontSize:13, color:t.textSub, fontWeight:500, ...FF }}>
        {saving ? "Salvando…" : "Selecionar imagem"}
      </button>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display:"none" }} onChange={e => { handleFile(e.target.files?.[0]); e.target.value=""; }} />
    </div>
  );
}

// ── Department Modal ──────────────────────────────────────────────────

function DepartmentModal({ dept, onSave, onClose }) {
  const { t } = useTheme();
  const inp = INP(t);
  const bS  = { ...BTN_SEC(t), flex:1 };

  const editing = !!dept;
  const [name,  setName]  = useState(dept?.name || "");
  const [error, setError] = useState("");

  const submit = () => {
    if (!name.trim()) return setError("O nome do departamento é obrigatório.");
    onSave({ id: dept?.id || genId(), name: name.trim() });
  };

  return (
    <ModalShell
      title={editing ? "✏️  Editar Departamento" : "➕  Novo Departamento"}
      onClose={onClose} maxWidth={420}
      footer={<><button onClick={onClose} style={bS}>Cancelar</button><button onClick={submit} style={btnP(false)}>{editing ? "Salvar Alterações" : "Criar Departamento"}</button></>}
    >
      <Field label="Nome do departamento *">
        <input value={name} onChange={e=>{setName(e.target.value);setError("");}} style={inp} placeholder="Ex: Suporte ao Cliente, Financeiro..." autoFocus />
      </Field>
      {error && <p style={{ color:"#dc2626", fontSize:13, margin:"-4px 0 0", fontWeight:500 }}>{error}</p>}
    </ModalShell>
  );
}

// ── Tipo Modal ────────────────────────────────────────────────────────

function TipoModal({ tipo, departments=[], onSave, onClose }) {
  const { t } = useTheme();
  const inp = INP(t);
  const sel = SEL(t);
  const bS  = { ...BTN_SEC(t), flex:1 };

  const editing = !!tipo;
  const [label,      setLabel]      = useState(tipo?.label      || "");
  const [department, setDepartment] = useState(tipo?.department || departments[0]?.name || "Geral");
  const [bg,         setBg]         = useState(tipo?.bg   || TIPO_COLORS[0].bg);
  const [text,       setText]       = useState(tipo?.text || TIPO_COLORS[0].text);
  const [error,      setError]      = useState("");

  const submit = () => {
    if (!label.trim()) return setError("O nome do tipo é obrigatório.");
    onSave({ id: tipo?.id || genId(), label: label.trim(), department, bg, text });
  };

  return (
    <ModalShell
      title={editing ? "✏️  Editar Tipo" : "➕  Novo Tipo de Atendimento"}
      onClose={onClose} maxWidth={460}
      footer={<><button onClick={onClose} style={bS}>Cancelar</button><button onClick={submit} style={btnP(false)}>{editing ? "Salvar Alterações" : "Criar Tipo"}</button></>}
    >
      <Field label="Nome do tipo *">
        <input value={label} onChange={e=>{setLabel(e.target.value);setError("");}} style={inp} placeholder="Ex: Negociação, Suporte Técnico..." autoFocus />
      </Field>
      <Field label="Departamento">
        <select value={department} onChange={e=>setDepartment(e.target.value)} style={sel}>
          {departments.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Cor do badge">
        <div style={{ fontSize:12, color:t.textMuted, marginBottom:6, fontWeight:600 }}>Presets rápidos</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
          {TIPO_COLORS.map((c,i)=>(
            <button key={i} onClick={()=>{setBg(c.bg);setText(c.text);}} style={{ padding:"4px 14px", borderRadius:20, background:c.bg, color:c.text, border:(bg===c.bg&&text===c.text)?`2px solid ${t.text}`:"2px solid transparent", cursor:"pointer", fontSize:12, fontWeight:700 }}>
              Aa
            </button>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
          <div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:6, fontWeight:600 }}>Cor do fundo</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input type="color" value={bg} onChange={e=>setBg(e.target.value)} style={{ width:42, height:36, border:`1.5px solid ${t.inputBorder}`, borderRadius:8, cursor:"pointer", padding:2, background:"none" }} />
              <span style={{ fontSize:12, color:t.textSub, fontFamily:"monospace" }}>{bg}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:6, fontWeight:600 }}>Cor da fonte</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input type="color" value={text} onChange={e=>setText(e.target.value)} style={{ width:42, height:36, border:`1.5px solid ${t.inputBorder}`, borderRadius:8, cursor:"pointer", padding:2, background:"none" }} />
              <span style={{ fontSize:12, color:t.textSub, fontFamily:"monospace" }}>{text}</span>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:12, color:t.textMuted }}>Prévia:</span>
          <span style={{ background:bg, color:text, padding:"3px 12px", borderRadius:20, fontSize:12, fontWeight:600 }}>
            {label || "Tipo"}
          </span>
        </div>
      </Field>
      {error && <p style={{ color:"#dc2626", fontSize:13, margin:"-4px 0 0", fontWeight:500 }}>{error}</p>}
    </ModalShell>
  );
}

// ── Tipo Color Panel ──────────────────────────────────────────────────

function TipoColorPanel({ tipos, department, onSave, onClose, initialTipo=null }) {
  const { t } = useTheme();
  const relevant = tipos.filter(tp => tp.department === department || tp.department === "Geral");
  const [editing, setEditing] = useState(initialTipo); // { ...tipo }
  const bS = BTN_SEC(t);

  if (editing) return (
    <ModalShell title={`🎨  Cores — ${editing.label}`} onClose={onClose} maxWidth={400}
      footer={<div style={{ display:"flex", gap:12 }}>
        <button onClick={initialTipo ? onClose : ()=>setEditing(null)} style={bS}>{initialTipo ? "Cancelar" : "Voltar"}</button>
        <button onClick={()=>{ onSave(editing); setEditing(null); }} style={btnP(false)}>Salvar</button>
      </div>}
    >
      <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
        <span style={{ background:editing.bg, color:editing.text, padding:"5px 20px", borderRadius:20, fontSize:14, fontWeight:700 }}>{editing.label}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div>
          <div style={{ fontSize:12, color:t.textMuted, marginBottom:6, fontWeight:600 }}>Cor do fundo</div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <input type="color" value={editing.bg} onChange={e=>setEditing(p=>({...p, bg:e.target.value}))} style={{ width:42, height:36, border:`1.5px solid ${t.inputBorder}`, borderRadius:8, cursor:"pointer", padding:2, background:"none" }} />
            <span style={{ fontSize:12, color:t.textSub, fontFamily:"monospace" }}>{editing.bg}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize:12, color:t.textMuted, marginBottom:6, fontWeight:600 }}>Cor da fonte</div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <input type="color" value={editing.text} onChange={e=>setEditing(p=>({...p, text:e.target.value}))} style={{ width:42, height:36, border:`1.5px solid ${t.inputBorder}`, borderRadius:8, cursor:"pointer", padding:2, background:"none" }} />
            <span style={{ fontSize:12, color:t.textSub, fontFamily:"monospace" }}>{editing.text}</span>
          </div>
        </div>
      </div>
    </ModalShell>
  );

  return (
    <ModalShell title="🎨  Personalizar tipos" onClose={onClose} maxWidth={420}
      footer={<button onClick={onClose} style={{ ...bS, width:"100%" }}>Fechar</button>}
    >
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {relevant.map(tp => (
          <div key={tp.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:t.pageBg, borderRadius:10, border:`1px solid ${t.border}` }}>
            <span style={{ background:tp.bg, color:tp.text, padding:"4px 14px", borderRadius:20, fontSize:12, fontWeight:700 }}>{tp.label}</span>
            <button onClick={()=>setEditing({...tp})} style={{ background:"none", border:`1px solid ${t.border}`, borderRadius:8, padding:"5px 12px", cursor:"pointer", fontSize:12, color:t.textSub, ...FF }}>✏️ Editar cores</button>
          </div>
        ))}
        {relevant.length === 0 && <div style={{ textAlign:"center", color:t.textMuted, padding:20 }}>Nenhum tipo encontrado.</div>}
      </div>
    </ModalShell>
  );
}

// ── Page Card ─────────────────────────────────────────────────────────

function PageCard({ pg, employees, cnt, isCurrentMonth, actions, onClick }) {
  const { t } = useTheme();
  const resp = employees.find(e=>e.id===pg.responsibleId);
  const pct  = cnt.total > 0 ? Math.round(cnt.resolved / cnt.total * 100) : 0;
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      style={{ background:t.card, border: isCurrentMonth ? "2px solid #6366f1" : `1px solid ${t.border}`, borderRadius:18, overflow:"hidden", cursor:"pointer", transition:"box-shadow 0.15s, transform 0.15s", boxShadow: hover ? "0 8px 24px rgba(0,0,0,0.15)" : "none", transform: hover ? "translateY(-2px)" : "none" }}
    >
      <div style={{ height:5, background: resp ? resp.color : "#6366f1" }} />
      <div style={{ padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:800, color:t.text, lineHeight:1.2 }}>{fmtMY(pg.month, pg.year)}</div>
            <div style={{ fontSize:12.5, color:t.textSub, marginTop:2 }}>{pg.name}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            {isCurrentMonth && <span style={{ background:"#ede9fe", color:"#6d28d9", fontSize:10.5, fontWeight:700, padding:"3px 8px", borderRadius:20, whiteSpace:"nowrap" }}>MÊS ATUAL</span>}
            {actions && <div style={{ display:"flex", gap:4 }} onClick={e=>e.stopPropagation()}>{actions}</div>}
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, flexWrap:"wrap" }}>
          <DeptBadge dept={pg.department} />
          {resp && <div style={{ display:"flex", alignItems:"center", gap:6 }}><Avatar name={resp.name} color={resp.color} size={20} /><span style={{ fontSize:12, color:t.textSub }}>{resp.name}</span></div>}
        </div>

        <div style={{ display:"flex", gap:16, marginBottom: cnt.total > 0 ? 14 : 0 }}>
          {[["TOTAL",cnt.total,t.text],["RESOLVIDOS",cnt.resolved,"#16a34a"],["EM ABERTO",cnt.inProgress,"#d97706"],["OP ABERTO",(cnt.opAbertos||0),"#8b5cf6"]].map(([l,v,c])=>(
            <div key={l}>
              <div style={{ fontSize:22, fontWeight:800, color:c, lineHeight:1 }}>{v}</div>
              <div style={{ fontSize:10, color:t.textMuted, fontWeight:700 }}>{l}</div>
            </div>
          ))}
        </div>

        {cnt.total > 0 && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:t.textMuted, marginBottom:4 }}>
              <span>Taxa de resolução</span><span style={{ fontWeight:600, color:"#16a34a" }}>{pct}%</span>
            </div>
            <div style={{ height:5, background:t.pageBg, borderRadius:99 }}>
              <div style={{ height:"100%", width:`${pct}%`, background:"#22c55e", borderRadius:99 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page Modal ────────────────────────────────────────────────────────

function PageModal({ page, employees, departments=[], onSave, onClose }) {
  const { t } = useTheme();
  const inp = INP(t);
  const sel = SEL(t);
  const bS  = { ...BTN_SEC(t), flex:1 };

  const cur = nowMY();
  const editing = !!page;
  const deptNames = departments.map(d => d.name);
  const [name,       setName]       = useState(page?.name         || `Atendimentos - ${fmtMY(cur.month, cur.year)}`);
  const [dept,       setDept]       = useState(page?.department   || deptNames[0] || "Geral");
  const [respId,     setRespId]     = useState(page?.responsibleId|| employees[0]?.id || "");
  const [month,      setMonth]      = useState(page?.month        || cur.month);
  const [year,       setYear]       = useState(page?.year         || cur.year);
  const [customDept, setCustomDept] = useState(!!page?.department && !deptNames.includes(page.department));
  const [error,      setError]      = useState("");

  const resp = employees.find(e=>e.id===respId);

  const submit = () => {
    if (!name.trim()) return setError("O nome da planilha é obrigatório.");
    if (!respId)      return setError("Selecione um responsável.");
    onSave({ id: page?.id || genId(), name:name.trim(), department:dept.trim()||"Geral", responsibleId:respId, month:+month, year:+year, createdAt: page?.createdAt || new Date().toISOString().slice(0,10) });
  };

  return (
    <ModalShell
      title={editing ? "✏️  Editar Planilha" : "📄  Nova Planilha de Atendimento"}
      onClose={onClose} maxWidth={500}
      footer={<><button onClick={onClose} style={bS}>Cancelar</button><button onClick={submit} style={btnP(false)}>{editing?"Salvar Alterações":"Criar Planilha"}</button></>}
    >
      <Field label="Nome da planilha *">
        <input value={name} onChange={e=>{setName(e.target.value);setError("");}} style={inp} placeholder="Ex: Atendimentos - Junho 2026" autoFocus />
      </Field>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
        <Field label="Mês de referência">
          <select value={month} onChange={e=>{ setMonth(+e.target.value); if(!editing) setName(`Atendimentos - ${fmtMY(+e.target.value, year)}`); }} style={sel}>
            {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </Field>
        <Field label="Ano">
          <input type="number" value={year} onChange={e=>{ setYear(+e.target.value); if(!editing) setName(`Atendimentos - ${fmtMY(month, +e.target.value)}`); }} style={inp} min={2020} max={2099} />
        </Field>
      </div>
      <Field label="Departamento">
        {!customDept ? (
          <div style={{ display:"flex", gap:8 }}>
            <select value={dept} onChange={e=>setDept(e.target.value)} style={{ ...sel, flex:1 }}>{departments.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select>
            <button onClick={()=>setCustomDept(true)} style={{ padding:"9px 12px", border:`1.5px solid ${t.border}`, borderRadius:9, background:t.btnSecBg, cursor:"pointer", fontSize:13, color:t.textSub, ...FF }}>+ Personalizar</button>
          </div>
        ) : (
          <div style={{ display:"flex", gap:8 }}>
            <input value={dept} onChange={e=>setDept(e.target.value)} style={{ ...inp, flex:1 }} placeholder="Nome do departamento..." />
            <button onClick={()=>{setDept(deptNames[0]||"Geral");setCustomDept(false);}} style={{ padding:"9px 12px", border:`1.5px solid ${t.border}`, borderRadius:9, background:t.btnSecBg, cursor:"pointer", fontSize:13, color:t.textSub, ...FF }}>Lista</button>
          </div>
        )}
      </Field>
      <Field label="Responsável pela planilha *">
        <select value={respId} onChange={e=>setRespId(e.target.value)} style={sel}>
          <option value="">— Selecione —</option>
          {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {resp && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:10, padding:"10px 14px", background:t.pageBg, borderRadius:10, border:`1px solid ${t.border}` }}>
            <Avatar name={resp.name} color={resp.color} size={36} />
            <div>
              <div style={{ fontSize:14, fontWeight:600, color:t.text }}>{resp.name}</div>
              <div style={{ fontSize:12, color:t.textMuted }}>Responsável pela planilha</div>
            </div>
          </div>
        )}
      </Field>
      {error && <p style={{ color:"#dc2626", fontSize:13, margin:"-4px 0 0", fontWeight:500 }}>{error}</p>}
    </ModalShell>
  );
}

// ── Employee Modal ────────────────────────────────────────────────────

function EmployeeModal({ employee, departments=[], onSave, onClose }) {
  const { t } = useTheme();
  const inp = INP(t);
  const sel = SEL(t);
  const bS  = { ...BTN_SEC(t), flex:1 };

  const editing = !!employee;
  const [name,       setName]       = useState(employee?.name       || "");
  const [password,   setPassword]   = useState(employee?.password   || "");
  const [color,      setColor]      = useState(employee?.color      || PALETTE[0]);
  const [department, setDepartment] = useState(employee?.department || departments[0]?.name || "");
  const [acessoInad, setAcessoInad] = useState(!!employee?.acessoInadimplentes);
  const [statusInad, setStatusInad] = useState(!!employee?.inadAlterarStatus);
  const [showPw,     setShowPw]     = useState(false);
  const [error,      setError]      = useState("");

  const submit = () => {
    if (!name.trim())     return setError("O nome é obrigatório.");
    if (!password.trim()) return setError("A senha é obrigatória.");
    onSave({ ...employee, id: employee?.id || (slugify(name.trim()) || String(Date.now())), name:name.trim(), password:password.trim(), color, department,
      acessoInadimplentes: acessoInad, inadAlterarStatus: acessoInad && statusInad });
  };

  return (
    <ModalShell title={editing?"✏️  Editar Atendente":"➕  Novo Atendente"} onClose={onClose} maxWidth={460}
      footer={<><button onClick={onClose} style={bS}>Cancelar</button><button onClick={submit} style={btnP(false)}>{editing?"Salvar Alterações":"Cadastrar Atendente"}</button></>}
    >
      <Field label="Nome *">
        <input value={name} onChange={e=>{setName(e.target.value);setError("");}} style={inp} placeholder="Ex: Maria Silva" autoFocus />
      </Field>
      <Field label="Senha de acesso *">
        <div style={{ position:"relative" }}>
          <input type={showPw?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} style={{ ...inp, paddingRight:44 }} placeholder="Defina uma senha..." />
          <button onClick={()=>setShowPw(v=>!v)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:t.textMuted, cursor:"pointer", padding:4, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {showPw
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1.2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1.2"/></svg>
            }
          </button>
        </div>
      </Field>
      <Field label="Departamento">
        {departments.length > 0 ? (
          <select value={department} onChange={e=>setDepartment(e.target.value)} style={sel}>
            <option value="">— Sem departamento —</option>
            {departments.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        ) : (
          <div style={{ padding:"9px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:9, fontSize:13, color:t.textMuted, background:t.pageBg }}>
            Nenhum departamento cadastrado ainda
          </div>
        )}
      </Field>
      <Field label="Permissões">
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
            <input type="checkbox" checked={acessoInad} onChange={e=>setAcessoInad(e.target.checked)} style={{ width:17, height:17, cursor:"pointer", accentColor:"#6366f1" }} />
            <span style={{ fontSize:14, color:t.textSub, fontWeight:500 }}>💰 Acessar Inadimplentes</span>
          </label>
          <label style={{ display:"flex", alignItems:"center", gap:10, cursor:acessoInad?"pointer":"not-allowed", opacity:acessoInad?1:0.45, paddingLeft:27 }}>
            <input type="checkbox" checked={acessoInad && statusInad} disabled={!acessoInad} onChange={e=>setStatusInad(e.target.checked)} style={{ width:17, height:17, cursor:"inherit", accentColor:"#6366f1" }} />
            <span style={{ fontSize:14, color:t.textSub, fontWeight:500 }}>Pode alterar o status dos inadimplentes</span>
          </label>
        </div>
      </Field>
      <Field label="Cor do perfil">
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {PALETTE.map(c=><button key={c} onClick={()=>setColor(c)} style={{ width:32, height:32, borderRadius:"50%", background:c, border:color===c?"3px solid #1e293b":"3px solid transparent", cursor:"pointer", outline:"none", boxShadow:color===c?"0 0 0 2px #fff, 0 0 0 4px "+c:"none" }} />)}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:12, padding:"10px 14px", background:t.pageBg, borderRadius:10, border:`1px solid ${t.border}` }}>
          <Avatar name={name||"??"} color={color} size={36} />
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:t.text }}>{name||"Nome do atendente"}</div>
            {department && <div style={{ fontSize:11, color:"#6366f1", fontWeight:600 }}>{department}</div>}
          </div>
        </div>
      </Field>
      {error && <p style={{ color:"#dc2626", fontSize:13, margin:"-4px 0 0", fontWeight:500 }}>{error}</p>}
    </ModalShell>
  );
}

// ── Satisfação — Admin tab ────────────────────────────────────────────

function SatisfacaoAdminTab({ employees }) {
  const { t, dark } = useTheme();
  const [fase,              setFase]              = useState("idle");
  const [mesMes,            setMesMes]            = useState(() => new Date().getMonth() + 1);
  const [mesAno,            setMesAno]            = useState(() => new Date().getFullYear());
  const [arquivoNome,       setArquivoNome]       = useState("");
  const [parsedData,        setParsedData]        = useState(null);
  const [mapeamentosLocais, setMapeamentosLocais] = useState({});
  const [mapeamentosSalvos, setMapeamentosSalvos] = useState({});
  const [importacoes,       setImportacoes]       = useState([]);
  const [confirmando,       setConfirmando]       = useState(false);
  const [erro,              setErro]              = useState("");
  const [showHistory,       setShowHistory]       = useState(false);
  const [carregando,        setCarregando]        = useState(true);
  const [apiConfig,         setApiConfig]         = useState({});
  const [apiLocal,          setApiLocal]          = useState({ baseUrl:"", apiKey:"", endpoint:"/{protocolo}" });
  const [apiSalvando,       setApiSalvando]       = useState(false);
  const [apiTeste,          setApiTeste]          = useState(null); // null | "ok" | "erro" | "testando"
  const [showApiConfig,     setShowApiConfig]     = useState(false);
  const [enrichProgress,    setEnrichProgress]    = useState(null); // null | { total, done }
  const [enrichResumo,      setEnrichResumo]      = useState(null); // null | { total, ok, semTexto, falhas, motivo }
  const [apiTesteMsg,       setApiTesteMsg]       = useState("");
  const [importResumo,      setImportResumo]      = useState(null); // null | [{ key, adicionados, atualizados, novo }]
  const fileRef = useRef();

  const MN = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  useEffect(() => {
    (async () => {
      const [imps, mmap, apicfg] = await Promise.all([loadSatImportacoes(), loadSatMapeamentos(), loadSatApiConfig()]);
      setImportacoes(imps);
      setMapeamentosSalvos(mmap);
      setApiConfig(apicfg);
      setApiLocal({ baseUrl: apicfg.baseUrl||"", apiKey: apicfg.apiKey||"", endpoint: apicfg.endpoint||"/{protocolo}" });
      setCarregando(false);
    })();
  }, []);

  const existeImportacao = importacoes.some(i => i.mes === mesMes && i.ano === mesAno);

  const handleFile = file => {
    if (!file) return;
    setArquivoNome(file.name);
    setErro("");
    const reader = new FileReader();
    reader.onload = e => {
      try {
        // cellDates:false — datas chegam como número de série e são lidas sem fuso (ver satParseData)
        const wb  = XLSX.read(e.target.result, { type: "array", cellDates: false });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (raw.length < 2) { setErro("Planilha vazia ou sem dados."); setFase("erro"); return; }

        const headers = raw[0].map(String);
        const colAtd  = satDetectCol(headers, ["atendente","colaborador","funcionario","employee","nome atendente","nome do atendente"]);
        const colAt   = satDetectCol(headers, ["atendimento","sat atend","satisfacao com o atend","atendimento ao cliente"]);
        const colNec  = satDetectCol(headers, ["necessidades","necessid","sat nec","necessidades supridas"]);
        const colSis  = satDetectCol(headers, ["sistema","sat sist","satisfacao com o sist","satisfacao sistema"]);
        const colDat  = satDetectCol(headers, ["data","date","dt"]);
        const colProt = satDetectCol(headers, ["protocolo","protocol","prot"]);
        const colCli  = satDetectCol(headers, ["cliente","client","nome do cliente"]);
        const colCom  = satDetectCol(headers, ["comentario","observacao","obs","comment","feedback"]);

        if (colAtd < 0) { setErro("Coluna do atendente não encontrada. O cabeçalho deve conter 'Atendente' ou 'Colaborador'."); setFase("erro"); return; }

        const rowsParsed = [];
        const uniqueNames = new Set();

        for (let i = 1; i < raw.length; i++) {
          const r = raw[i];
          if (!r || r.every(c => !String(c).trim())) continue;
          const nomeRaw = String(r[colAtd] || "").trim();
          if (!nomeRaw) continue;
          uniqueNames.add(nomeRaw);
          const at  = colAt  >= 0 ? satParseScore(r[colAt])  : null;
          const nec = colNec >= 0 ? satParseScore(r[colNec]) : null;
          const sis = colSis >= 0 ? satParseScore(r[colSis]) : null;
          rowsParsed.push({
            nomeExcel:  nomeRaw,
            data:       colDat  >= 0 ? satParseData(r[colDat])         : null,
            protocolo:  colProt >= 0 ? String(r[colProt] || "").trim() : "",
            cliente:    colCli  >= 0 ? String(r[colCli]  || "").trim() : "",
            ...(() => {
              const raw = colCom >= 0 ? String(r[colCom] || "").trim() : "";
              const num = Number(raw);
              // Se for número (0/1) é um flag do sistema — texto vem via API
              // Se for texto livre já é o comentário em si
              return { comentario: (!isNaN(num) && raw !== "") ? "" : raw, temComentarioApi: !isNaN(num) && num > 0 };
            })(),
            atendimento: at, necessidades: nec, sistema: sis,
            temResposta: at !== null || nec !== null || sis !== null,
          });
        }

        const nmEmp  = (employees || []).map(e => ({ ...e, norm: satNorm(e.name) }));
        const saved  = { ...mapeamentosSalvos };
        const matched = {};
        const unmatchedList = [];

        for (const nome of uniqueNames) {
          const norm = satNorm(nome);
          if (saved[norm]) { matched[nome] = saved[norm]; }
          else {
            const empId = satFindEmployee(nome, nmEmp);
            if (empId) matched[nome] = empId;
            else       { unmatchedList.push(nome); matched[nome] = null; }
          }
        }

        setParsedData({ rows: rowsParsed, matchedNames: matched, unmatched: unmatchedList });
        setMapeamentosLocais({});
        setFase("preview");
      } catch (err) {
        console.error(err);
        setErro("Erro ao ler o arquivo: " + err.message);
        setFase("erro");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmar = async () => {
    setConfirmando(true);
    try {
      const key      = `${mesAno}-${String(mesMes).padStart(2, "0")}`;
      const finalMap = { ...parsedData.matchedNames, ...mapeamentosLocais };

      const newMap = { ...mapeamentosSalvos };
      for (const [nome, empId] of Object.entries(finalMap))
        if (empId) newMap[satNorm(nome)] = empId;
      await saveSatMapeamentos(newMap);
      setMapeamentosSalvos(newMap);

      let registros = parsedData.rows.map(r => ({ ...r, employeeId: finalMap[r.nomeExcel] || null }));

      // ── Enriquecimento via API (busca comentários pelos protocolos) ──────
      // Cada protocolo é consultado uma vez; o texto vai para todas as linhas com ele.
      const protocolos = apiConfig?.apiKey && apiConfig?.baseUrl
        ? [...new Set(registros.filter(r => r.temComentarioApi && r.protocolo).map(r => r.protocolo))]
        : [];
      setEnrichResumo(null);
      if (protocolos.length > 0) {
        const textos = {};
        let falhas = 0, semTexto = 0, ultimaFalha = null;
        setEnrichProgress({ total: protocolos.length, done: 0 });
        for (let i = 0; i < protocolos.length; i++) {
          const r = await consultarLogike(protocolos[i], apiConfig);
          if (r.ok && r.texto) textos[protocolos[i]] = r.texto;
          else if (r.ok) semTexto++;
          else { falhas++; ultimaFalha = r; }
          setEnrichProgress({ total: protocolos.length, done: i + 1 });
        }
        registros = registros.map(x => textos[x.protocolo] ? { ...x, comentario: textos[x.protocolo] } : x);
        setEnrichProgress(null);
        setEnrichResumo({ total: protocolos.length, ok: Object.keys(textos).length, semTexto, falhas,
          motivo: ultimaFalha ? descreverTesteLogike(ultimaFalha).msg : null });
      }

      // ── Distribui por mês (data de cada linha; sem data → mês selecionado) e junta
      //    com o que já existe, sem duplicar. Leitura direta: se falhar, nada é gravado.
      const atuais = (await getDocs(collection(db, "satisfacao"))).docs.map(d => d.data());
      const { docs, resumo } = satDistribuir(atuais, registros, key, arquivoNome);
      const batch = writeBatch(db);
      for (const [k, d] of Object.entries(docs)) batch.set(doc(db, "satisfacao", k), d);
      await batch.commit();
      setImportResumo(resumo);
      setImportacoes(await loadSatImportacoes());
      setFase("concluido");
    } catch (err) {
      console.error(err);
      setErro("Erro ao salvar: " + err.message);
      setFase("erro");
    } finally {
      setConfirmando(false);
    }
  };

  const resetar = () => { setFase("idle"); setArquivoNome(""); setParsedData(null); setMapeamentosLocais({}); setErro(""); setEnrichResumo(null); setImportResumo(null); };

  if (carregando) return <div style={{ textAlign:"center", padding:60, color:t.textMuted }}>Carregando...</div>;

  return (
    <div style={{ maxWidth:780, margin:"0 auto" }}>

      {/* ── API Lógike config ── */}
      <div style={{ marginBottom:20, background:t.card, border:`1px solid ${t.border}`, borderRadius:14, overflow:"hidden" }}>
        <button onClick={() => setShowApiConfig(v => !v)}
          style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", background:"transparent", border:"none", cursor:"pointer", ...FF }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:16 }}>🔌</span>
            <span style={{ fontWeight:600, fontSize:14, color:t.text }}>API Lógike Admin</span>
            {apiConfig?.apiKey
              ? <span style={{ padding:"2px 8px", background:"#f0fdf4", border:"1px solid #86efac", borderRadius:20, fontSize:11, color:"#166534", fontWeight:600 }}>Configurada</span>
              : <span style={{ padding:"2px 8px", background:dark?"#1e2a3a":"#f8fafc", border:`1px solid ${t.border}`, borderRadius:20, fontSize:11, color:t.textMuted }}>Não configurada</span>
            }
          </div>
          <span style={{ color:t.textMuted, fontSize:12 }}>{showApiConfig ? "▲ Fechar" : "▼ Configurar"}</span>
        </button>

        {showApiConfig && (
          <div style={{ padding:"0 18px 18px", borderTop:`1px solid ${t.border}` }}>
            <p style={{ fontSize:12, color:t.textMuted, margin:"12px 0 16px" }}>
              Configure a API do Lógike Admin para buscar automaticamente o texto dos comentários durante a importação.
              O campo <b>Endpoint</b> usa <code style={{ background:dark?"#0f172a":"#f1f5f9", padding:"1px 5px", borderRadius:4 }}>{"{protocolo}"}</code> como placeholder.
            </p>

            <div style={{ display:"grid", gap:12 }}>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:t.textMuted, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>URL Base da API</label>
                <input
                  type="url"
                  placeholder="https://api.logikeadmin.com.br/v1"
                  value={apiLocal.baseUrl}
                  onChange={e => setApiLocal(v => ({ ...v, baseUrl: e.target.value }))}
                  style={{ width:"100%", boxSizing:"border-box", padding:"8px 12px", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:8, color:t.text, fontSize:13, ...FF }}
                />
              </div>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:t.textMuted, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>Chave de API (API Key)</label>
                <input
                  type="password"
                  placeholder="Chave fornecida pelo Lógike Admin"
                  value={apiLocal.apiKey}
                  onChange={e => setApiLocal(v => ({ ...v, apiKey: e.target.value }))}
                  style={{ width:"100%", boxSizing:"border-box", padding:"8px 12px", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:8, color:t.text, fontSize:13, ...FF }}
                />
              </div>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:t.textMuted, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>Endpoint (ajuste conforme documentação)</label>
                <input
                  type="text"
                  placeholder="/{protocolo}"
                  value={apiLocal.endpoint}
                  onChange={e => setApiLocal(v => ({ ...v, endpoint: e.target.value }))}
                  style={{ width:"100%", boxSizing:"border-box", padding:"8px 12px", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:8, color:t.text, fontSize:13, ...FF }}
                />
              </div>
            </div>

            <div style={{ display:"flex", gap:8, marginTop:14, alignItems:"center" }}>
              <button
                onClick={async () => {
                  setApiSalvando(true);
                  const cfg = { baseUrl: apiLocal.baseUrl.trim(), apiKey: apiLocal.apiKey.trim(), endpoint: apiLocal.endpoint.trim() || "/{protocolo}" };
                  await saveSatApiConfig(cfg);
                  setApiConfig(cfg);
                  setApiSalvando(false);
                }}
                disabled={apiSalvando || !apiLocal.baseUrl || !apiLocal.apiKey}
                style={{ padding:"8px 18px", background:"#6366f1", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer", opacity:(!apiLocal.baseUrl||!apiLocal.apiKey||apiSalvando)?0.5:1, ...FF }}>
                {apiSalvando ? "Salvando..." : "Salvar"}
              </button>
              <button
                onClick={async () => {
                  setApiTeste("testando");
                  const cfg = { baseUrl: apiLocal.baseUrl.trim(), apiKey: apiLocal.apiKey.trim(), endpoint: apiLocal.endpoint.trim() || "/{protocolo}" };
                  const d = descreverTesteLogike(await consultarLogike("TESTE", cfg));
                  setApiTeste(d.ok ? "ok" : "erro");
                  setApiTesteMsg(d.msg);
                }}
                disabled={apiTeste === "testando" || !apiLocal.baseUrl || !apiLocal.apiKey}
                style={{ padding:"8px 18px", background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:8, color:t.btnSecText, fontWeight:600, fontSize:13, cursor:"pointer", opacity:(!apiLocal.baseUrl||!apiLocal.apiKey)?0.5:1, ...FF }}>
                {apiTeste === "testando" ? "Testando..." : "Testar conexão"}
              </button>
              {apiConfig?.apiKey && (
                <button onClick={async () => { await saveSatApiConfig({}); setApiConfig({}); setApiLocal({ baseUrl:"", apiKey:"", endpoint:"/{protocolo}" }); setApiTeste(null); setApiTesteMsg(""); }}
                  style={{ marginLeft:"auto", padding:"8px 14px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, color:"#dc2626", fontWeight:600, fontSize:12, cursor:"pointer", ...FF }}>
                  Remover API
                </button>
              )}
            </div>
            {apiTesteMsg && apiTeste !== "testando" && (
              <div style={{ marginTop:12, padding:"10px 14px", borderRadius:8, fontSize:12.5, lineHeight:1.5, fontWeight:500,
                background: apiTeste === "ok" ? (dark?"rgba(34,197,94,0.1)":"#f0fdf4") : (dark?"rgba(239,68,68,0.1)":"#fef2f2"),
                border: `1px solid ${apiTeste === "ok" ? "#86efac" : "#fecaca"}`,
                color: apiTeste === "ok" ? (dark?"#86efac":"#166534") : (dark?"#fca5a5":"#b91c1c") }}>
                {apiTesteMsg}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
        <div>
          <h3 style={{ margin:0, fontWeight:700, fontSize:17, color:t.text }}>Importar Pesquisa de Satisfação</h3>
          <p style={{ margin:"4px 0 0", fontSize:13, color:t.textMuted }}>Carregue a planilha .xlsx mensal com as avaliações dos clientes.</p>
        </div>
        <button onClick={() => setShowHistory(h => !h)}
          style={{ padding:"7px 16px", background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:8, cursor:"pointer", fontSize:13, color:t.btnSecText, fontWeight:600, ...FF, whiteSpace:"nowrap" }}>
          {showHistory ? "Ocultar" : `📜 Histórico (${importacoes.length})`}
        </button>
      </div>

      {showHistory && (
        <div style={{ marginBottom:24, background:t.card, border:`1px solid ${t.border}`, borderRadius:14, overflow:"hidden" }}>
          {importacoes.length === 0 ? (
            <div style={{ textAlign:"center", padding:32, color:t.textMuted, fontSize:14 }}>Nenhuma importação realizada ainda.</div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:dark?"#172032":"#f8fafc" }}>
                  {["Competência","Registros","Respondidos","Importado em",""].map((h, i) => (
                    <th key={i} style={{ padding:"9px 14px", textAlign:i>=1&&i<=3?"right":"left", fontSize:12, color:t.textMuted, fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importacoes.map(imp => (
                  <tr key={imp.key} style={{ borderTop:`1px solid ${t.border}` }}>
                    <td style={{ padding:"9px 14px", fontWeight:600, color:t.text }}>{MN[imp.mes-1]} {imp.ano}</td>
                    <td style={{ padding:"9px 14px", textAlign:"right", color:t.text }}>{imp.totalRegistros}</td>
                    <td style={{ padding:"9px 14px", textAlign:"right", color:t.text }}>{imp.totalRespondidos}</td>
                    <td style={{ padding:"9px 14px", textAlign:"right", color:t.textMuted, fontSize:12 }}>{imp.importadoEm ? new Date(imp.importadoEm).toLocaleDateString("pt-BR") : "—"}</td>
                    <td style={{ padding:"9px 14px", textAlign:"right" }}>
                      <button onClick={async () => {
                        if (!window.confirm(`Remover ${MN[imp.mes-1]} ${imp.ano}?`)) return;
                        await deleteSatImportacao(imp.mes, imp.ano);
                        setImportacoes(v => v.filter(x => x.key !== imp.key));
                      }} style={{ padding:"4px 10px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:6, cursor:"pointer", fontSize:11, color:"#dc2626", fontWeight:500 }}>
                        🗑️ Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(fase === "idle" || fase === "erro") && (
        <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:16, padding:28 }}>
          <div style={{ display:"flex", gap:12, alignItems:"flex-end", marginBottom:24, flexWrap:"wrap" }}>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:t.textMuted, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>Mês</label>
              <select value={mesMes} onChange={e => setMesMes(+e.target.value)}
                style={{ padding:"8px 12px", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:8, color:t.text, fontSize:14, cursor:"pointer", ...FF }}>
                {MN.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:t.textMuted, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>Ano</label>
              <select value={mesAno} onChange={e => setMesAno(+e.target.value)}
                style={{ padding:"8px 12px", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:8, color:t.text, fontSize:14, cursor:"pointer", ...FF }}>
                {Array.from({ length: new Date().getFullYear() - 2024 + 2 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {existeImportacao && (
              <div style={{ padding:"8px 14px", background:"#fef3c7", border:"1px solid #fde68a", borderRadius:8, fontSize:12, color:"#92400e", fontWeight:600, alignSelf:"flex-end" }}>
                ⚠️ Já importado — registros novos serão somados, sem duplicar
              </div>
            )}
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor="#6366f1"; e.currentTarget.style.background=dark?"#1a2040":"#eef2ff"; }}
            onDragLeave={e => { e.currentTarget.style.borderColor=t.border; e.currentTarget.style.background="transparent"; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor=t.border; e.currentTarget.style.background="transparent"; const f=e.dataTransfer.files[0]; if(f) handleFile(f); }}
            style={{ border:`2px dashed ${t.border}`, borderRadius:12, padding:"40px 24px", textAlign:"center", cursor:"pointer", transition:"all 0.2s" }}>
            <div style={{ fontSize:38, marginBottom:10 }}>📂</div>
            <div style={{ fontWeight:600, fontSize:15, color:t.text, marginBottom:6 }}>Clique para selecionar ou arraste o arquivo aqui</div>
            <div style={{ fontSize:12, color:t.textMuted }}>Arquivos .xlsx ou .xls — a primeira linha deve ser o cabeçalho</div>
            <div style={{ fontSize:12, color:t.textMuted, marginTop:4 }}>O arquivo pode ter vários meses: cada registro vai para o mês da sua data. Registros sem data vão para o mês selecionado acima.</div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }} onChange={e => { if(e.target.files[0]) handleFile(e.target.files[0]); e.target.value=""; }} />
          </div>

          {fase === "erro" && (
            <div style={{ marginTop:16, padding:"10px 14px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, color:"#dc2626", fontSize:13 }}>{erro}</div>
          )}
        </div>
      )}

      {fase === "preview" && parsedData && (() => {
        const totalResp = parsedData.rows.filter(r => r.temResposta).length;
        const totalSem  = parsedData.rows.length - totalResp;
        const porMes    = satAgruparPorMes(parsedData.rows, `${mesAno}-${String(mesMes).padStart(2, "0")}`);
        const meses     = Object.keys(porMes).sort();
        const rotuloMes = k => `${MN[+k.slice(5) - 1]} ${k.slice(0, 4)}`;
        return (
          <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:16, padding:28 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
              <div>
                <h4 style={{ margin:0, fontWeight:700, fontSize:15, color:t.text }}>Pré-visualização — {meses.length === 1 ? rotuloMes(meses[0]) : `${meses.length} meses`}</h4>
                <p style={{ margin:"3px 0 0", fontSize:12, color:t.textMuted }}>{arquivoNome}</p>
              </div>
              <div style={{ display:"flex", gap:16 }}>
                {[{v:parsedData.rows.length,l:"Total",c:t.text},{v:totalResp,l:"Responderam",c:"#22c55e"},{v:totalSem,l:"Sem Resposta",c:"#f59e0b"}].map(({v,l,c}) => (
                  <div key={l} style={{ textAlign:"center" }}>
                    <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
                    <div style={{ fontSize:11, color:t.textMuted }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:600, color:t.textMuted, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em" }}>Meses identificados</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {meses.map(k => {
                  const existe = importacoes.some(i => i.key === k);
                  return (
                    <span key={k} style={{ padding:"3px 10px", background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:20, fontSize:12, color:t.text }}>
                      {rotuloMes(k)} · {porMes[k].length} registro(s) <span style={{ color:t.textMuted }}>{existe ? "— já existe, será atualizado" : "— novo"}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {parsedData.unmatched.length > 0 && (
              <div style={{ marginBottom:20, padding:"14px 16px", background:dark?"#1a2540":"#fff7ed", border:`1px solid ${dark?"#1e3a5f":"#fed7aa"}`, borderRadius:10 }}>
                <div style={{ fontWeight:600, fontSize:13, color:dark?"#93c5fd":"#c2410c", marginBottom:12 }}>
                  ⚠️ {parsedData.unmatched.length} nome(s) não encontrado(s) — vincule manualmente:
                </div>
                {parsedData.unmatched.map(nome => (
                  <div key={nome} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:13, color:t.text, minWidth:160, fontStyle:"italic" }}>"{nome}"</span>
                    <span style={{ fontSize:13, color:t.textMuted }}>→</span>
                    <select value={mapeamentosLocais[nome] || ""}
                      onChange={e => setMapeamentosLocais(m => ({ ...m, [nome]: e.target.value || null }))}
                      style={{ flex:1, minWidth:160, padding:"6px 10px", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:7, color:t.text, fontSize:13, ...FF }}>
                      <option value="">— Não vincular —</option>
                      {(employees||[]).map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {Object.values(parsedData.matchedNames).some(Boolean) && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:600, color:t.textMuted, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em" }}>Atendentes identificados</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {[...new Set(Object.values(parsedData.matchedNames).filter(Boolean))].map(id => {
                    const emp = (employees||[]).find(e => e.id === id);
                    return (
                      <span key={id} style={{ padding:"3px 10px", background:dark?"#1a2e1a":"#f0fdf4", border:"1px solid #86efac", borderRadius:20, fontSize:12, color:dark?"#86efac":"#166534" }}>
                        ✓ {emp?.name || id}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={resetar}
                style={{ padding:"9px 20px", background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:9, cursor:"pointer", fontSize:14, color:t.btnSecText, fontWeight:600, ...FF }}>
                Cancelar
              </button>
              <button onClick={confirmar} disabled={confirmando}
                style={{ padding:"9px 24px", background:"#6366f1", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:14, cursor:confirmando?"wait":"pointer", opacity:confirmando?0.7:1, ...FF }}>
                {enrichProgress
                  ? `Buscando comentários… ${enrichProgress.done}/${enrichProgress.total}`
                  : confirmando ? "Salvando..."
                  : "Confirmar Importação"}
              </button>
            </div>
            {apiConfig?.apiKey && (() => {
              const comCount = new Set(parsedData.rows.filter(r => r.temComentarioApi && r.protocolo).map(r => r.protocolo)).size;
              return comCount > 0 ? (
                <p style={{ margin:"10px 0 0", fontSize:12, color:t.textMuted, textAlign:"right" }}>
                  🔌 Comentários de {comCount} protocolo(s) serão buscados via API Lógike durante a importação
                </p>
              ) : null;
            })()}
          </div>
        );
      })()}

      {fase === "concluido" && (
        <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:16, padding:48, textAlign:"center" }}>
          <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
          <h4 style={{ margin:"0 0 8px", fontWeight:700, fontSize:18, color:t.text }}>Importação concluída!</h4>
          <p style={{ color:t.textMuted, fontSize:14, margin:"0 0 24px" }}>
            {parsedData?.rows.length} registros · {parsedData?.rows.filter(r=>r.temResposta).length} respondidos
          </p>
          {importResumo && (
            <div style={{ maxWidth:520, margin:"-8px auto 24px", display:"flex", flexDirection:"column", gap:4, fontSize:13, color:t.text }}>
              {importResumo.map(m => (
                <div key={m.key}>
                  <b>{MN[+m.key.slice(5) - 1]} {m.key.slice(0, 4)}</b>{m.novo ? " (novo)" : ""} — {m.adicionados} adicionado(s){m.atualizados ? `, ${m.atualizados} já existente(s) atualizado(s)` : ""}
                </div>
              ))}
            </div>
          )}
          {enrichResumo && (
            <div style={{ maxWidth:520, margin:"-8px auto 24px", padding:"12px 16px", borderRadius:10, fontSize:13, lineHeight:1.6, textAlign:"left",
              background: enrichResumo.falhas ? (dark?"rgba(245,158,11,0.1)":"#fffbeb") : (dark?"rgba(34,197,94,0.1)":"#f0fdf4"),
              border: `1px solid ${enrichResumo.falhas ? "#fde68a" : "#86efac"}`, color:t.text }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>🔌 Comentários via API Lógike</div>
              <div>{enrichResumo.ok} de {enrichResumo.total} protocolo(s) com comentário obtido.</div>
              {enrichResumo.semTexto > 0 && <div>{enrichResumo.semTexto} respondido(s) pela API sem texto de comentário.</div>}
              {enrichResumo.falhas > 0 && <div style={{ color:dark?"#fbbf24":"#b45309", fontWeight:600 }}>⚠️ {enrichResumo.falhas} consulta(s) falharam. {enrichResumo.motivo}</div>}
            </div>
          )}
          <button onClick={resetar}
            style={{ padding:"10px 24px", background:"#6366f1", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>
            Nova Importação
          </button>
        </div>
      )}
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────

function AdminPanel({ onBack, onGestao }) {
  const { t } = useTheme();
  const [tab,         setTab]         = useState("planilhas");
  const [employees,   setEmployees]   = useState([]);
  const [pages,       setPages]       = useState([]);
  const [counts,      setCounts]      = useState({});
  const [tipos,        setTipos]        = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(false);
  const [modal,       setModal]       = useState(null);
  const [confirmId,   setConfirmId]   = useState(null);
  const [confirmType, setConfirmType] = useState(null);
  const [toast,       setToast]       = useState("");
  const [sigs,        setSigs]        = useState({});
  const [carimboDB,   setCarimboDB]   = useState(null);
  const [sigsLoaded,  setSigsLoaded]  = useState(false);
  const [sigSaving,   setSigSaving]   = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(""), 3000); };

  useEffect(() => {
    (async () => {
      let emps, pgs, tps, depts, allSigs;
      try {
        [emps, pgs, tps, depts, allSigs] = await Promise.all([loadEmployees(), loadPages(), loadTipos(), loadDepartments(), loadAllSignatures()]);
      } catch (e) {
        console.error("AdminPanel: falha ao carregar dados", e);
        setLoadError(true); setLoading(false);
        return;
      }
      const sorted = sortPages(pgs);
      setEmployees(emps); setPages(sorted); setTipos(tps); setDepartments(depts);
      const { carimbo: car, ...restSigs } = allSigs;
      setSigs(restSigs); setCarimboDB(car || null); setSigsLoaded(true);
      setCounts(await contarPaginas(sorted, tps)); setLoading(false);
    })();
  }, []);

  function sortPages(list) { return [...list].sort((a,b)=>b.year!==a.year?b.year-a.year:b.month-a.month); }

  // Grava um único documento no Firestore; a tela só muda se a gravação der certo.
  const persist = async op => {
    try { await op(); return true; }
    catch (e) { console.error(e); showToast("❌  Erro ao salvar — nada foi alterado. Verifique a conexão."); return false; }
  };

  const savePage = async pg => {
    const isEdit = modal.mode === "edit";
    if (!await persist(() => saveItem("pages", pg))) return;
    setPages(sortPages(isEdit ? pages.map(p=>p.id===pg.id?pg:p) : [...pages, pg]));
    if (!isEdit) setCounts(c=>({...c,[pg.id]:{total:0,resolved:0,inProgress:0,opAbertos:0}}));
    showToast(isEdit ? "✓  Planilha atualizada." : "✓  Planilha criada.");
    setModal(null);
  };

  const deletePage = async () => {
    const pg = pages.find(p=>p.id===confirmId);
    if (!await persist(() => deleteItem("pages", confirmId))) return;
    await deletePageRecords(confirmId);
    setPages(pages.filter(p=>p.id!==confirmId));
    showToast("🗑️  Planilha \"" + (pg?.name||"") + "\" excluída.");
    setConfirmId(null); setConfirmType(null);
  };

  const saveDeptFn = async dept => {
    const isEdit = modal.mode === "edit";
    if (!await persist(() => saveItem("departments", dept))) return;
    setDepartments(isEdit ? departments.map(d=>d.id===dept.id?dept:d) : [...departments, dept]);
    showToast(isEdit ? `✓  "${dept.name}" atualizado.` : `✓  "${dept.name}" criado.`);
    setModal(null);
  };

  const deleteDept = async () => {
    const dept = departments.find(d=>d.id===confirmId);
    if (!await persist(() => deleteItem("departments", confirmId))) return;
    setDepartments(departments.filter(d=>d.id!==confirmId));
    showToast(`🗑️  "${dept?.name||"Departamento"}" removido.`);
    setConfirmId(null); setConfirmType(null);
  };

  const saveTipoFn = async tp => {
    const isEdit = modal.mode === "edit";
    if (!await persist(() => saveItem("tipos", tp))) return;
    setTipos(isEdit ? tipos.map(x=>x.id===tp.id?tp:x) : [...tipos, tp]);
    showToast(isEdit ? `✓  Tipo "${tp.label}" atualizado.` : `✓  Tipo "${tp.label}" criado.`);
    setModal(null);
  };

  const deleteTipo = async () => {
    const tp = tipos.find(x=>x.id===confirmId);
    if (!await persist(() => deleteItem("tipos", confirmId))) return;
    setTipos(tipos.filter(x=>x.id!==confirmId));
    showToast(`🗑️  Tipo "${tp?.label||""}" removido.`);
    setConfirmId(null); setConfirmType(null);
  };

  const saveEmployee = async emp => {
    const isEdit = modal.mode === "edit";
    if (!isEdit && employees.find(e=>e.id===emp.id)) emp.id = emp.id+"-"+Date.now();
    if (!await persist(() => saveItem("employees", emp))) return;
    setEmployees(isEdit ? employees.map(e=>e.id===emp.id?emp:e) : [...employees, emp]);
    showToast(isEdit ? `✓  ${emp.name} atualizado.` : `✓  ${emp.name} cadastrado.`);
    setModal(null);
  };

  const deleteEmployee = async () => {
    const emp = employees.find(e=>e.id===confirmId);
    if (!await persist(() => deleteItem("employees", confirmId))) return;
    setEmployees(employees.filter(e=>e.id!==confirmId));
    showToast("🗑️  " + (emp?.name||"Atendente") + " removido.");
    setConfirmId(null); setConfirmType(null);
  };

  const tabBtn = (key, label) => (
    <button onClick={()=>setTab(key)} style={{ padding:"8px 16px", border:"none", borderRadius:8, fontWeight:600, fontSize:13.5, cursor:"pointer", ...FF,
      background: tab===key ? t.tabActiveBg : "transparent",
      color: tab===key ? t.tabActiveText : t.tabInactiveText,
      transition:"all 0.15s" }}>
      {label}
    </button>
  );

  const cur = nowMY();

  return (
    <div style={{ minHeight:"100vh", background:t.pageBg, ...FF }}>

      <div style={{ background:t.header, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 12px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <button onClick={()=>{ signOut(auth).catch(()=>{}); onBack(); }} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", color:"#94a3b8", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:13, ...FF }}>← Sair do Admin</button>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:9, background:"linear-gradient(135deg,#f59e0b,#ef4444)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚙️</div>
            <span style={{ color:"#f8fafc", fontWeight:800, fontSize:16 }}>Painel Administrativo</span>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <DarkToggle />
          {!loading && !loadError && tab === "planilhas" && <button onClick={()=>setModal({mode:"add",type:"page"})} style={{ padding:"8px 16px", background:"#6366f1", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:13.5, cursor:"pointer", ...FF }}>Nova Planilha</button>}
          {!loading && !loadError && tab === "atendentes" && <button onClick={()=>setModal({mode:"add",type:"emp"})}  style={{ padding:"8px 16px", background:"#6366f1", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:13.5, cursor:"pointer", ...FF }}>Novo Atendente</button>}
          {!loading && !loadError && tab === "tipos"         && <button onClick={()=>setModal({mode:"add",type:"tipo"})} style={{ padding:"8px 16px", background:"#6366f1", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:13.5, cursor:"pointer", ...FF }}>Novo Tipo</button>}
          {!loading && !loadError && tab === "departamentos" && <button onClick={()=>setModal({mode:"add",type:"dept"})} style={{ padding:"8px 16px", background:"#6366f1", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:13.5, cursor:"pointer", ...FF }}>Novo Departamento</button>}
        </div>
      </div>

      <div style={{ background:t.metaBg, borderBottom:`1px solid ${t.metaBorder}`, padding:"10px 24px", display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
        {tabBtn("planilhas",     "📋  Planilhas")}
        {tabBtn("atendentes",    "👥  Atendentes")}
        {tabBtn("tipos",         "🏷️  Tipos")}
        {tabBtn("departamentos", "🏢  Departamentos")}
        {tabBtn("assinaturas",   "✍️  Assinaturas")}
        {tabBtn("satisfacao",    "⭐  Satisfação")}
        {tabBtn("inadimplentes", "💰  Inadimplentes")}
        <button onClick={onGestao} style={{ padding:"10px 22px", border:"none", borderRadius:10, fontWeight:700, fontSize:14, cursor:"pointer", ...FF, background:"transparent", color:"#60a5fa", transition:"all 0.15s" }}>📊  Gestão</button>
        <span style={{ marginLeft:"auto", fontSize:12, color:t.textMuted }}>
          {tab==="planilhas"     && `${pages.length} planilha${pages.length!==1?"s":""}`}
          {tab==="atendentes"    && `${employees.length} atendente${employees.length!==1?"s":""}`}
          {tab==="tipos"         && `${tipos.length} tipo${tipos.length!==1?"s":""}`}
          {tab==="departamentos" && `${departments.length} departamento${departments.length!==1?"s":""}`}
        </span>
      </div>

      <div style={{ padding:24 }}>
        <PresenceBar employees={employees} />
        {loadError ? <LoadErrorBox /> : loading ? <div style={{ textAlign:"center", padding:80, color:t.textMuted }}>Carregando...</div> : (

          tab === "planilhas" ? (<><FreshdeskAdminCard />{
            pages.length === 0 ? (
              <div style={{ textAlign:"center", padding:80, background:t.card, borderRadius:18, border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:56, marginBottom:16 }}>📋</div>
                <div style={{ fontSize:18, fontWeight:700, color:t.text, marginBottom:8 }}>Nenhuma planilha criada</div>
                <div style={{ fontSize:14, color:t.textMuted, marginBottom:24 }}>Crie a primeira planilha — ela ficará visível para todos os atendentes.</div>
                <button onClick={()=>setModal({mode:"add",type:"page"})} style={{ padding:"12px 28px", background:"#6366f1", border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", ...FF }}>+ Criar primeira planilha</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:16 }}>
                {pages.map(pg => (
                  <PageCard key={pg.id} pg={pg} employees={employees} cnt={counts[pg.id]||{total:0,resolved:0,inProgress:0,opAbertos:0}} isCurrentMonth={pg.month===cur.month&&pg.year===cur.year} onClick={()=>{}}
                    actions={<>
                      <button onClick={()=>setModal({mode:"edit",type:"page",page:pg})} style={{ background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:12, color:t.btnSecText, fontWeight:500 }}>✏️</button>
                      <button onClick={()=>{setConfirmId(pg.id);setConfirmType("page");}} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#dc2626", fontWeight:500 }}>🗑️</button>
                    </>}
                  />
                ))}
              </div>
            )
          }</>) : tab === "atendentes" ? (
            employees.length === 0 ? (
              <div style={{ textAlign:"center", padding:80, background:t.card, borderRadius:18, border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:52, marginBottom:14 }}>👥</div>
                <div style={{ fontSize:17, fontWeight:700, color:t.text, marginBottom:8 }}>Nenhum atendente cadastrado</div>
                <button onClick={()=>setModal({mode:"add",type:"emp"})} style={{ marginTop:8, padding:"10px 24px", background:"#6366f1", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>+ Criar primeiro atendente</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(290px, 1fr))", gap:14 }}>
                {employees.map((emp,i)=>(
                  <div key={emp.id} style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:16, padding:"18px 20px", display:"flex", alignItems:"center", gap:14 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:t.pageBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:t.textMuted, flexShrink:0 }}>{i+1}</div>
                    <Avatar name={emp.name} color={emp.color} size={46} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:15, color:t.text, marginBottom:2 }}>{emp.name}</div>
                      <div style={{ fontSize:11, color:"#6366f1", fontWeight:600, marginBottom:2 }}>{emp.department || "—"}</div>
                      <div style={{ fontSize:12, color:t.textMuted }}>Senha: <span style={{ letterSpacing:2 }}>{"•".repeat(Math.min(emp.password.length,8))}</span></div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>setModal({mode:"edit",type:"emp",employee:emp})} style={{ background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:9, padding:"7px 10px", cursor:"pointer", fontSize:14 }}>✏️</button>
                      <button onClick={()=>{setConfirmId(emp.id);setConfirmType("employee");}} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:9, padding:"7px 10px", cursor:"pointer", fontSize:14 }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : tab === "tipos" ? (
            // ── Tipos tab ──────────────────────────────────────────
            tipos.length === 0 ? (
              <div style={{ textAlign:"center", padding:80, background:t.card, borderRadius:18, border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:52, marginBottom:14 }}>🏷️</div>
                <div style={{ fontSize:17, fontWeight:700, color:t.text, marginBottom:8 }}>Nenhum tipo cadastrado</div>
                <button onClick={()=>setModal({mode:"add",type:"tipo"})} style={{ marginTop:8, padding:"10px 24px", background:"#6366f1", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>+ Criar primeiro tipo</button>
              </div>
            ) : (
              (() => {
                const deptOrder = departments.map(d => d.name);
                const allDeptNames = [...new Set([...deptOrder, ...tipos.map(tp => tp.department)])];
                const grouped = allDeptNames.reduce((acc, deptName) => {
                  const list = tipos.filter(tp => tp.department === deptName);
                  if (list.length) acc[deptName] = list;
                  return acc;
                }, {});
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                    {Object.entries(grouped).map(([dept, list]) => (
                      <div key={dept}>
                        <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
                          <DeptBadge dept={dept} />
                          <span>{list.length} tipo{list.length!==1?"s":""}</span>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:10 }}>
                          {list.map(tp => (
                            <div key={tp.id} style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:14, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                              <span style={{ background:tp.bg, color:tp.text, padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>{tp.label}</span>
                              <div style={{ flex:1 }} />
                              <button onClick={()=>setModal({mode:"edit",type:"tipo",tipo:tp})} style={{ background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:12, color:t.btnSecText, fontWeight:500 }}>✏️</button>
                              <button onClick={()=>{setConfirmId(tp.id);setConfirmType("tipo");}} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#dc2626", fontWeight:500 }}>🗑️</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )
          ) : tab === "assinaturas" ? (
            // ── Assinaturas tab ────────────────────────────────────
            !sigsLoaded ? (
              <div style={{ textAlign:"center", padding:80, color:t.textMuted }}>Carregando assinaturas...</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

                {/* Carimbo da empresa */}
                <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:18, padding:"22px 24px" }}>
                  <div style={{ fontWeight:800, fontSize:15, color:t.text, marginBottom:4 }}>🏷️  Carimbo da Empresa</div>
                  <div style={{ fontSize:12, color:t.textMuted, marginBottom:16 }}>Aparece em todos os pontos assinados pelos colaboradores.</div>
                  <SigUploadRow
                    current={carimboDB}
                    saving={sigSaving === "carimbo"}
                    keepAlpha
                    onUpload={async b64 => { setSigSaving("carimbo"); const ok = await saveSignature("carimbo", b64); setSigSaving(null); if (ok) { setCarimboDB(b64); showToast("✓  Carimbo salvo."); } else { showToast("❌  Erro ao salvar — tente uma imagem menor."); } }}
                    onDelete={async () => { setSigSaving("carimbo"); await deleteSignature("carimbo"); setCarimboDB(null); setSigSaving(null); showToast("🗑️  Carimbo removido."); }}
                    t={t}
                  />
                  {!carimboDB && <div style={{ fontSize:12, color:"#d97706", marginTop:10 }}>⚠️  Nenhum carimbo cadastrado — os pontos serão assinados sem carimbo.</div>}
                </div>

                {/* Assinaturas dos colaboradores */}
                <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:18, padding:"22px 24px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                    <div style={{ fontWeight:800, fontSize:15, color:t.text }}>✍️  Assinaturas dos Colaboradores</div>
                    <span style={{ fontSize:12, color:t.textMuted }}>{Object.keys(sigs).length}/{employees.length} configuradas</span>
                  </div>
                  <div style={{ fontSize:12, color:t.textMuted, marginBottom:16 }}>Faça upload do PNG da assinatura de cada colaborador.</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {employees.map(emp => (
                      <div key={emp.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 16px", borderRadius:12, border:`1px solid ${sigs[emp.id]?"#86efac":t.border}`, background:sigs[emp.id]?"#f0fdf4":t.pageBg, flexWrap:"wrap" }}>
                        <Avatar name={emp.name} color={emp.color||"#6366f1"} size={36} />
                        <div style={{ flex:1, minWidth:120 }}>
                          <div style={{ fontWeight:700, fontSize:14, color:t.text }}>{emp.name}</div>
                          <div style={{ fontSize:11, color:t.textMuted }}>{emp.department||"—"}</div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:600, color:sigs[emp.id]?"#16a34a":"#d97706", flexShrink:0 }}>
                          {sigs[emp.id] ? "✅ Configurada" : "⏳ Pendente"}
                        </span>
                        <SigUploadRow
                          current={sigs[emp.id]||null}
                          saving={sigSaving === emp.id}
                          onUpload={async b64 => { setSigSaving(emp.id); const ok = await saveSignature(emp.id, b64); setSigSaving(null); if (ok) { setSigs(s=>({...s,[emp.id]:b64})); showToast(`✓  Assinatura de ${emp.name} salva.`); } else { showToast(`❌  Erro ao salvar assinatura de ${emp.name}.`); } }}
                          onDelete={async () => { setSigSaving(emp.id); await deleteSignature(emp.id); setSigs(s=>{const c={...s};delete c[emp.id];return c;}); setSigSaving(null); showToast(`🗑️  Assinatura de ${emp.name} removida.`); }}
                          t={t}
                        />
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )
          ) : tab === "inadimplentes" ? (
            <><VindiAdminCard /><InadImportacao employees={employees} /><InadimplentesPanel user={null} isAdmin employees={employees} /></>
          ) : tab === "satisfacao" ? (
            <SatisfacaoAdminTab employees={employees} />
          ) : (
            // ── Departamentos tab ──────────────────────────────────
            departments.length === 0 ? (
              <div style={{ textAlign:"center", padding:80, background:t.card, borderRadius:18, border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:52, marginBottom:14 }}>🏢</div>
                <div style={{ fontSize:17, fontWeight:700, color:t.text, marginBottom:8 }}>Nenhum departamento cadastrado</div>
                <button onClick={()=>setModal({mode:"add",type:"dept"})} style={{ marginTop:8, padding:"10px 24px", background:"#6366f1", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>+ Criar primeiro departamento</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:12 }}>
                {departments.map((dept, i) => (
                  <div key={dept.id} style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:14, padding:"16px 18px", display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#6366f1,#0ea5e9)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>🏢</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:15, color:t.text }}>{dept.name}</div>
                      <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                        {tipos.filter(tp=>tp.department===dept.name).length} tipo(s) · {employees.filter(e=>e.department===dept.name).length} atendente(s)
                      </div>
                    </div>
                    <button onClick={()=>setModal({mode:"edit",type:"dept",dept})} style={{ background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:12, color:t.btnSecText, fontWeight:500, flexShrink:0 }}>✏️</button>
                    <button onClick={()=>{setConfirmId(dept.id);setConfirmType("dept");}} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#dc2626", fontWeight:500, flexShrink:0 }}>🗑️</button>
                  </div>
                ))}
                <div onClick={()=>setModal({mode:"add",type:"dept"})}
                  style={{ border:"2px dashed #22c55e", borderRadius:14, padding:"16px 18px", display:"flex", alignItems:"center", justifyContent:"center", gap:12, cursor:"pointer", background:"transparent", transition:"background 0.15s" }}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0fdf4"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                >
                  <div style={{ width:36, height:36, borderRadius:10, background:"#dcfce7", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, color:"#16a34a", fontWeight:700, flexShrink:0 }}>+</div>
                  <span style={{ fontWeight:600, fontSize:14, color:"#16a34a" }}>Novo Departamento</span>
                </div>
              </div>
            )
          )
        )}
      </div>

      <Toast msg={toast} />
      {modal?.type==="page" && <PageModal page={modal.page} employees={employees} departments={departments} onSave={savePage} onClose={()=>setModal(null)} />}
      {modal?.type==="emp"  && <EmployeeModal employee={modal.employee} departments={departments} onSave={saveEmployee} onClose={()=>setModal(null)} />}
      {modal?.type==="tipo" && <TipoModal tipo={modal.tipo} departments={departments} onSave={saveTipoFn} onClose={()=>setModal(null)} />}
      {modal?.type==="dept" && <DepartmentModal dept={modal.dept} onSave={saveDeptFn} onClose={()=>setModal(null)} />}
      {confirmId && confirmType==="page"     && <ConfirmDialog message={`A planilha "${pages.find(p=>p.id===confirmId)?.name}" e todos os seus registros serão excluídos permanentemente.`} onConfirm={deletePage}     onCancel={()=>{setConfirmId(null);setConfirmType(null);}} />}
      {confirmId && confirmType==="employee" && <ConfirmDialog message={`"${employees.find(e=>e.id===confirmId)?.name}" será removido. Os registros associados a ele não serão afetados.`}    onConfirm={deleteEmployee} onCancel={()=>{setConfirmId(null);setConfirmType(null);}} />}
      {confirmId && confirmType==="tipo"     && <ConfirmDialog message={`O tipo "${tipos.find(x=>x.id===confirmId)?.label}" será removido. Os registros existentes não serão afetados.`}      onConfirm={deleteTipo}     onCancel={()=>{setConfirmId(null);setConfirmType(null);}} />}
      {confirmId && confirmType==="dept"     && <ConfirmDialog message={`"${departments.find(d=>d.id===confirmId)?.name}" será removido. Tipos e atendentes vinculados não serão afetados.`}  onConfirm={deleteDept}     onCancel={()=>{setConfirmId(null);setConfirmType(null);}} />}
    </div>
  );
}

// ── Date Picker ───────────────────────────────────────────────────────

function DatePicker({ value, pageMonth, pageYear, onChange, inputStyle }) {
  const { t } = useTheme();
  const [open,   setOpen]   = useState(false);
  const [calPos, setCalPos] = useState({ top:0, left:0, width:0 });
  const triggerRef = useRef(null);
  const calRef     = useRef(null);

  const selectedDay = (() => { const m = (value||"").match(/^(\d+)/); return m ? +m[1] : null; })();
  const totalDays   = new Date(pageYear, pageMonth, 0).getDate();
  const firstWday   = new Date(pageYear, pageMonth - 1, 1).getDay();
  const td          = new Date();
  const todayDay    = td.getMonth()+1 === pageMonth && td.getFullYear() === pageYear ? td.getDate() : null;

  const openCal = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setCalPos({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handle = e => {
      if (triggerRef.current?.contains(e.target)) return;
      if (calRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const pick = d => { onChange(`${d} ${MONTHS_SHORT[pageMonth - 1]}`); setOpen(false); };

  const DAY_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  return (
    <>
      <div ref={triggerRef} onClick={openCal}
        style={{ ...inputStyle, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", userSelect:"none" }}
      >
        <span style={{ color: value ? inputStyle.color : t.textMuted }}>{value || "Selecionar data"}</span>
        <span style={{ fontSize:15, opacity:0.5 }}>📅</span>
      </div>

      {open && (
        <div ref={calRef} style={{ position:"fixed", top:calPos.top, left:calPos.left, width:Math.max(calPos.width, 256), background:t.card, border:`1px solid ${t.border}`, borderRadius:14, padding:"12px 10px 10px", zIndex:2000, boxShadow:"0 12px 32px rgba(0,0,0,0.28)", fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
          <div style={{ textAlign:"center", marginBottom:10, fontSize:13, fontWeight:700, color:t.text }}>
            {MONTHS[pageMonth - 1]} {pageYear}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
            {DAY_NAMES.map(d => (
              <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:t.textMuted, padding:"3px 0" }}>{d}</div>
            ))}
            {Array.from({ length: firstWday }).map((_,i) => <div key={`e${i}`} />)}
            {Array.from({ length: totalDays }, (_,i) => i+1).map(d => {
              const sel   = d === selectedDay;
              const today = d === todayDay;
              return (
                <button key={d} onClick={()=>pick(d)}
                  onMouseEnter={e=>{ if(!sel) e.currentTarget.style.background=t.rowHover; }}
                  onMouseLeave={e=>{ e.currentTarget.style.background=sel?"#6366f1":today?"#ede9fe":"transparent"; }}
                  style={{ background:sel?"#6366f1":today?"#ede9fe":"transparent", color:sel?"#fff":today?"#6d28d9":t.text, border:"none", borderRadius:8, padding:"7px 2px", cursor:"pointer", fontSize:13, fontWeight:sel||today?700:400, width:"100%" }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ── Record Modal ──────────────────────────────────────────────────────

function RecordModal({ record, employees, tipos=[], pageDepartment="Geral", pageMonth, pageYear, onSave, onClose, currentUser }) {
  const { t } = useTheme();
  const inp = INP(t);
  const sel = SEL(t);
  const bS  = { ...BTN_SEC(t), flex:1 };

  const isNew = !record?.id;
  const defaultAtendente = isNew ? (currentUser?.id || employees[0]?.id || "") : (record?.atendenteId || "");
  const tiposFiltrados = (() => {
    const atendDept = employees.find(e => e.id === (record?.atendenteId || defaultAtendente))?.department;
    const depts = new Set([pageDepartment, atendDept].filter(Boolean));
    const especificos = tipos.filter(tp => depts.has(tp.department));
    return especificos.length > 0 ? especificos : tipos.filter(tp => tp.department === "Geral");
  })();
  const defaultTipo = tiposFiltrados[0]?.label || "Outro";
  const [f, setF] = useState(record ? {...record} : { status:"Em atendimento", data:todayStr(), cliente:"", via:"Ticket", contato:"", tipo:defaultTipo, atendenteId:defaultAtendente, prioridade:false, descricao:"", agendamento:null });
  const set = k => v => setF(p=>({...p,[k]:v}));
  const ok = f.cliente.trim().length > 0;
  const setAg = k => v => setF(p=>({...p, agendamento:{...p.agendamento,[k]:v}}));
  const handleSave = () => {
    if (!ok) return;
    let data = {...f};
    if (data.agendamento && !data.agendamento.concluido && data.status !== "Resolvido") data.status = "Pendente";
    onSave(data);
  };

  return (
    <ModalShell
      title={record?.id ? "✏️  Editar Atendimento" : "➕  Novo Atendimento"}
      onClose={onClose}
      footer={<><button onClick={onClose} style={bS}>Cancelar</button><button onClick={handleSave} style={btnP(!ok)}>{record?.id?"Salvar Alterações":"Registrar Atendimento"}</button></>}
    >
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
        <Field label="Status">
          <select value={f.status} onChange={e=>set("status")(e.target.value)} style={sel}>
            {["Em atendimento","Resolvido","Pendente"].map(o=><option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Data">
          {pageMonth && pageYear
            ? <DatePicker value={f.data} pageMonth={pageMonth} pageYear={pageYear} onChange={set("data")} inputStyle={inp} />
            : <input value={f.data} onChange={e=>set("data")(e.target.value)} style={inp} placeholder={todayStr()} />
          }
        </Field>
      </div>
      <Field label="Nome do Cliente / Usuário *">
        <input value={f.cliente} onChange={e=>set("cliente")(e.target.value)} style={inp} placeholder="Nome completo..." />
      </Field>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
        <Field label="Atendente responsável">
          {isNew && currentUser ? (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:9, background:t.pageBg }}>
              <Avatar name={currentUser.name} color={currentUser.color||"#6366f1"} size={26} />
              <span style={{ fontSize:14, fontWeight:600, color:t.text }}>{currentUser.name}</span>
            </div>
          ) : (
            <select value={f.atendenteId} onChange={e=>set("atendenteId")(e.target.value)} style={sel}>
              <option value="">— Nenhum —</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Tipo">
          <select value={f.tipo} onChange={e=>set("tipo")(e.target.value)} style={sel}>
            {tiposFiltrados.length > 0
              ? tiposFiltrados.map(tp=><option key={tp.id} value={tp.label}>{tp.label}</option>)
              : <option value="Outro">Outro</option>
            }
          </select>
        </Field>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
        <Field label="1ª Via">
          <select value={f.via} onChange={e=>setF(p=>({...p, via:e.target.value, contato:""}))} style={sel}>
            {["Ticket","WhatsApp","Telefone","Telegram"].map(o=><option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label={f.via==="Ticket"?"Link / URL":f.via==="Telegram"?"Nome no Telegram":"Telefone"}>
          {f.via==="Ticket" ? (
            <input value={f.contato} onChange={e=>set("contato")(e.target.value)} style={inp} placeholder="https://..." />
          ) : f.via==="Telegram" ? (
            <input value={f.contato} onChange={e=>set("contato")(e.target.value)} style={inp} placeholder="Nome da pessoa no Telegram" />
          ) : (
            <input value={f.contato} onChange={e=>set("contato")(maskPhone(e.target.value))} onPaste={e=>{ e.preventDefault(); set("contato")(maskPhone(e.clipboardData.getData("text"))); }} style={inp} placeholder="(00) 00000-0000" type="tel" />
          )}
        </Field>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
        <Field label="2ª Via (opcional)">
          <select value={f.via2||""} onChange={e=>setF(p=>({...p, via2:e.target.value||undefined, contato2:""}))} style={sel}>
            <option value="">— Nenhuma —</option>
            {["Ticket","WhatsApp","Telefone","Telegram"].map(o=><option key={o}>{o}</option>)}
          </select>
        </Field>
        {f.via2 ? (
          <Field label={f.via2==="Ticket"?"Link / URL":f.via2==="Telegram"?"Nome no Telegram":"Telefone"}>
            {f.via2==="Ticket" ? (
              <input value={f.contato2||""} onChange={e=>set("contato2")(e.target.value)} style={inp} placeholder="https://..." />
            ) : f.via2==="Telegram" ? (
              <input value={f.contato2||""} onChange={e=>set("contato2")(e.target.value)} style={inp} placeholder="Nome da pessoa no Telegram" />
            ) : (
              <input value={f.contato2||""} onChange={e=>set("contato2")(maskPhone(e.target.value))} onPaste={e=>{e.preventDefault();set("contato2")(maskPhone(e.clipboardData.getData("text")));}} style={inp} placeholder="(00) 00000-0000" type="tel" />
            )}
          </Field>
        ) : <div />}
      </div>
      <Field label="Descrição">
        <textarea value={f.descricao} onChange={e=>set("descricao")(e.target.value)} rows={3} style={{ ...inp, resize:"vertical" }} placeholder="Detalhes do atendimento..." />
      </Field>
      <div style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={()=>set("prioridade")(!f.prioridade)}>
        <input type="checkbox" checked={f.prioridade} onChange={()=>{}} style={{ width:17, height:17, cursor:"pointer", accentColor:"#6366f1" }} />
        <span style={{ fontSize:14, color:t.textSub, fontWeight:500 }}>Marcar como prioritário</span>
      </div>
      <div style={{ borderTop:`1px solid ${t.border}`, marginTop:16, paddingTop:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", marginBottom:f.agendamento?14:0 }}
          onClick={()=>set("agendamento")(f.agendamento ? null : { titulo:"", dataHora:"", descricao:"", concluido:false })}>
          <input type="checkbox" checked={!!f.agendamento} onChange={()=>{}} style={{ width:17, height:17, cursor:"pointer", accentColor:"#f59e0b" }} />
          <span style={{ fontSize:14, color:t.textSub, fontWeight:500 }}>📅 Adicionar compromisso</span>
        </div>
        {f.agendamento && (
          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
              <Field label="Título do compromisso">
                <input value={f.agendamento.titulo} onChange={e=>setAg("titulo")(e.target.value)} style={inp} placeholder="Ex: Retorno ao cliente..." />
              </Field>
              <Field label="Data e hora">
                <input type="datetime-local" value={f.agendamento.dataHora} onChange={e=>setAg("dataHora")(e.target.value)} style={inp} />
              </Field>
            </div>
            <Field label="Observação (opcional)">
              <input value={f.agendamento.descricao} onChange={e=>setAg("descricao")(e.target.value)} style={inp} placeholder="Detalhes do compromisso..." />
            </Field>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── Agenda Modal ─────────────────────────────────────────────────────

// Avisa (som + janela) quando um compromisso está a 5 minutos de acontecer.
// Usado pela planilha de atendimentos e pelo Controle de Inadimplentes.
function useCompromissoAlerta(itens) {
  const [alerta, setAlerta] = useState(null);
  const avisados = useRef(new Set());
  useEffect(() => {
    const check = () => {
      const now = new Date();
      itens.forEach(r => {
        if (!r.agendamento || r.agendamento.concluido || avisados.current.has(r.id)) return;
        const diff = (new Date(r.agendamento.dataHora) - now) / 60000;
        if (diff >= 0 && diff <= 5) { avisados.current.add(r.id); setAlerta(r); playBeep(); }
      });
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [itens]);
  return [alerta, setAlerta];
}

function CompromissoAlerta({ item, nome, subtitulo, onDispensar, onVer }) {
  return (
    <Overlay z={1200}>
      <div style={{ background:"#fff", borderRadius:20, padding:"28px 32px", maxWidth:400, width:"90%", boxShadow:"0 20px 50px rgba(0,0,0,0.3)", ...FF }}>
        <div style={{ fontSize:38, textAlign:"center", marginBottom:10 }}>⏰</div>
        <h3 style={{ margin:"0 0 4px", fontSize:17, fontWeight:700, color:"#1e293b", textAlign:"center" }}>Compromisso em 5 minutos!</h3>
        <p style={{ margin:"0 0 16px", fontSize:13, color:"#64748b", textAlign:"center" }}>Verifique os detalhes abaixo</p>
        <div style={{ background:"#fefce8", border:"1px solid #fde68a", borderRadius:10, padding:"12px 14px", marginBottom:12, fontSize:13 }}>
          <div style={{ fontWeight:700, color:"#92400e", marginBottom:4 }}>📅 {item.agendamento.titulo}</div>
          {item.agendamento.dataHora && <div style={{ color:"#78350f", marginBottom:4 }}>🕐 {new Date(item.agendamento.dataHora).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>}
          {item.agendamento.descricao && <div style={{ color:"#92400e" }}>📝 {item.agendamento.descricao}</div>}
        </div>
        <div style={{ background:"#f1f5f9", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#475569", marginBottom:20 }}>
          <div style={{ fontWeight:600, marginBottom:2 }}>{nome}</div>
          <div>{subtitulo}</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onDispensar} style={{ flex:1, padding:"10px 0", background:"#f1f5f9", border:"none", borderRadius:10, color:"#475569", fontWeight:600, cursor:"pointer", ...FF }}>Dispensar</button>
          <button onClick={onVer} style={{ flex:2, padding:"10px 0", background:"#f59e0b", border:"none", borderRadius:8, color:"#fff", fontWeight:600, cursor:"pointer", ...FF }}>Ver compromisso</button>
        </div>
      </div>
    </Overlay>
  );
}

function AgendaModal({ record, onSave, onClose, nome, subtitulo }) {
  const { t } = useTheme();
  const inp = INP(t);
  const bS  = BTN_SEC(t);
  const ag  = record.agendamento || {};
  const [titulo,    setTitulo]    = useState(ag.titulo    || "");
  const [dataHora,  setDataHora]  = useState(ag.dataHora  || "");
  const [descricao, setDescricao] = useState(ag.descricao || "");
  const fmtDH = dh => dh ? new Date(dh).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";

  const save     = () => onSave({...record, agendamento:{titulo,dataHora,descricao,concluido:false}, status:"Pendente"});
  const complete = () => onSave({...record, agendamento:{...ag,titulo,dataHora,descricao,concluido:true}, status:"Em atendimento"});
  const remove   = () => onSave({...record, agendamento:null});

  return (
    <ModalShell title="📅  Compromisso" onClose={onClose}
      footer={
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={onClose} style={bS}>Fechar</button>
          {!ag.concluido && <button onClick={complete} style={{ padding:"10px 18px", background:"#16a34a", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer", ...FF }}>Concluir</button>}
          <button onClick={save} style={btnP(false)}>Salvar</button>
        </div>
      }
    >
      <div style={{ background:t.pageBg, borderRadius:12, padding:"12px 16px", marginBottom:16, fontSize:13 }}>
        <div style={{ fontWeight:700, color:t.text, marginBottom:3 }}>{nome ?? record.cliente}</div>
        <div style={{ color:t.textMuted }}>{subtitulo ?? `Via ${record.via} · ${record.tipo} · ${record.data}`}</div>
        {ag.concluido && <div style={{ marginTop:6, color:"#16a34a", fontWeight:600, fontSize:12 }}>✅ Compromisso concluído</div>}
      </div>
      <Field label="Título do compromisso">
        <input value={titulo} onChange={e=>setTitulo(e.target.value)} style={inp} placeholder="Ex: Retorno ao cliente..." />
      </Field>
      <Field label="Data e hora">
        <input type="datetime-local" value={dataHora} onChange={e=>setDataHora(e.target.value)} style={inp} />
      </Field>
      <Field label="Observação (opcional)">
        <input value={descricao} onChange={e=>setDescricao(e.target.value)} style={inp} placeholder="Detalhes do compromisso..." />
      </Field>
      <button onClick={remove} style={{ background:"none", border:"1px solid #fecaca", color:"#dc2626", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:12, marginTop:8, ...FF }}>🗑️ Remover compromisso</button>
    </ModalShell>
  );
}

// ── Presence Bar ─────────────────────────────────────────────────────

const WORK_END = { hour: 18, minute: 30 }; // seg-sex encerra às 18:30

function PresenceBar({ employees }) {
  const { t } = useTheme();
  const [open,     setOpen]     = useState(false);
  const [presence, setPresence] = useState({}); // { [uid]: "online"|"away" }

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "presence"), snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data().status || "online"; });
      setPresence(map);
    });
    return () => unsub();
  }, []);

  const statusOrder = { online: 0, away: 1 };
  const sorted = [...employees].sort((a, b) => {
    const sa = statusOrder[presence[a.id]] ?? 2;
    const sb = statusOrder[presence[b.id]] ?? 2;
    return sa - sb;
  });

  const dotColor = id => presence[id] === "online" ? "#22c55e" : presence[id] === "away" ? "#f97316" : "#94a3b8";
  const onlineCount = employees.filter(e => presence[e.id] === "online").length;
  const awayCount   = employees.filter(e => presence[e.id] === "away").length;

  return (
    <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:14, marginBottom:18, overflow:"hidden" }}>
      <div onClick={()=>setOpen(v=>!v)} style={{ padding:"12px 18px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", userSelect:"none" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:14, fontWeight:700, color:t.text }}>👥 Equipe</span>
          {onlineCount > 0 && <span style={{ background:"#dcfce7", color:"#16a34a", fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20 }}>{onlineCount} online</span>}
          {awayCount   > 0 && <span style={{ background:"#fff7ed", color:"#c2410c", fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20 }}>{awayCount} ausente</span>}
        </div>
        <span style={{ color:t.textMuted, fontSize:11 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding:"0 18px 14px", display:"flex", flexWrap:"wrap", gap:8 }}>
          {sorted.map(emp => (
            <div key={emp.id} style={{ display:"flex", alignItems:"center", gap:8, background:t.pageBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"7px 12px" }}>
              <div style={{ position:"relative" }}>
                <Avatar name={emp.name} color={emp.color} size={26} />
                <div style={{ position:"absolute", bottom:0, right:0, width:9, height:9, borderRadius:"50%", background:dotColor(emp.id), border:`2px solid ${t.card}` }} />
              </div>
              <span style={{ fontSize:13, fontWeight:500, color:t.text }}>{emp.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Satisfação — Employee view ────────────────────────────────────────

function SatisfacaoView({ user, onBack }) {
  const { t, dark } = useTheme();
  const [importacoes, setImportacoes] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [periodo,     setPeriodo]     = useState("30d");
  const [detalhe,     setDetalhe]     = useState(null);

  const MN = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  useEffect(() => {
    loadSatImportacoes().then(imps => { setImportacoes(imps); setLoading(false); });
  }, []);

  const now = new Date();
  const fim = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let inicio;
  if (periodo === "7d")       inicio = new Date(now.getTime() - 6 * 86400000);
  else if (periodo === "30d") inicio = new Date(now.getTime() - 29 * 86400000);
  else if (periodo === "90d") inicio = new Date(now.getTime() - 89 * 86400000);
  else                        inicio = new Date(now.getFullYear(), 0, 1);

  const m = !loading && importacoes.length ? satCalcMetricas(importacoes, user.id, inicio, fim) : null;

  const scoreColor = v => {
    if (v === null || v === undefined) return t.textMuted;
    if (v >= 4.5) return "#22c55e";
    if (v >= 4.0) return "#4ade80";
    if (v >= 3.5) return "#facc15";
    if (v >= 3.0) return "#fb923c";
    return "#ef4444";
  };
  const scoreLabel = v => {
    if (v === null || v === undefined) return "";
    if (v >= 4.5) return "Excelente";
    if (v >= 4.0) return "Bom";
    if (v >= 3.5) return "Regular";
    if (v >= 3.0) return "Baixo";
    return "Crítico";
  };

  const DIST_LABELS = ["Muito Satisfeito","Satisfeito","Indiferente","Insatisfeito","Muito Insatisfeito"];
  const DIST_KEYS   = ["muitoSatisfeito","satisfeito","indiferente","insatisfeito","muitoInsatisfeito"];
  const DIST_COLORS = ["#22c55e","#86efac","#94a3b8","#fb923c","#ef4444"];

  const hist = m?.hist || [];
  const W = 560, H = 100, PAD = 18;
  const histPoints = hist.length >= 2 ? (() => {
    const vals = hist.map(h => h.media);
    const minV = Math.max(0, Math.min(...vals) - 0.3);
    const maxV = Math.min(5, Math.max(...vals) + 0.3);
    const scaleX = i => PAD + (i / (hist.length - 1)) * (W - PAD * 2);
    const scaleY = v => PAD + (1 - (v - minV) / (maxV - minV || 1)) * (H - PAD * 2);
    const yRef = scaleY(4);
    return { pts: hist.map((h, i) => ({ x: scaleX(i), y: scaleY(h.media), ...h })), yRef, minV, maxV };
  })() : null;

  return (
    <div style={{ minHeight:"100vh", background:t.pageBg, ...FF }}>
      <div style={{ background:t.header, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 12px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", color:"#94a3b8", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:13, ...FF }}>← Voltar</button>
          <span style={{ color:"#f8fafc", fontWeight:800, fontSize:16 }}>⭐ Satisfação dos Clientes</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <DarkToggle />
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Avatar name={user.name} color={user.color||"#6366f1"} size={28} />
            <span style={{ color:"#cbd5e1", fontWeight:500, fontSize:13 }}>{user.name}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"28px 24px 60px" }}>
        <div style={{ display:"flex", gap:6, marginBottom:28, flexWrap:"wrap" }}>
          {[["7d","7 dias"],["30d","30 dias"],["90d","90 dias"],["ano","Este ano"]].map(([k, l]) => (
            <button key={k} onClick={() => setPeriodo(k)}
              style={{ padding:"7px 16px", borderRadius:8, border:`1px solid ${periodo===k?"#6366f1":t.border}`, background:periodo===k?"#6366f1":"transparent", color:periodo===k?"#fff":t.textSub, fontWeight:600, fontSize:13, cursor:"pointer", ...FF }}>
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign:"center", padding:80, color:t.textMuted }}>Carregando...</div>
        ) : !m || m.totalEnviadas === 0 ? (
          <div style={{ textAlign:"center", padding:80, background:t.card, borderRadius:18, border:`1px solid ${t.border}` }}>
            <div style={{ fontSize:52, marginBottom:14 }}>📊</div>
            <div style={{ fontSize:17, fontWeight:700, color:t.text, marginBottom:8 }}>Ainda não existem avaliações neste período</div>
            <div style={{ fontSize:13, color:t.textMuted }}>Os dados de satisfação são importados mensalmente pelo administrador.</div>
          </div>
        ) : (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:14, marginBottom:22 }}>
              {[
                { icon:"⭐", label:"Satisfação Geral",    value:m.geral !== null ? m.geral.toFixed(1) : "—",         sub:m.geral !== null ? scoreLabel(m.geral) : "",              color:scoreColor(m.geral) },
                { icon:"💬", label:"Avaliações recebidas", value:m.totalRespostas,                                    sub:`de ${m.totalEnviadas} enviadas`,                         color:t.text },
                { icon:"📈", label:"% Satisfeito ou mais",value:m.pctPos !== null ? m.pctPos + "%" : "—",            sub:"Satisfeito + Muito Satisfeito",                          color:m.pctPos!==null&&m.pctPos>=75?"#22c55e":m.pctPos!==null&&m.pctPos>=50?"#facc15":"#ef4444" },
                { icon:"📩", label:"Taxa de resposta",     value:m.totalEnviadas>0 ? m.taxaResposta + "%" : "—",     sub:"Respondidas / total enviadas",                           color:t.text },
              ].map(({ icon, label, value, sub, color }) => (
                <div key={label} style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:14, padding:"18px 20px" }}>
                  <div style={{ fontSize:12, color:t.textMuted, fontWeight:500, marginBottom:8 }}>{icon} {label}</div>
                  <div style={{ fontSize:28, fontWeight:800, color, lineHeight:1 }}>{value}</div>
                  {sub && <div style={{ fontSize:11, color:t.textMuted, marginTop:5 }}>{sub}</div>}
                </div>
              ))}
            </div>

            {m.totalRespostas < SAT_AMOSTRAGEM_MIN && (
              <div style={{ marginBottom:18, padding:"10px 16px", background:"#fef3c7", border:"1px solid #fde68a", borderRadius:10, fontSize:12, color:"#92400e", fontWeight:500 }}>
                ⚠️ Amostragem pequena ({m.totalRespostas} avaliações). Os indicadores podem não ser representativos.
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:18 }}>
              <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:14, padding:"20px 22px" }}>
                <div style={{ fontWeight:700, fontSize:14, color:t.text, marginBottom:16 }}>Indicadores</div>
                {[
                  { label:"Satisfação com o Atendimento", ind:m.at },
                  { label:"Necessidades Supridas",         ind:m.nec },
                  { label:"Satisfação com o Sistema",      ind:m.sis },
                ].map(({ label, ind }) => (
                  <div key={label} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                      <span style={{ fontSize:13, color:t.text, fontWeight:500 }}>{label}</span>
                      <span style={{ fontSize:14, fontWeight:700, color:scoreColor(ind?.media ?? null) }}>
                        {ind ? ind.media.toFixed(1) : "—"}
                        {ind && <span style={{ fontSize:11, color:t.textMuted, fontWeight:400, marginLeft:4 }}>({ind.pctPos}%)</span>}
                      </span>
                    </div>
                    <div style={{ height:7, background:dark?"#334155":"#e2e8f0", borderRadius:99, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:ind ? `${(ind.media/5)*100}%` : "0%", background:scoreColor(ind?.media ?? null), borderRadius:99, transition:"width 0.5s" }} />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:14, padding:"20px 22px" }}>
                <div style={{ fontWeight:700, fontSize:14, color:t.text, marginBottom:16 }}>Distribuição de notas</div>
                {(() => {
                  const total = Object.values(m.dist).reduce((a, b) => a + b, 0);
                  if (!total) return <div style={{ color:t.textMuted, fontSize:13 }}>Sem dados</div>;
                  return DIST_LABELS.map((label, i) => {
                    const key = DIST_KEYS[i];
                    const val = m.dist[key] || 0;
                    const pct = Math.round(val / total * 100);
                    return (
                      <div key={key} style={{ marginBottom:9 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:12, color:t.text }}>{label}</span>
                          <span style={{ fontSize:12, fontWeight:600, color:t.text }}>{val} <span style={{ color:t.textMuted, fontWeight:400 }}>({pct}%)</span></span>
                        </div>
                        <div style={{ height:6, background:dark?"#334155":"#e2e8f0", borderRadius:99, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:DIST_COLORS[i], borderRadius:99, transition:"width 0.5s" }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {histPoints && (
              <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:14, padding:"20px 22px", marginBottom:18 }}>
                <div style={{ fontWeight:700, fontSize:14, color:t.text, marginBottom:12 }}>Evolução — últimos 12 meses</div>
                <div style={{ overflowX:"auto" }}>
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:100 }}>
                    <defs>
                      <linearGradient id="sat-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {histPoints.minV < 4 && histPoints.maxV >= 4 && (
                      <line x1={PAD} y1={histPoints.yRef} x2={W-PAD} y2={histPoints.yRef} stroke="#22c55e" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
                    )}
                    <path d={`M ${histPoints.pts[0].x} ${H} ${histPoints.pts.map(p=>`L ${p.x} ${p.y}`).join(" ")} L ${histPoints.pts[histPoints.pts.length-1].x} ${H} Z`} fill="url(#sat-grad)" />
                    <path d={`M ${histPoints.pts[0].x} ${histPoints.pts[0].y} ${histPoints.pts.slice(1).map(p=>`L ${p.x} ${p.y}`).join(" ")}`} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {histPoints.pts.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r={3.5} fill="#6366f1" />
                        <text x={p.x} y={p.y - 7}  textAnchor="middle" fontSize={8}   fill={dark?"#a5b4fc":"#4f46e5"} fontWeight="600">{p.media}</text>
                        <text x={p.x} y={H - 2}    textAnchor="middle" fontSize={8.5} fill={t.textMuted}>{p.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            )}

            {m.respostas.length > 0 && (
              <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:14, overflow:"hidden" }}>
                <div style={{ padding:"16px 22px", borderBottom:`1px solid ${t.border}`, fontWeight:700, fontSize:14, color:t.text }}>
                  Respostas individuais ({m.respostas.length})
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", minWidth:520 }}>
                    <thead>
                      <tr style={{ background:dark?"#172032":"#f8fafc" }}>
                        {["Data","Cliente","Atend.","Nec.","Sist.","Geral",""].map((h, i) => (
                          <th key={i} style={{ padding:"9px 14px", textAlign:i>=2&&i<=5?"center":"left", fontSize:12, color:t.textMuted, fontWeight:600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.respostas.map((r, i) => (
                        <tr key={i} style={{ borderTop:`1px solid ${t.border}` }}>
                          <td style={{ padding:"9px 14px", fontSize:12, color:t.textMuted }}>{r.data ? new Date(r.data).toLocaleDateString("pt-BR") : "—"}</td>
                          <td style={{ padding:"9px 14px", fontSize:13, color:t.text, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.cliente || "—"}</td>
                          <td style={{ padding:"9px 14px", textAlign:"center", fontSize:13, fontWeight:600, color:scoreColor(r.atendimento)  }}>{r.atendimento  ?? "—"}</td>
                          <td style={{ padding:"9px 14px", textAlign:"center", fontSize:13, fontWeight:600, color:scoreColor(r.necessidades) }}>{r.necessidades ?? "—"}</td>
                          <td style={{ padding:"9px 14px", textAlign:"center", fontSize:13, fontWeight:600, color:scoreColor(r.sistema)      }}>{r.sistema      ?? "—"}</td>
                          <td style={{ padding:"9px 14px", textAlign:"center" }}>
                            <span style={{ padding:"2px 10px", background:scoreColor(r.mediaGeral)+"22", border:`1px solid ${scoreColor(r.mediaGeral)}44`, borderRadius:20, fontSize:13, fontWeight:700, color:scoreColor(r.mediaGeral) }}>
                              {r.mediaGeral?.toFixed(1) ?? "—"}
                            </span>
                          </td>
                          <td style={{ padding:"9px 14px" }}>
                            {r.comentario && (
                              <button onClick={() => setDetalhe(r)}
                                style={{ padding:"3px 9px", background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:6, cursor:"pointer", fontSize:11, color:t.btnSecText, ...FF }}>
                                Ver
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {detalhe && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={e => { if (e.target === e.currentTarget) setDetalhe(null); }}>
          <div style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:18, padding:28, maxWidth:460, width:"100%", maxHeight:"80vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
              <h3 style={{ margin:0, fontWeight:700, fontSize:16, color:t.text }}>Detalhes da avaliação</h3>
              <button onClick={() => setDetalhe(null)} style={{ background:"transparent", border:"none", fontSize:22, cursor:"pointer", color:t.textMuted, padding:"0 4px", lineHeight:1 }}>×</button>
            </div>
            {[
              { label:"Data",         value:detalhe.data ? new Date(detalhe.data).toLocaleDateString("pt-BR") : "—" },
              { label:"Cliente",      value:detalhe.cliente    || "—" },
              { label:"Protocolo",    value:detalhe.protocolo  || "—" },
              { label:"Atendimento",  value:detalhe.atendimento  ?? "—" },
              { label:"Necessidades", value:detalhe.necessidades ?? "—" },
              { label:"Sistema",      value:detalhe.sistema      ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${t.border}` }}>
                <span style={{ fontSize:13, color:t.textMuted }}>{label}</span>
                <span style={{ fontSize:13, fontWeight:600, color:t.text }}>{value}</span>
              </div>
            ))}
            {detalhe.comentario && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:t.textMuted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>Comentário</div>
                <div style={{ fontSize:14, color:t.text, lineHeight:1.6, padding:"10px 14px", background:dark?"#0f172a":"#f8fafc", borderRadius:8, border:`1px solid ${t.border}` }}>
                  {detalhe.comentario}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Controle de Inadimplentes ────────────────────────────────────────

const INAD_STATUS_CFG = {
  "Inadimplente": { bar:"#f97316", bg:"#ffedd5", text:"#c2410c", darkBg:"rgba(249,115,22,0.14)",  darkText:"#fb923c", darkBorder:"rgba(249,115,22,0.25)" },
  "Cancelado":    { bar:"#ef4444", bg:"#fee2e2", text:"#b91c1c", darkBg:"rgba(239,68,68,0.14)",   darkText:"#f87171", darkBorder:"rgba(239,68,68,0.25)" },
  "Regularizado": { bar:"#22c55e", bg:"#dcfce7", text:"#15803d", darkBg:"rgba(34,197,94,0.12)",   darkText:"#4ade80", darkBorder:"rgba(34,197,94,0.22)" },
  "Quitado":      { bar:"#6366f1", bg:"#e0e7ff", text:"#4338ca", darkBg:"rgba(99,102,241,0.14)",  darkText:"#a5b4fc", darkBorder:"rgba(99,102,241,0.28)" },
};
const fmtDataBR = iso => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
const INAD_FKEY = "inad_filters";

function InadStatusBadge({ status }) {
  const { dark } = useTheme();
  const c = INAD_STATUS_CFG[status] || INAD_STATUS_CFG.Cancelado;
  return <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:dark?c.darkBg:c.bg, color:dark?c.darkText:c.text, border:`1px solid ${dark?c.darkBorder:"transparent"}`, padding:"3px 10px 3px 7px", borderRadius:20, fontSize:11.5, fontWeight:600, whiteSpace:"nowrap" }}><span style={{ width:6, height:6, borderRadius:"50%", background:c.bar }} />{status}</span>;
}

// Parcelas como "quadradinhos": verde = paga, azul = paga em atraso, laranja = atrasada (vencida e não paga),
// cinza = ainda não gerada (ou gerada mas ainda não vencida). Ver inadSituacaoParcelas.
const SITUACAO_PARCELA = {
  paga:      { cor:"#22c55e", rotulo: p => `paga${p.antecipada ? " antecipadamente" : ""}${p.pagoEm ? " em " + fmtDataBR(p.pagoEm) : ""}${p.antecipada && p.vencimento ? " (vencimento " + fmtDataBR(p.vencimento) + ")" : ""}` },
  pagaAtraso:{ cor:"#3b82f6", rotulo: p => `paga em atraso · vencimento original ${fmtDataBR(p.vencimento)} · pago em ${fmtDataBR(p.pagoEm)} · ${p.diasAtraso} ${p.diasAtraso === 1 ? "dia" : "dias"} de atraso` },
  vencida:   { cor:"#f97316", rotulo: p => `atrasada (venceu em ${fmtDataBR(p.vencimento)}${p.prorrogadaPara ? "; prorrogada na Vindi para " + fmtDataBR(p.prorrogadaPara) : ""})${p.canceladaNaVindi ? " — em aberto no cancelamento" : ""}` },
  aVencer:   { cor:"#cbd5e1", rotulo: p => `gerada, ${p.vencimento ? "vence em " + fmtDataBR(p.vencimento) : "ainda não vencida"}` },
  naoGerada: { cor:"#cbd5e1", rotulo: () => "ainda não gerada" },
  naoPaga:   { cor:"#cbd5e1", rotulo: () => "não paga — sincronize com a Vindi para saber se está atrasada" },
};
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
function InadParcelasMini({ reg, size=7 }) {
  return (
    <div style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
      {inadSituacaoParcelas(reg, hojeLocal()).map(p => { const s = SITUACAO_PARCELA[p.situacao]; return <span key={p.n} title={`Parcela ${p.n}${p.total ? " de " + p.total : ""}: ${s.rotulo(p)}`} style={{ width:size, height:size, borderRadius:2, background:s.cor }} />; })}
    </div>
  );
}

const SireneIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="19.78" y1="4.22" x2="18.36" y2="5.64"/>
    <line x1="1.5" y1="10" x2="3.5" y2="10"/><line x1="20.5" y1="10" x2="22.5" y2="10"/>
    <path d="M7 18h10l1 3H6l1-3z"/><path d="M8 18V9.5a4 4 0 0 1 8 0V18"/><path d="M10 13h1.5"/>
  </svg>
);
const AlertaIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
const EditarIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const ExcluirIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;

function InadRow({ r, employees, perms, onAbrir, onImportante, onAgenda, onEditar, onExcluir }) {
  const { t, dark } = useTheme();
  const [hover, setHover] = useState(false);
  const cfg = INAD_STATUS_CFG[r.status] || INAD_STATUS_CFG.Cancelado;
  const s = inadResumoParcelas(r);
  const tempo = inadTempo(r.dataInadimplencia);
  const ativo = r.status === "Inadimplente";
  const bg = dark ? (hover ? "#1c3048" : (r.prioridade ? "#1d1f13" : "#1e293b")) : (hover ? "#f6f9fc" : (r.prioridade ? "#fff8f1" : "#fff"));
  const stop = fn => e => { e.stopPropagation(); fn(); };
  return (
    <div onClick={onAbrir} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{ position:"relative", display:"flex", alignItems:"stretch", flexWrap:"wrap", background:bg, borderRadius:10, border:`1px solid ${dark?"rgba(255,255,255,0.07)":"#e8edf2"}`, overflow:"hidden", cursor:"pointer", transition:"background 0.12s, box-shadow 0.12s", boxShadow:hover?(dark?"0 2px 14px rgba(0,0,0,0.35)":"0 2px 10px rgba(0,0,0,0.07)"):"none", ...FF }}>
      <div style={{ width:4, alignSelf:"stretch", background:cfg.bar, flexShrink:0 }} />

      {/* Cliente */}
      <div style={{ flex:"1 1 260px", minWidth:0, padding:"11px 16px", display:"flex", flexDirection:"column", justifyContent:"center", gap:4 }}>
        <div style={{ fontWeight:600, fontSize:13.5, color:t.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.nome}</div>
        <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap", fontSize:11, color:t.textMuted }}>
          {r.numero && <><span style={{ fontVariantNumeric:"tabular-nums" }}>#{r.numero}</span><Sep dark={dark} /></>}
          {r.programa && <><span>{r.programa}{r.copias ? ` · ${r.copias} cópia${r.copias>1?"s":""}` : ""}</span><Sep dark={dark} /></>}
          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:220 }}>{r.email || "sem e-mail"}</span>
        </div>
      </div>

      {/* Inadimplência */}
      <div style={{ flex:"0 0 170px", padding:"11px 16px", display:"flex", flexDirection:"column", justifyContent:"center", gap:3 }}>
        <span style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:0.4 }}>Inadimplente desde</span>
        <span style={{ fontSize:13, color:t.text, fontWeight:600 }}>{fmtDataBR(r.dataInadimplencia)}</span>
        {tempo && <span style={{ fontSize:11, fontWeight:600, color: ativo && tempo.maisDeUmMes ? "#ef4444" : t.textMuted }}>{inadTempoTexto(tempo)}</span>}
      </div>

      {/* Parcelas */}
      <div style={{ flex:"0 0 190px", padding:"11px 16px", display:"flex", flexDirection:"column", justifyContent:"center", gap:4 }}>
        <span style={{ fontSize:12.5, color:t.text, whiteSpace:"nowrap" }}><b>{s.naoPagas}</b> pendente{s.naoPagas!==1?"s":""} <span style={{ color:t.textMuted }}>· {s.pagas}/{s.total} pagas</span></span>
        <InadParcelasMini reg={r} />
      </div>

      {/* Valor + responsável */}
      <div style={{ flex:"0 0 150px", padding:"11px 16px", display:"flex", flexDirection:"column", justifyContent:"center", gap:4 }}>
        <span style={{ fontSize:14, fontWeight:800, color: ativo ? (dark?"#f87171":"#b91c1c") : t.textMuted }}>{r.valorAReceber != null ? gcFmtBRL(r.valorAReceber) : "—"}</span>
      </div>

      {/* Status + ações */}
      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 13px", flexShrink:0, marginLeft:"auto" }}>
        <InadStatusBadge status={r.status} />
        <IconBtn title={r.prioridade?"Remover de importantes":"Marcar como importante"} active={!!r.prioridade} activeColor="#f97316" onClick={stop(onImportante)} dark={dark} t={t}><SireneIcon /></IconBtn>
        {r.agendamento && !r.agendamento.concluido && (
          <IconBtn title={r.agendamento.titulo || "Compromisso"} active activeColor="#f59e0b" onClick={stop(onAgenda)} dark={dark} t={t}><AlertaIcon /></IconBtn>
        )}
        {perms.editar  && <IconBtn title="Editar" onClick={stop(onEditar)} dark={dark} t={t}><EditarIcon /></IconBtn>}
        {perms.excluir && <IconBtn title="Excluir" danger onClick={stop(onExcluir)} dark={dark} t={t}><ExcluirIcon /></IconBtn>}
      </div>
    </div>
  );
}

// Formulário de cadastro/edição manual.
function InadFormModal({ reg, employees, podeStatus, onSave, onClose }) {
  const { t } = useTheme();
  const inp = INP(t), sel = SEL(t), bS = { ...BTN_SEC(t), flex:1 };
  const editing = !!reg;
  const [f, setF] = useState(() => ({
    nome: reg?.nome || "", email: reg?.email || "", programa: reg?.programa || "", serie: reg?.serie || "",
    copias: reg?.copias ?? "", numero: reg?.numero || "", idFatura: reg?.idFatura || "",
    dataInadimplencia: reg?.dataInadimplencia || new Date().toISOString().slice(0, 10),
    numParcelas: reg?.numParcelas ?? 12, pagas: (reg?.parcelas||[]).filter(p=>p.paga).map(p=>p.n),
    valorAReceber: reg?.valorAReceber != null ? gcFmtBRL(reg.valorAReceber) : "",
    status: reg?.status || "Inadimplente", responsavelId: reg?.responsavelId || "", vindiUrl: reg?.vindiUrl || "",
  }));
  const [erro, setErro] = useState("");
  const set = k => v => { setF(p => ({ ...p, [k]: v })); setErro(""); };
  const togglePaga = n => setF(p => ({ ...p, pagas: p.pagas.includes(n) ? p.pagas.filter(x=>x!==n) : [...p.pagas, n] }));
  const total = Math.max(0, Math.min(60, parseInt(f.numParcelas) || 0));

  const submit = () => {
    if (!f.nome.trim()) return setErro("O nome do cliente é obrigatório.");
    if (f.vindiUrl.trim() && !inadVindiValido(f.vindiUrl)) return setErro("O link da Vindi precisa começar com https:// e ser do domínio vindi.com.br.");
    const antigas = Object.fromEntries((reg?.parcelas||[]).map(p => [p.n, p]));
    const parcelas = Array.from({ length: total }, (_, i) => {
      const n = i + 1, paga = f.pagas.includes(n);
      return { n, paga, dataPagamento: paga ? (antigas[n]?.paga ? antigas[n].dataPagamento ?? null : null) : null };
    });
    onSave({
      nome: f.nome.trim(), email: f.email.trim(), programa: f.programa.trim(), serie: f.serie.trim(),
      copias: f.copias === "" ? null : Number(f.copias), numero: String(f.numero).trim(), idFatura: String(f.idFatura).trim(),
      dataInadimplencia: f.dataInadimplencia || null, numParcelas: total, parcelas,
      valorAReceber: f.valorAReceber ? Number(gcParseBRL(f.valorAReceber)) : null,
      status: f.status, responsavelId: f.responsavelId || null, vindiUrl: f.vindiUrl.trim(),
    });
  };

  const grid2 = { display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:"0 16px" };
  return (
    <ModalShell title={editing ? "✏️  Editar inadimplente" : "➕  Novo inadimplente"} onClose={onClose} maxWidth={620}
      footer={<><button onClick={onClose} style={bS}>Cancelar</button><button onClick={submit} style={btnP(false)}>{editing ? "Salvar Alterações" : "Cadastrar"}</button></>}>
      <Field label="Nome do cliente *"><input value={f.nome} onChange={e=>set("nome")(e.target.value)} style={inp} autoFocus /></Field>
      <div style={grid2}>
        <Field label="E-mail"><input value={f.email} onChange={e=>set("email")(e.target.value)} style={inp} type="email" /></Field>
        <Field label="Sistema contratado"><input value={f.programa} onChange={e=>set("programa")(e.target.value)} style={inp} placeholder="Ex.: Previus" /></Field>
        <Field label="Nº Série"><input value={f.serie} onChange={e=>set("serie")(e.target.value)} style={inp} /></Field>
        <Field label="Nº de cópias"><input value={f.copias} onChange={e=>set("copias")(e.target.value.replace(/\D/g,""))} style={inp} inputMode="numeric" /></Field>
        <Field label="Nº (identificação)"><input value={f.numero} onChange={e=>set("numero")(e.target.value)} style={inp} /></Field>
        <Field label="IDFatura / IDAssinatura"><input value={f.idFatura} onChange={e=>set("idFatura")(e.target.value)} style={inp} /></Field>
        <Field label="Data de inadimplência"><input type="date" value={f.dataInadimplencia||""} onChange={e=>set("dataInadimplencia")(e.target.value)} style={inp} /></Field>
        <Field label="Valor em aberto"><input value={f.valorAReceber} onChange={e=>set("valorAReceber")(gcFmtBRLLive(e.target.value))} style={inp} placeholder="R$ 0,00" /></Field>
        <Field label="Status">
          <select value={f.status} onChange={e=>set("status")(e.target.value)} style={sel} disabled={!podeStatus}>
            {INAD_STATUS.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Colaborador responsável">
          <select value={f.responsavelId} onChange={e=>set("responsavelId")(e.target.value)} style={sel}>
            <option value="">— Sem responsável —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label={`Parcelas (${total}) — marque as pagas`}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
          <input value={f.numParcelas} onChange={e=>set("numParcelas")(e.target.value.replace(/\D/g,""))} style={{ ...inp, width:90 }} inputMode="numeric" />
          <span style={{ fontSize:12, color:t.textMuted }}>quantidade contratada</span>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {Array.from({ length: total }, (_, i) => i + 1).map(n => {
            const paga = f.pagas.includes(n);
            return <button key={n} type="button" onClick={()=>togglePaga(n)} title={paga?"Paga":"Não paga"}
              style={{ minWidth:38, padding:"6px 8px", borderRadius:8, border:`1.5px solid ${paga?"#22c55e":t.border}`, background:paga?"#dcfce7":t.inputBg, color:paga?"#15803d":t.textMuted, fontWeight:700, fontSize:12, cursor:"pointer", ...FF }}>{n}{paga?" ✓":""}</button>;
          })}
        </div>
      </Field>
      <Field label="Link de retorno da Vindi">
        <input value={f.vindiUrl} onChange={e=>set("vindiUrl")(e.target.value)} style={inp} type="url" placeholder="https://app.vindi.com.br/..." autoComplete="off" />
      </Field>
      {erro && <p style={{ color:"#dc2626", fontSize:13, margin:"-4px 0 0", fontWeight:500 }}>{erro}</p>}
    </ModalShell>
  );
}

// ── Integração Vindi (dados apurados pelo servidor; a chave nunca chega ao navegador) ──

const fmtCentavos = c => c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
const fmtDataHora = iso => iso ? new Date(iso).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";
const VINDI_FATURA_STATUS = { paid:["Paga","#15803d","#dcfce7"], pending:["Pendente","#b45309","#fef3c7"], canceled:["Cancelada","#475569","#f1f5f9"], review:["Em análise","#1d4ed8","#dbeafe"], scheduled:["Agendada","#1d4ed8","#dbeafe"] };

async function chamarApiVindi(caminho, corpo) {
  let res;
  try {
    res = await fetch(`/api/vindi/${caminho}`, corpo === undefined ? {} : { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(corpo) });
  } catch { return { ok:false, dados:{ erro:"Sem conexão com o servidor." } }; }
  // No "npm run dev" local não existem as funções /api: o Vite devolve a própria página (HTML) ou 404.
  if (!(res.headers.get("content-type") || "").includes("application/json"))
    return { ok:false, dados:{ erro: "A integração Vindi só funciona no site publicado (ou com 'vercel dev'). No localhost comum ela não está disponível." } };
  let dados = {};
  try { dados = await res.json(); } catch { return { ok:false, dados:{ erro: `Resposta inesperada do servidor (HTTP ${res.status}).` } }; }
  return { ok: res.ok, status: res.status, dados };
}

function InadVindiSecao({ reg, box, titulo }) {
  const { t, dark } = useTheme();
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, texto }
  const v = reg.vindi;
  const atualizar = async () => {
    if (carregando) return;               // evita cliques repetidos
    setCarregando(true); setMsg(null);
    const r = await chamarApiVindi("sincronizar", { inadId: reg.id });
    setMsg({ ok: r.ok, texto: r.dados.mensagem || r.dados.erro || "Concluído." });
    setCarregando(false);
  };
  const ind = !v ? null : v.sincStatus === "ok" ? ["✓ Sincronizado", "#16a34a"] : v.sincStatus === "incompleto" ? ["⚠ Dados incompletos", "#d97706"] : ["✗ Erro na última tentativa", "#dc2626"];
  const linha = (rotulo, valor, cor) => (
    <div style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"5px 0", borderBottom:`1px solid ${t.border}`, fontSize:13 }}>
      <span style={{ color:t.textMuted }}>{rotulo}</span><span style={{ color:cor || t.text, fontWeight:600, textAlign:"right" }}>{valor ?? "—"}</span>
    </div>
  );
  return (
    <div style={{ ...box, marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap", marginBottom:6 }}>
        <div>
          {titulo("Situação na Vindi")}
          <div style={{ fontSize:12, color:t.textMuted, marginTop:-6 }}>
            {v ? <>Última sincronização: <b style={{ color:t.textSub }}>{fmtDataHora(v.ultimaSincronizacao)}</b>{ind && <span style={{ marginLeft:8, color:ind[1], fontWeight:700 }}>{ind[0]}</span>}</> : "Ainda não sincronizado com a Vindi."}
          </div>
        </div>
        <button onClick={atualizar} disabled={carregando} style={{ ...BTN_SEC(t), padding:"7px 14px", fontSize:13, opacity:carregando?0.6:1, cursor:carregando?"wait":"pointer" }}>
          {carregando ? "Consultando a Vindi…" : "🔄 Atualizar pela Vindi"}
        </button>
      </div>
      {msg && <div style={{ margin:"8px 0", padding:"8px 12px", borderRadius:8, fontSize:12.5, background:msg.ok?(dark?"rgba(34,197,94,0.1)":"#f0fdf4"):(dark?"rgba(239,68,68,0.1)":"#fef2f2"), color:msg.ok?(dark?"#86efac":"#166534"):(dark?"#fca5a5":"#b91c1c"), border:`1px solid ${msg.ok?"#86efac":"#fecaca"}` }}>{msg.texto}</div>}
      {v?.sincStatus === "erro" && v.sincErro && <div style={{ margin:"6px 0", fontSize:12, color:dark?"#fca5a5":"#b91c1c" }}>Última tentativa ({fmtDataHora(v.ultimaTentativa)}): {v.sincErro} Os dados abaixo são da última sincronização bem-sucedida.</div>}
      {v?.divergencia && <div style={{ margin:"6px 0", padding:"8px 12px", borderRadius:8, fontSize:12.5, background:dark?"rgba(245,158,11,0.1)":"#fffbeb", border:"1px solid #fde68a", color:dark?"#fbbf24":"#92400e" }}>⚠️ {v.divergencia}</div>}
      {v && v.ultimaSincronizacao && (<>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:"0 24px", marginTop:6 }}>
          <div>
            {linha("Faturas vencidas", v.vencidasQtd, v.vencidasQtd ? "#dc2626" : "#16a34a")}
            {linha("Valor total vencido", fmtCentavos(v.vencidoCentavos), v.vencidasQtd ? "#dc2626" : undefined)}
            {linha("Inadimplente desde (Vindi)", v.inadimplenteDesde ? fmtDataBR(v.inadimplenteDesde) : "—")}
            {linha("Dias desde o vencimento mais antigo", v.diasEmAtraso ?? "—")}
          </div>
          <div>
            {linha("Vencida mais recente", v.vencidaMaisRecente ? `${fmtDataBR(v.vencidaMaisRecente.vencimento)} · ${fmtCentavos(v.vencidaMaisRecente.valorCentavos)}` : "—")}
            {linha("Última fatura paga", v.ultimaPaga ? `${v.ultimaPaga.pagoEm ? fmtDataBR(v.ultimaPaga.pagoEm) : "data não informada"} · ${fmtCentavos(v.ultimaPaga.valorCentavos)}` : "—")}
            {linha("Em aberto, ainda não vencidas", v.abertasNaoVencidas ?? "—")}
            {linha("Assinatura", v.assinaturaStatus === "canceled" ? (v.cancelamento?.data ? `Cancelada em ${fmtDataBR(v.cancelamento.data)}` : "Cancelada (dívida vencida continua valendo)") : v.assinaturaStatus === "active" ? "Ativa" : (v.assinaturaStatus || (v.faturaAvulsaId ? "Fatura avulsa" : "—")), v.assinaturaStatus === "canceled" ? "#b45309" : undefined)}
            {v.cancelamento && linha("Em aberto no cancelamento", v.cancelamento.valorEmAbertoCentavos == null ? "não foi possível apurar" : v.cancelamento.vencidasQtd ? `${v.cancelamento.vencidasQtd} fatura(s) · ${fmtCentavos(v.cancelamento.valorEmAbertoCentavos)}` : "nada vencido", v.cancelamento.vencidasQtd ? "#dc2626" : undefined)}
          </div>
        </div>
        {v.historico && Object.keys(v.historico).length > 0 ? <InadHistoricoFinanceiro reg={reg} /> : (v.faturas || []).length > 0 && (
          <details style={{ marginTop:10 }}>
            <summary style={{ cursor:"pointer", fontSize:12.5, color:t.textSub, fontWeight:600 }}>Histórico de faturas na Vindi ({v.faturas.length})</summary>
            <div style={{ overflowX:"auto", marginTop:8 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12.5, minWidth:420 }}>
                <thead><tr>{["Vencimento","Valor","Situação","Pago em"].map(h => <th key={h} style={{ textAlign:"left", padding:"6px 8px", color:t.textMuted, fontWeight:600, borderBottom:`1px solid ${t.border}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {v.faturas.map(f => { const [rot, cor, bg] = f.vencida ? ["Vencida", "#b91c1c", "#fee2e2"] : (VINDI_FATURA_STATUS[f.status] || [f.status || "—", t.textSub, t.btnSecBg]); return (
                    <tr key={f.id}>
                      <td style={{ padding:"6px 8px", borderBottom:`1px solid ${t.border}`, color:t.text }}>{f.vencimento ? fmtDataBR(f.vencimento) : "—"}</td>
                      <td style={{ padding:"6px 8px", borderBottom:`1px solid ${t.border}`, color:t.text }}>{fmtCentavos(f.valorCentavos)}</td>
                      <td style={{ padding:"6px 8px", borderBottom:`1px solid ${t.border}` }}><span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700, color:dark?"#e2e8f0":cor, background:dark?"rgba(255,255,255,0.08)":bg }}>{rot}</span></td>
                      <td style={{ padding:"6px 8px", borderBottom:`1px solid ${t.border}`, color:t.textMuted }}>{f.pagoEm ? fmtDataBR(f.pagoEm) : "—"}</td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </>)}
    </div>
  );
}

// Histórico financeiro por parcela (vindi.historico): fica disponível mesmo com o cliente
// Regularizado ou Cancelado. No celular (sem mouse), é aqui que se vê o detalhe de cada quadradinho.
const SITUACAO_HISTORICO = {
  paga:       ["Paga no prazo",  "#15803d", "#dcfce7"],
  antecipada: ["Paga antecipada", "#15803d", "#dcfce7"],
  pagaAtraso: ["Paga em atraso", "#1d4ed8", "#dbeafe"],
  vencida:    ["Vencida",        "#b91c1c", "#fee2e2"],
  aVencer:    ["A vencer",       "#475569", "#f1f5f9"],
  naoGerada:  ["Não gerada",     "#64748b", "#f8fafc"],
};
function InadHistoricoFinanceiro({ reg }) {
  const { t, dark } = useTheme();
  const parcelas = inadSituacaoParcelas(reg, hojeLocal());
  const conta = sit => parcelas.filter(p => p.situacao === sit).length;
  const resumo = [["no prazo", parcelas.filter(p => p.situacao === "paga" && !p.antecipada).length], ["antecipadas", parcelas.filter(p => p.antecipada).length], ["em atraso", conta("pagaAtraso")], ["vencidas", conta("vencida")], ["a vencer", conta("aVencer")], ["não geradas", conta("naoGerada")]].filter(([, n]) => n);
  const td = { padding:"6px 8px", borderBottom:`1px solid ${t.border}` };
  return (
    <details style={{ marginTop:10 }}>
      <summary style={{ cursor:"pointer", fontSize:12.5, color:t.textSub, fontWeight:600 }}>
        Histórico financeiro das parcelas <span style={{ fontWeight:400, color:t.textMuted }}>({resumo.map(([r, n]) => `${n} ${r}`).join(" · ")})</span>
      </summary>
      <div style={{ overflowX:"auto", marginTop:8 }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12.5, minWidth:520 }}>
          <thead><tr>{["Parcela","Vencimento original","Valor","Situação","Pago em","Atraso"].map(h => <th key={h} style={{ textAlign:"left", padding:"6px 8px", color:t.textMuted, fontWeight:600, borderBottom:`1px solid ${t.border}` }}>{h}</th>)}</tr></thead>
          <tbody>
            {parcelas.map(p => { const [rot, cor, bg] = SITUACAO_HISTORICO[p.situacao] || [p.situacao, t.textSub, t.btnSecBg]; return (
              <tr key={p.n}>
                <td style={{ ...td, color:t.text, whiteSpace:"nowrap" }}>{p.n} de {p.total}</td>
                <td style={{ ...td, color:t.text }}>{p.vencimento ? fmtDataBR(p.vencimento) : "—"}{p.prorrogadaPara && <div style={{ fontSize:11, color:t.textMuted }}>prorrogada para {fmtDataBR(p.prorrogadaPara)}</div>}</td>
                <td style={{ ...td, color:t.text }}>{p.valorCentavos != null ? fmtCentavos(p.valorCentavos) : "—"}</td>
                <td style={td}>
                  <span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700, color:dark?"#e2e8f0":cor, background:dark?"rgba(255,255,255,0.08)":bg, whiteSpace:"nowrap" }}>{p.situacao === "paga" && p.antecipada ? SITUACAO_HISTORICO.antecipada[0] : p.situacao === "paga" && p.diasAtraso == null ? "Paga" : rot}</span>
                  {p.canceladaNaVindi && <span style={{ marginLeft:6, fontSize:11, color:t.textMuted }}>em aberto no cancelamento</span>}
                </td>
                <td style={{ ...td, color:t.textMuted }}>{p.pagoEm ? fmtDataBR(p.pagoEm) : p.situacao === "paga" ? "data não informada" : "—"}</td>
                <td style={{ ...td, color:p.situacao === "pagaAtraso" ? (dark?"#93c5fd":"#1d4ed8") : t.textMuted, fontWeight:p.situacao === "pagaAtraso" ? 600 : 400 }}>{p.situacao === "pagaAtraso" ? `${p.diasAtraso} ${p.diasAtraso === 1 ? "dia" : "dias"}` : "—"}</td>
              </tr>); })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// Card do Admin: teste de conexão com o Freshdesk. O servidor só executa para um administrador
// autenticado no Firebase (token conferido no servidor + UID em ADMIN_UIDS na Vercel).
// Mostra apenas se funcionou ou o erro — nada sobre o agente nem sobre a chave.
const ERROS_LOGIN = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/user-disabled": "Esta conta foi desativada.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
  "auth/network-request-failed": "Sem conexão com a internet.",
  "auth/operation-not-allowed": "O login por e-mail/senha ainda não foi ativado no Firebase.",
};
function FreshdeskAdminCard() {
  const { t, dark } = useTheme();
  const [aberto,  setAberto]  = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [email,   setEmail]   = useState("");
  const [senha,   setSenha]   = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg,     setMsg]     = useState(null); // { ok, texto }

  useEffect(() => onAuthStateChanged(auth, setUsuario), []);

  const entrar = async () => {
    if (ocupado || !email.trim() || !senha) return;
    setOcupado(true); setMsg(null);
    try { await signInWithEmailAndPassword(auth, email.trim(), senha); setSenha(""); }
    catch (e) { setMsg({ ok:false, texto: ERROS_LOGIN[e?.code] || "Não foi possível entrar." }); }
    setOcupado(false);
  };
  const testar = async () => {
    if (ocupado || !usuario) return;
    setOcupado(true); setMsg(null);
    try {
      const token = await usuario.getIdToken();
      const res = await fetch("/api/freshdesk/status", { headers: { Authorization: `Bearer ${token}` } });
      if (!(res.headers.get("content-type") || "").includes("application/json")) {
        setMsg({ ok:false, texto:"O teste só funciona no site publicado (ou com 'vercel dev'), não no localhost comum." });
      } else {
        const d = await res.json();
        setMsg(res.ok && d.conectado ? { ok:true, texto:"✓ Conexão com o Freshdesk funcionando." } : { ok:false, texto:`✗ ${d.erro || "Falha no teste."}` });
      }
    } catch { setMsg({ ok:false, texto:"✗ Sem conexão com o servidor." }); }
    setOcupado(false);
  };
  const inp = { ...INP(t), padding:"8px 12px", fontSize:13 };

  return (
    <div style={{ marginBottom:20, background:t.card, border:`1px solid ${t.border}`, borderRadius:14, overflow:"hidden" }}>
      <button onClick={()=>setAberto(v=>!v)} style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", background:"transparent", border:"none", cursor:"pointer", ...FF }}>
        <span style={{ fontWeight:600, fontSize:14, color:t.text }}>🎧 Integração Freshdesk</span>
        <span style={{ color:t.textMuted, fontSize:12 }}>{aberto ? "▲ Fechar" : "▼ Abrir"}</span>
      </button>
      {aberto && (
        <div style={{ padding:"14px 18px 18px", borderTop:`1px solid ${t.border}` }}>
          {!usuario ? (<>
            <div style={{ fontSize:12.5, color:t.textSub, marginBottom:10 }}>Para testar a conexão, entre com a <b>conta de administrador do Firebase</b>.</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mail" type="email" autoComplete="username" style={{ ...inp, flex:"1 1 200px", width:"auto" }} />
              <input value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Senha" type="password" autoComplete="current-password" onKeyDown={e=>e.key==="Enter"&&entrar()} style={{ ...inp, flex:"1 1 160px", width:"auto" }} />
              <button onClick={entrar} disabled={ocupado || !email.trim() || !senha} style={{ ...btnP(ocupado || !email.trim() || !senha), flex:"none", padding:"8px 18px", fontSize:13 }}>{ocupado ? "Entrando…" : "Entrar"}</button>
            </div>
          </>) : (<>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", fontSize:12.5, color:t.textSub }}>
              <span>Conectado como <b style={{ color:t.text }}>{usuario.email}</b></span>
              <button onClick={()=>{ signOut(auth); setMsg(null); }} style={{ ...BTN_SEC(t), padding:"5px 12px", fontSize:12 }}>Sair</button>
            </div>
            <button onClick={testar} disabled={ocupado} style={{ ...BTN_SEC(t), marginTop:12, padding:"8px 16px", fontSize:13, opacity:ocupado?0.6:1 }}>{ocupado ? "Testando…" : "Testar conexão"}</button>
          </>)}
          {msg && <div style={{ marginTop:12, padding:"8px 12px", borderRadius:8, fontSize:12.5, background:msg.ok?(dark?"rgba(34,197,94,0.1)":"#f0fdf4"):(dark?"rgba(239,68,68,0.1)":"#fef2f2"), color:msg.ok?(dark?"#86efac":"#166534"):(dark?"#fca5a5":"#b91c1c") }}>{msg.texto}</div>}
        </div>
      )}
    </div>
  );
}

// Card do Admin: situação da integração, teste de conexão, reprocessamento e últimos erros.
function VindiAdminCard() {
  const { t, dark } = useTheme();
  const [aberto, setAberto] = useState(false);
  const [info, setInfo] = useState(null);
  const [acao, setAcao] = useState(null);
  const [msg, setMsg] = useState(null);
  const [erros, setErros] = useState([]);
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    if (!aberto) return;
    chamarApiVindi("status").then(r => setInfo(r.ok ? r.dados : { indisponivel: r.dados.erro }));
    const u1 = onSnapshot(query(collection(db, "vindi_sincronizacoes"), where("resultado", "in", ["erro", "nao_vinculado", "sem_identificador"])),
      s => setErros(s.docs.map(d => d.data()).sort((a, b) => (b.em||"").localeCompare(a.em||"")).slice(0, 10)), () => setErros([]));
    const u2 = onSnapshot(query(collection(db, "vindi_eventos"), where("status", "in", ["pendente", "erro"])), s => setPendentes(s.size), () => {});
    return () => { u1(); u2(); };
  }, [aberto]);

  const executar = async nome => {
    if (acao) return;
    setAcao(nome); setMsg(null);
    const r = await chamarApiVindi("status", { acao: nome });
    setMsg({ ok: r.ok && r.dados.conexao !== "erro", texto: r.dados.mensagem || r.dados.erro || "Concluído." });
    if (r.dados.ambiente !== undefined) setInfo(r.dados);
    setAcao(null);
  };
  const ambiente = info?.ambiente === "producao" ? ["PRODUÇÃO", "#dc2626"] : info?.ambiente === "sandbox" ? ["TESTE (sandbox)", "#2563eb"] : null;
  const item = (rotulo, valor) => <div style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"6px 0", borderBottom:`1px solid ${t.border}`, fontSize:13 }}><span style={{ color:t.textMuted }}>{rotulo}</span><span style={{ color:t.text, fontWeight:600, textAlign:"right" }}>{valor}</span></div>;

  return (
    <div style={{ marginBottom:20, background:t.card, border:`1px solid ${t.border}`, borderRadius:14, overflow:"hidden" }}>
      <button onClick={()=>setAberto(v=>!v)} style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", background:"transparent", border:"none", cursor:"pointer", ...FF }}>
        <span style={{ fontWeight:600, fontSize:14, color:t.text }}>🔗 Integração Vindi</span>
        <span style={{ color:t.textMuted, fontSize:12 }}>{aberto ? "▲ Fechar" : "▼ Abrir"}</span>
      </button>
      {aberto && (
        <div style={{ padding:"4px 18px 18px", borderTop:`1px solid ${t.border}` }}>
          {!info ? <div style={{ padding:16, color:t.textMuted, fontSize:13 }}>Carregando…</div>
          : info.indisponivel ? <div style={{ marginTop:12, fontSize:13, color:t.textMuted }}>{info.indisponivel}</div>
          : (<>
            <div style={{ marginTop:8 }}>
              {item("Ambiente", ambiente ? <span style={{ color:ambiente[1] }}>{ambiente[0]}</span> : "não definido")}
              {item("Chave da API", info.apiConfigurada ? `configurada (${info.chaveFinal})` : "não configurada")}
              {item("Webhook", info.webhookConfigurado ? "usuário e senha configurados" : "não configurado")}
              {item("Projeto Firebase do servidor", !info.firebaseProjetoServidor ? "conta de serviço não configurada" : info.firebaseProjetoServidor === "invalido" ? <span style={{ color:"#dc2626" }}>conta de serviço inválida (JSON)</span> : info.firebaseProjetoApp && info.firebaseProjetoServidor !== info.firebaseProjetoApp ? <span style={{ color:"#dc2626" }}>{info.firebaseProjetoServidor} ≠ {info.firebaseProjetoApp} (projeto errado!)</span> : <span style={{ color:"#16a34a" }}>{info.firebaseProjetoServidor} ✓</span>)}
              {item("Eventos pendentes ou com erro", pendentes)}
            </div>
            <div style={{ marginTop:12, fontSize:12.5, color:t.textSub }}>
              URL para cadastrar na Vindi (Configurações → Webhooks), trocando USUARIO e SENHA pelos valores definidos na Vercel:
              <div style={{ marginTop:6, padding:"8px 10px", borderRadius:8, background:dark?"#0f172a":"#f1f5f9", fontFamily:"monospace", fontSize:12, wordBreak:"break-all", color:t.text }}>{info.webhookUrl || "—"}</div>
              <div style={{ marginTop:6, color:t.textMuted }}>Eventos: bill_paid, bill_canceled, bill_overdue, charge_rejected, subscription_canceled.</div>
            </div>
            {info.ambiente === "sandbox" && <div style={{ marginTop:10, fontSize:12.5, color:dark?"#93c5fd":"#1d4ed8" }}>ℹ️ Em modo TESTE, as consultas e webhooks ficam só no histórico — nenhum inadimplente é alterado.</div>}
            <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
              <button onClick={()=>executar("testar")} disabled={!!acao || !info.apiConfigurada} style={{ ...BTN_SEC(t), padding:"8px 16px", fontSize:13, opacity:(!!acao||!info.apiConfigurada)?0.5:1 }}>{acao === "testar" ? "Testando…" : "Testar conexão"}</button>
              <button onClick={()=>executar("reprocessar")} disabled={!!acao || !info.apiConfigurada || !pendentes} style={{ ...BTN_SEC(t), padding:"8px 16px", fontSize:13, opacity:(!!acao||!info.apiConfigurada||!pendentes)?0.5:1 }}>{acao === "reprocessar" ? "Reprocessando…" : "Reprocessar eventos pendentes"}</button>
            </div>
            {msg && <div style={{ marginTop:10, padding:"8px 12px", borderRadius:8, fontSize:12.5, background:msg.ok?(dark?"rgba(34,197,94,0.1)":"#f0fdf4"):(dark?"rgba(239,68,68,0.1)":"#fef2f2"), color:msg.ok?(dark?"#86efac":"#166534"):(dark?"#fca5a5":"#b91c1c") }}>{msg.texto}</div>}
          </>)}
          <div style={{ marginTop:16, fontSize:11, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:0.5 }}>Últimos problemas de sincronização</div>
          {erros.length === 0 ? <div style={{ fontSize:12.5, color:t.textMuted, marginTop:6 }}>Nenhum.</div> : erros.map((e, i) => (
            <div key={i} style={{ fontSize:12.5, padding:"6px 0", borderBottom:`1px solid ${t.border}`, color:t.textSub }}>
              <b>{fmtDataHora(e.em)}</b> · {e.origem === "webhook" ? `webhook ${e.evento || ""}` : "manual"}{e.ambiente === "sandbox" ? " · teste" : ""} · {e.erro || e.resultado}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Detalhes completos + acompanhamento (observações, compromisso, importante, status).
function InadDetalheModal({ reg, employees, perms, user, onClose, onStatus, onImportante, onAgenda, onEditar, onObservacao }) {
  const { t, dark } = useTheme();
  const [obs, setObs] = useState("");
  const s = inadResumoParcelas(reg);
  const tempo = inadTempo(reg.dataInadimplencia);
  const resp = employees.find(e => e.id === reg.responsavelId);
  const temVindi = inadVindiValido(reg.vindiUrl);
  const box = { background:t.pageBg, border:`1px solid ${t.border}`, borderRadius:12, padding:"14px 16px" };
  const titulo = txt => <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>{txt}</div>;
  const linha = (rotulo, valor) => (
    <div style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"5px 0", borderBottom:`1px solid ${t.border}`, fontSize:13 }}>
      <span style={{ color:t.textMuted }}>{rotulo}</span><span style={{ color:t.text, fontWeight:600, textAlign:"right", wordBreak:"break-word" }}>{valor ?? "—"}</span>
    </div>
  );
  const enviarObs = () => { if (obs.trim()) { onObservacao(obs.trim()); setObs(""); } };
  const observacoes = [...(reg.observacoes||[])].sort((a, b) => (b.data||"").localeCompare(a.data||""));

  return (
    <ModalShell title={reg.nome} onClose={onClose} maxWidth={820}
      footer={<div style={{ display:"flex", gap:10, flexWrap:"wrap", width:"100%", justifyContent:"flex-end" }}>
        <button disabled={!temVindi} title={temVindi ? "Abre a cobrança na Vindi em uma nova aba" : "Nenhum link válido da Vindi para este cliente"}
          onClick={() => temVindi && window.open(reg.vindiUrl, "_blank", "noopener,noreferrer")}
          style={{ ...BTN_SEC(t), opacity:temVindi?1:0.45, cursor:temVindi?"pointer":"not-allowed" }}>🔗 Consultar na Vindi</button>
        {perms.editar && <button onClick={onEditar} style={BTN_SEC(t)}>✏️ Editar</button>}
        <button onClick={onClose} style={{ ...btnP(false), flex:"none" }}>Fechar</button>
      </div>}>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:16 }}>
        <InadStatusBadge status={reg.status} />
        {perms.status && (
          <select value={reg.status} onChange={e=>onStatus(e.target.value)} style={{ ...SEL(t), width:"auto", padding:"5px 10px", fontSize:12.5 }}>
            {INAD_STATUS.map(st => <option key={st}>{st}</option>)}
          </select>
        )}
        <button onClick={onImportante} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:8, cursor:"pointer", fontSize:12.5, fontWeight:600, border:`1px solid ${reg.prioridade?"#f9731655":t.border}`, background:reg.prioridade?"#f9731622":"transparent", color:reg.prioridade?"#f97316":t.textSub, ...FF }}>
          <SireneIcon /> {reg.prioridade ? "Importante" : "Marcar como importante"}
        </button>
        <button onClick={onAgenda} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:8, cursor:"pointer", fontSize:12.5, fontWeight:600, border:`1px solid ${reg.agendamento&&!reg.agendamento.concluido?"#f59e0b55":t.border}`, background:reg.agendamento&&!reg.agendamento.concluido?"#f59e0b22":"transparent", color:reg.agendamento&&!reg.agendamento.concluido?"#d97706":t.textSub, ...FF }}>
          📅 {reg.agendamento && !reg.agendamento.concluido ? `Compromisso: ${reg.agendamento.dataHora ? new Date(reg.agendamento.dataHora).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : reg.agendamento.titulo}` : "Adicionar compromisso"}
        </button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:14, marginBottom:14 }}>
        <div style={box}>
          {titulo("Cliente")}
          {linha("E-mail", reg.email || "—")}
          {linha("Programa", reg.programa || "—")}
          {linha("Nº Série", reg.serie || "—")}
          {linha("Nº de cópias", reg.copias ?? "—")}
          {linha("Nº (identificação)", reg.numero || "—")}
          {linha("Responsável", resp ? resp.name : (reg.colaboradorPlanilha ? `${reg.colaboradorPlanilha} (planilha)` : "—"))}
        </div>
        <div style={box}>
          {titulo("Financeiro")}
          {linha("Inadimplente desde", fmtDataBR(reg.dataInadimplencia))}
          {linha("Tempo", inadTempoTexto(tempo))}
          {linha("Parcelas contratadas", s.total)}
          {linha("Pagas", s.pagas)}
          {linha("Pendentes (não pagas)", s.naoPagas)}
          {linha("Última parcela paga", s.ultimaPaga ? `${s.ultimaPaga}ª` : "nenhuma")}
          {linha("Valor em aberto", reg.valorAReceber != null ? gcFmtBRL(reg.valorAReceber) : "—")}
          {reg.pagamento && linha("Forma de pagamento", reg.pagamento)}
        </div>
      </div>

      <InadVindiSecao reg={reg} box={box} titulo={titulo} />

      <div style={{ ...box, marginBottom:14 }}>
        {titulo("Parcelas")}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(92px, 1fr))", gap:8 }}>
          {(reg.parcelas||[]).map(p => (
            <div key={p.n} style={{ borderRadius:10, padding:"8px 10px", border:`1px solid ${p.paga?(dark?"rgba(34,197,94,0.3)":"#bbf7d0"):t.border}`, background:p.paga?(dark?"rgba(34,197,94,0.1)":"#f0fdf4"):t.card }}>
              <div style={{ fontSize:11, color:t.textMuted, fontWeight:600 }}>Parcela {p.n}</div>
              <div style={{ fontSize:12.5, fontWeight:700, color:p.paga?(dark?"#4ade80":"#15803d"):t.textSub }}>{p.paga ? "Paga" : "Não paga"}</div>
              {p.paga && <div style={{ fontSize:10.5, color:t.textMuted }}>{p.dataPagamento ? fmtDataBR(p.dataPagamento) : "sem data"}</div>}
            </div>
          ))}
        </div>
        {s.comLacuna && <div style={{ marginTop:10, fontSize:12, color:dark?"#fbbf24":"#b45309" }}>⚠️ Há parcela não paga antes da última parcela paga.</div>}
        <div style={{ marginTop:10, fontSize:11.5, color:t.textMuted }}>A planilha não informa datas de vencimento — "não paga" não significa necessariamente vencida. Referência oficial: data de inadimplência.</div>
      </div>

      <div style={box}>
        {titulo(`Observações de cobrança (${observacoes.length})`)}
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <textarea value={obs} onChange={e=>setObs(e.target.value)} rows={2} placeholder="Ex.: Liguei, cliente prometeu pagar dia 20..." style={{ ...INP(t), resize:"vertical", flex:1 }}
            onKeyDown={e=>{ if (e.key==="Enter" && (e.ctrlKey||e.metaKey)) enviarObs(); }} />
          <button onClick={enviarObs} disabled={!obs.trim()} style={{ ...btnP(!obs.trim()), flex:"none", alignSelf:"flex-start" }}>Registrar</button>
        </div>
        {observacoes.length === 0
          ? <div style={{ fontSize:12.5, color:t.textMuted }}>Nenhuma observação registrada.</div>
          : observacoes.map(o => (
            <div key={o.id} style={{ padding:"8px 0", borderTop:`1px solid ${t.border}` }}>
              <div style={{ fontSize:11, color:t.textMuted, marginBottom:2 }}>{o.autorNome || "—"} · {o.data ? new Date(o.data).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : ""}</div>
              <div style={{ fontSize:13, color:t.text, whiteSpace:"pre-wrap" }}>{o.texto}</div>
            </div>
          ))}
      </div>
    </ModalShell>
  );
}

// Lista principal — usada pelo Admin (aba Inadimplentes) e pelos atendentes autorizados.
function InadimplentesPanel({ user, isAdmin, employees: empsProp }) {
  const { t } = useTheme();
  const perms = {
    editar:  isAdmin || !!user?.acessoInadimplentes,
    excluir: isAdmin,
    status:  isAdmin || !!user?.inadAlterarStatus,
  };
  const [regs,      setRegs]      = useState([]);
  const [employees, setEmployees] = useState(empsProp || []);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [form,      setForm]      = useState(null);   // null | { reg?: registro }
  const [detalheId, setDetalheId] = useState(null);
  const [agendaReg, setAgendaReg] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [toast,     setToast]     = useState("");
  const [filters, setFilters] = useState(() => {
    const base = { search:"", status:"Todos", programa:"Todos", responsavel:"Todos", tempo:"Todos", ordem:"dataAsc" };
    try { return { ...base, ...JSON.parse(localStorage.getItem(INAD_FKEY) || "{}"), search:"" }; } catch { return base; }
  });
  const [alerta, setAlerta] = useCompromissoAlerta(regs);
  const toastRef = useRef(null);
  const showToast = msg => { setToast(msg); clearTimeout(toastRef.current); toastRef.current = setTimeout(()=>setToast(""), 3000); };
  const setF = k => v => setFilters(p => ({ ...p, [k]: v }));

  useEffect(() => { if (empsProp) setEmployees(empsProp); }, [empsProp]);
  useEffect(() => {
    if (!empsProp) loadEmployees().then(setEmployees).catch(() => {});
    const unsub = onSnapshot(collection(db, "inadimplentes"),
      snap => { setRegs(snap.docs.map(d => d.data())); setLoading(false); },
      e => { console.error("Inadimplentes: falha ao carregar", e); setLoadError(true); setLoading(false); });
    return () => unsub();
  }, []);
  useEffect(() => { try { const { search:_, ...salvar } = filters; localStorage.setItem(INAD_FKEY, JSON.stringify(salvar)); } catch {} }, [filters]);

  // Gravação parcial (só os campos alterados) — não sobrescreve o que outra pessoa mudou ao mesmo tempo.
  const atualizar = async (id, campos, ok) => {
    try { await updateDoc(doc(db, "inadimplentes", id), campos); if (ok) showToast(ok); return true; }
    catch (e) { console.error(e); showToast("❌  Erro ao salvar — nada foi alterado. Verifique a conexão."); return false; }
  };

  const salvarForm = async dados => {
    const editando = form?.reg;
    const conflito = dados.numero && regs.find(r => r.numero === dados.numero && r.id !== editando?.id);
    if (conflito) { showToast(`⚠️  Já existe um registro com o Nº ${dados.numero} (${conflito.nome}).`); return; }
    if (editando) {
      if (!perms.status || dados.status === editando.status) delete dados.status;
      else dados.statusOrigem = "manual"; // definido por uma pessoa: a Vindi não troca automaticamente
      if (await atualizar(editando.id, dados, "✓  Registro atualizado.")) setForm(null);
    } else {
      const novo = { id:`inad-m-${genId()}`, ...dados, status: perms.status ? dados.status : "Inadimplente", statusOrigem: perms.status && dados.status !== "Inadimplente" ? "manual" : "cadastro",
        prioridade:false, agendamento:null, observacoes:[], origem:"manual", criadoEm:new Date().toISOString(), criadoPor:user?.name || "Administrador" };
      try { await saveItem("inadimplentes", novo); showToast("✓  Inadimplente cadastrado."); setForm(null); }
      catch (e) { console.error(e); showToast("❌  Erro ao salvar — verifique a conexão."); }
    }
  };

  const excluir = async () => {
    try { await deleteItem("inadimplentes", confirmId); showToast("🗑️  Registro excluído."); if (detalheId === confirmId) setDetalheId(null); }
    catch (e) { console.error(e); showToast("❌  Erro ao excluir — verifique a conexão."); }
    setConfirmId(null);
  };

  const registrarObs = texto => atualizar(detalheId, { observacoes: arrayUnion({ id:genId(), texto, autorId:user?.id || "admin", autorNome:user?.name || "Administrador", data:new Date().toISOString() }) }, "✓  Observação registrada.");
  // O AgendaModal da planilha também mexe no status; aqui o status do inadimplente não muda.
  const salvarAgenda = async atualizado => { if (await atualizar(atualizado.id, { agendamento: atualizado.agendamento }, "✓  Compromisso salvo.")) setAgendaReg(null); };

  const hoje = new Date();
  const programas = [...new Set(regs.map(r => r.programa).filter(Boolean))].sort();
  const busca = satNorm(filters.search);
  const filtrados = regs.filter(r => {
    if (busca && ![r.nome, r.email, r.programa, r.serie, r.numero, r.idFatura].some(v => satNorm(v).includes(busca))) return false;
    if (filters.status !== "Todos" && r.status !== filters.status) return false;
    if (filters.programa !== "Todos" && r.programa !== filters.programa) return false;
    if (filters.responsavel === "nenhum" ? !!r.responsavelId : (filters.responsavel !== "Todos" && r.responsavelId !== filters.responsavel)) return false;
    if (filters.tempo !== "Todos") {
      const m = inadTempo(r.dataInadimplencia, hoje)?.maisDeUmMes;
      if (filters.tempo === "mais1" ? !m : m) return false;
    }
    return true;
  });
  const ord = {
    dataAsc:   (a, b) => (a.dataInadimplencia||"9").localeCompare(b.dataInadimplencia||"9"),
    dataDesc:  (a, b) => (b.dataInadimplencia||"").localeCompare(a.dataInadimplencia||""),
    nome:      (a, b) => (a.nome||"").localeCompare(b.nome||"", "pt-BR"),
    programa:  (a, b) => (a.programa||"").localeCompare(b.programa||"", "pt-BR") || (a.nome||"").localeCompare(b.nome||"", "pt-BR"),
    status:    (a, b) => INAD_STATUS.indexOf(a.status) - INAD_STATUS.indexOf(b.status) || (a.nome||"").localeCompare(b.nome||"", "pt-BR"),
    pendentes: (a, b) => inadResumoParcelas(b).naoPagas - inadResumoParcelas(a).naoPagas,
    valor:     (a, b) => (b.valorAReceber||0) - (a.valorAReceber||0),
  }[filters.ordem] || (() => 0);
  const lista = [...filtrados].sort((a, b) => (b.prioridade?1:0) - (a.prioridade?1:0) || ord(a, b));

  const ativos = regs.filter(r => r.status === "Inadimplente");
  const stats = [
    ["Total",            regs.length,                                                       t.text],
    ["Inadimplentes",    ativos.length,                                                     "#ea580c"],
    ["Há mais de 1 mês", ativos.filter(r => inadTempo(r.dataInadimplencia, hoje)?.maisDeUmMes).length, "#d97706"],
    ["Regularizados",    regs.filter(r => r.status === "Regularizado").length,              "#16a34a"],
    ["Quitados",         regs.filter(r => r.status === "Quitado").length,                   "#4f46e5"],
    ["Cancelados",       regs.filter(r => r.status === "Cancelado").length,                 "#dc2626"],
    ["Em aberto",        gcFmtBRL(ativos.reduce((s, r) => s + (r.valorAReceber||0), 0)) || "R$ 0,00", "#dc2626"],
  ];
  const selSt = { padding:"8px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:8, fontSize:13, color:t.inputText, background:t.inputBg, cursor:"pointer", ...FF };
  const detalhe = regs.find(r => r.id === detalheId);

  if (loadError) return <LoadErrorBox />;
  return (
    <div>
      <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        {stats.map(([l, v, c]) => (
          <div key={l} style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:14, padding:"12px 18px", minWidth:118 }}>
            <div style={{ fontSize:11, color:t.textMuted, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:l==="Em aberto"?20:26, fontWeight:800, color:c, lineHeight:1.1 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background:t.card, borderRadius:14, border:`1px solid ${t.border}`, padding:"13px 18px", marginBottom:14, display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", position:"sticky", top:58, zIndex:10 }}>
        <input value={filters.search} onChange={e=>setF("search")(e.target.value)} placeholder="🔍  Buscar nome, e-mail, sistema, Nº ou série..." style={{ flex:1, minWidth:190, padding:"8px 14px", border:`1.5px solid ${t.inputBorder}`, borderRadius:9, fontSize:13, color:t.inputText, outline:"none", background:t.inputBg, ...FF }} />
        <select value={filters.status} onChange={e=>setF("status")(e.target.value)} style={selSt}><option value="Todos">Todos os status</option>{INAD_STATUS.map(s=><option key={s}>{s}</option>)}</select>
        <select value={filters.programa} onChange={e=>setF("programa")(e.target.value)} style={selSt}><option value="Todos">Todos os sistemas</option>{programas.map(p=><option key={p}>{p}</option>)}</select>
        <select value={filters.responsavel} onChange={e=>setF("responsavel")(e.target.value)} style={selSt}>
          <option value="Todos">Todos responsáveis</option><option value="nenhum">Sem responsável</option>
          {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={filters.tempo} onChange={e=>setF("tempo")(e.target.value)} style={selSt}>
          <option value="Todos">Qualquer tempo</option><option value="mais1">Há mais de 1 mês</option><option value="ate1">Até 1 mês</option>
        </select>
        <select value={filters.ordem} onChange={e=>setF("ordem")(e.target.value)} style={selSt} title="Ordenar por">
          <option value="dataAsc">↕ Inadimplência mais antiga</option><option value="dataDesc">↕ Inadimplência mais recente</option>
          <option value="nome">↕ Nome (A–Z)</option><option value="programa">↕ Sistema</option><option value="status">↕ Status</option>
          <option value="pendentes">↕ Mais parcelas pendentes</option><option value="valor">↕ Maior valor em aberto</option>
        </select>
        {perms.editar && <button onClick={()=>setForm({})} style={{ padding:"9px 18px", background:"#6366f1", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", whiteSpace:"nowrap", ...FF }}>+ Novo Inadimplente</button>}
      </div>

      <div style={{ background:t.card, borderRadius:14, border:`1px solid ${t.border}`, overflow:"hidden" }}>
        {loading ? <div style={{ padding:60, textAlign:"center", color:t.textMuted }}>Carregando inadimplentes...</div>
        : lista.length === 0 ? (
          <div style={{ padding:60, textAlign:"center" }}>
            <div style={{ fontSize:44, marginBottom:12 }}>{regs.length ? "😕" : "💰"}</div>
            <div style={{ fontSize:15, fontWeight:600, color:t.text, marginBottom:4 }}>{regs.length ? "Nenhum registro encontrado" : "Nenhum inadimplente cadastrado"}</div>
            <div style={{ fontSize:13, color:t.textMuted }}>{regs.length ? "Ajuste os filtros ou a busca." : (isAdmin ? "Importe a planilha acima ou cadastre manualmente." : "Aguarde o administrador importar a planilha.")}</div>
          </div>
        ) : (
          <div style={{ padding:"10px 12px", display:"flex", flexDirection:"column", gap:5 }}>
            {lista.map(r => (
              <InadRow key={r.id} r={r} employees={employees} perms={perms}
                onAbrir={()=>setDetalheId(r.id)}
                onImportante={()=>atualizar(r.id, { prioridade: !r.prioridade })}
                onAgenda={()=>setAgendaReg(r)}
                onEditar={()=>setForm({ reg:r })}
                onExcluir={()=>setConfirmId(r.id)} />
            ))}
          </div>
        )}
      </div>
      <div style={{ marginTop:10, color:t.textMuted, fontSize:12, textAlign:"right" }}>{lista.length} de {regs.length} registros</div>

      {detalhe && <InadDetalheModal reg={detalhe} employees={employees} perms={perms} user={user}
        onClose={()=>setDetalheId(null)}
        onStatus={st=>atualizar(detalhe.id, { status: st, statusOrigem: "manual" }, `✓  Status alterado para ${st}.`)}
        onImportante={()=>atualizar(detalhe.id, { prioridade: !detalhe.prioridade })}
        onAgenda={()=>setAgendaReg(detalhe)}
        onEditar={()=>setForm({ reg:detalhe })}
        onObservacao={registrarObs} />}
      {form && <InadFormModal reg={form.reg} employees={employees} podeStatus={perms.status} onSave={salvarForm} onClose={()=>setForm(null)} />}
      {agendaReg && <AgendaModal record={{ ...agendaReg, agendamento: agendaReg.agendamento || null }} nome={agendaReg.nome}
        subtitulo={`${agendaReg.programa || "—"} · Inadimplente desde ${fmtDataBR(agendaReg.dataInadimplencia)}`}
        onSave={salvarAgenda} onClose={()=>setAgendaReg(null)} />}
      {confirmId && <ConfirmDialog message={`O registro de "${regs.find(r=>r.id===confirmId)?.nome}" e todo o acompanhamento (observações e compromisso) serão excluídos permanentemente.`} onConfirm={excluir} onCancel={()=>setConfirmId(null)} />}
      {alerta && <CompromissoAlerta item={alerta} nome={alerta.nome} subtitulo={`${alerta.programa || "—"} · Inadimplente desde ${fmtDataBR(alerta.dataInadimplencia)}`}
        onDispensar={()=>setAlerta(null)} onVer={()=>{ setAgendaReg(alerta); setAlerta(null); }} />}
      <Toast msg={toast} />
    </div>
  );
}

// Importação da planilha de inadimplentes (somente Admin).
function InadImportacao({ employees }) {
  const { t, dark } = useTheme();
  const [fase,     setFase]     = useState("idle"); // idle | preview | salvando | concluido | erro
  const [arquivo,  setArquivo]  = useState("");
  const [lidas,    setLidas]    = useState(null);
  const [previa,   setPrevia]   = useState(null);
  const [resultado,setResultado]= useState(null);
  const [erro,     setErro]     = useState("");
  const [aberto,   setAberto]   = useState(false);
  const fileRef = useRef();

  const nmEmp = (employees || []).map(e => ({ ...e, norm: satNorm(e.name) }));
  const opcoes = agora => ({ matchEmployee: nome => satFindEmployee(nome, nmEmp), arquivoNome: arquivo, agora, novoId: () => `inad-${genId()}` });
  const existentes = async () => (await getDocs(collection(db, "inadimplentes"))).docs.map(d => d.data());

  const handleFile = file => {
    if (!file) return;
    setArquivo(file.name); setErro(""); setResultado(null);
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const wb = XLSX.read(e.target.result, { type:"array", cellDates:false });
        const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"" });
        const lido = inadLerPlanilha(matriz);
        // Prévia calculada contra o que já está salvo (leitura direta: se falhar, não importa).
        const { resumo } = inadPlanejarImportacao(await existentes(), lido.linhas, opcoes(new Date().toISOString()));
        setLidas(lido.linhas); setPrevia(resumo); setFase("preview");
      } catch (err) { console.error(err); setErro("Erro ao ler o arquivo: " + err.message); setFase("erro"); }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmar = async () => {
    setFase("salvando");
    try {
      // Recalcula na hora de gravar, com os dados mais recentes do banco.
      const { gravar, novosIds, resumo } = inadPlanejarImportacao(await existentes(), lidas, opcoes(new Date().toISOString()));
      for (let i = 0; i < gravar.length; i += 400) {
        const batch = writeBatch(db);
        // Novos: documento completo. Existentes: só os campos da planilha (histórico da Vindi intacto).
        gravar.slice(i, i + 400).forEach(r => novosIds.has(r.id) ? batch.set(doc(db, "inadimplentes", r.id), r) : batch.update(doc(db, "inadimplentes", r.id), inadCamposImportacao(r)));
        await batch.commit();
      }
      setResultado(resumo); setFase("concluido");
    } catch (err) { console.error(err); setErro("Erro ao salvar: " + err.message + " — nenhum dado foi perdido."); setFase("erro"); }
  };

  const resetar = () => { setFase("idle"); setArquivo(""); setLidas(null); setPrevia(null); setResultado(null); setErro(""); };
  const resumoBox = (r, futuro) => (
    <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:14 }}>
      {[[r.incluidos, futuro?"Serão incluídos":"Incluídos", "#22c55e"], [r.atualizados, futuro?"Serão atualizados":"Atualizados", "#3b82f6"], [r.ignorados, "Sem alteração", t.textMuted], [r.erros.length, "Com erro", "#ef4444"]].map(([v, l, c]) => (
        <div key={l} style={{ textAlign:"center", minWidth:90 }}><div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div><div style={{ fontSize:11, color:t.textMuted }}>{l}</div></div>
      ))}
    </div>
  );
  const errosBox = r => r.erros.length > 0 && (
    <div style={{ marginBottom:14, padding:"10px 14px", background:dark?"rgba(239,68,68,0.08)":"#fef2f2", border:"1px solid #fecaca", borderRadius:10, fontSize:12.5, color:dark?"#fca5a5":"#b91c1c", maxHeight:160, overflowY:"auto" }}>
      <div style={{ fontWeight:700, marginBottom:4 }}>Linhas com erro (não serão gravadas; as demais seguem normalmente):</div>
      {r.erros.map((e, i) => <div key={i}>Linha {e.linha}: {e.motivo}</div>)}
    </div>
  );

  return (
    <div style={{ marginBottom:20, background:t.card, border:`1px solid ${t.border}`, borderRadius:14, overflow:"hidden" }}>
      <button onClick={()=>setAberto(v=>!v)} style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", background:"transparent", border:"none", cursor:"pointer", ...FF }}>
        <span style={{ fontWeight:600, fontSize:14, color:t.text }}>📥 Importar planilha de inadimplentes</span>
        <span style={{ color:t.textMuted, fontSize:12 }}>{aberto ? "▲ Fechar" : "▼ Abrir"}</span>
      </button>
      {aberto && (
        <div style={{ padding:"0 18px 18px", borderTop:`1px solid ${t.border}` }}>
          {(fase === "idle" || fase === "erro") && (<>
            <div onClick={()=>fileRef.current?.click()}
              onDragOver={e=>{ e.preventDefault(); e.currentTarget.style.borderColor="#6366f1"; }}
              onDragLeave={e=>{ e.currentTarget.style.borderColor=t.border; }}
              onDrop={e=>{ e.preventDefault(); e.currentTarget.style.borderColor=t.border; handleFile(e.dataTransfer.files[0]); }}
              style={{ marginTop:14, border:`2px dashed ${t.border}`, borderRadius:12, padding:"30px 24px", textAlign:"center", cursor:"pointer" }}>
              <div style={{ fontSize:34, marginBottom:8 }}>📂</div>
              <div style={{ fontWeight:600, fontSize:14, color:t.text, marginBottom:4 }}>Clique para selecionar ou arraste o arquivo aqui</div>
              <div style={{ fontSize:12, color:t.textMuted }}>Arquivo .xlsx no formato da planilha de inadimplentes. Importar de novo não duplica: registros existentes são atualizados e o acompanhamento é preservado.</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }} onChange={e=>{ handleFile(e.target.files?.[0]); e.target.value=""; }} />
            </div>
            {fase === "erro" && <div style={{ marginTop:12, padding:"10px 14px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, color:"#dc2626", fontSize:13 }}>{erro}</div>}
          </>)}
          {(fase === "preview" || fase === "salvando") && previa && (
            <div style={{ marginTop:14 }}>
              <div style={{ fontWeight:700, fontSize:14, color:t.text, marginBottom:2 }}>Pré-visualização</div>
              <div style={{ fontSize:12, color:t.textMuted, marginBottom:12 }}>{arquivo} · {lidas.length} linha(s)</div>
              {resumoBox(previa, true)}
              {previa.statusPreservado > 0 && <div style={{ marginBottom:12, fontSize:12.5, color:t.textSub }}>ℹ️ {previa.statusPreservado} registro(s) marcados como Cancelado/Regularizado no app mantêm esse status (a planilha não sobrescreve).</div>}
              {errosBox(previa)}
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button onClick={resetar} disabled={fase==="salvando"} style={BTN_SEC(t)}>Cancelar</button>
                <button onClick={confirmar} disabled={fase==="salvando" || previa.incluidos + previa.atualizados === 0} style={{ ...btnP(fase==="salvando" || previa.incluidos + previa.atualizados === 0), flex:"none" }}>{fase==="salvando" ? "Salvando..." : "Confirmar Importação"}</button>
              </div>
            </div>
          )}
          {fase === "concluido" && resultado && (
            <div style={{ marginTop:14, textAlign:"center" }}>
              <div style={{ fontSize:40, marginBottom:6 }}>✅</div>
              <div style={{ fontWeight:700, fontSize:16, color:t.text, marginBottom:12 }}>Importação concluída!</div>
              <div style={{ display:"flex", justifyContent:"center" }}>{resumoBox(resultado, false)}</div>
              {errosBox(resultado)}
              <button onClick={resetar} style={{ ...btnP(false), flex:"none" }}>Nova Importação</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Tela dos atendentes autorizados.
function InadimplentesScreen({ user, onBack }) {
  const { t } = useTheme();
  return (
    <div style={{ minHeight:"100vh", background:t.pageBg, ...FF }}>
      <div style={{ background:t.header, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 12px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", color:"#94a3b8", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:13, ...FF }}>← Voltar</button>
          <span style={{ color:"#f8fafc", fontWeight:800, fontSize:16 }}>💰 Controle de Inadimplentes</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <DarkToggle />
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Avatar name={user.name} color={user.color||"#6366f1"} size={28} />
            <span style={{ color:"#cbd5e1", fontWeight:500, fontSize:13 }}>{user.name}</span>
          </div>
        </div>
      </div>
      <div style={{ padding:"20px 24px 48px" }}>
        <InadimplentesPanel user={user} isAdmin={false} />
      </div>
    </div>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────

function HomeScreen({ user, onOpenPage, onLogout, onGestao, onPonto, onSatisfacao, onInadimplentes }) {
  const { t } = useTheme();
  const [employees, setEmployees] = useState([]);
  const [pages,     setPages]     = useState([]);
  const [counts,    setCounts]    = useState({});
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [changelog, setChangelog] = useState(() => {
    try { return localStorage.getItem(CHANGELOG_KEY) !== "1"; } catch { return true; }
  });
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem(CHANGELOG_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    (async () => {
      let emps, pgs, tps;
      try { [emps, pgs, tps] = await Promise.all([loadEmployees(), loadPages(), loadTipos()]); }
      catch (e) { console.error("HomeScreen: falha ao carregar dados", e); setLoadError(true); setLoading(false); return; }
      const sorted = [...pgs]
        .filter(p => p.responsibleId === user.id)
        .sort((a,b)=>b.year!==a.year?b.year-a.year:b.month-a.month);
      setEmployees(emps); setPages(sorted);
      setCounts(await contarPaginas(sorted, tps)); setLoading(false);
    })();
  }, []);

  const cur = nowMY();

  return (
    <div style={{ minHeight:"100vh", background:t.pageBg, ...FF }}>

      <div style={{ background:t.header, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 12px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <img src="/logo.png" alt="Logo" style={{ width:28, height:28, objectFit:"contain" }} />
          <span style={{ color:"#f8fafc", fontWeight:800, fontSize:16 }}>Central de Atendimentos</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <button onClick={()=>setChangelog(true)}
            style={{ position:"relative", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", color:"#cbd5e1", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:500, display:"flex", alignItems:"center", gap:7, ...FF }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Novidades
            {!seen && <span style={{ position:"absolute", top:-4, right:-4, width:8, height:8, borderRadius:"50%", background:"#818cf8", border:"2px solid #0f172a" }} />}
          </button>
          <DarkToggle />
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Avatar name={user.name} color={user.color||"#6366f1"} size={30} />
            <span style={{ color:"#cbd5e1", fontWeight:500, fontSize:13 }}>{user.name}</span>
          </div>
          {user.id === "admin" && (
            <button onClick={onGestao} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(96,165,250,0.4)", color:"#93c5fd", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:600, ...FF }}>📊 Gestão</button>
          )}
          {user.acessoInadimplentes && <button onClick={onInadimplentes} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(52,211,153,0.4)", color:"#a7f3d0", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:600, ...FF }}>💰 Inadimplentes</button>}
          <button onClick={onSatisfacao} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(251,191,36,0.4)", color:"#fde68a", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:600, ...FF }}>⭐ Satisfação</button>
          <button onClick={onPonto} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(167,139,250,0.4)", color:"#c4b5fd", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:600, ...FF }}>📄 Ponto</button>
          <button onClick={onLogout} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#94a3b8", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, ...FF }}>Sair</button>
        </div>
      </div>

      <div style={{ padding:"24px 24px 48px" }}>
        <PresenceBar employees={employees} />
        <div style={{ marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:t.text }}>Planilhas de Atendimento</h2>
          <p style={{ margin:"5px 0 0", fontSize:13, color:t.textMuted }}>
            {loadError ? "" : loading ? "Carregando..." : pages.length === 0 ? "Nenhuma planilha atribuída ao seu usuário ainda." : `${pages.length} planilha${pages.length!==1?"s":""} disponíve${pages.length!==1?"is":"l"} — clique para abrir`}
          </p>
        </div>

        {loadError ? <LoadErrorBox /> : loading ? (
          <div style={{ textAlign:"center", padding:80, color:t.textMuted }}>Carregando planilhas...</div>
        ) : pages.length === 0 ? (
          <div style={{ textAlign:"center", padding:80, background:t.card, borderRadius:18, border:`1px dashed ${t.border}` }}>
            <div style={{ fontSize:56, marginBottom:16 }}>📋</div>
            <div style={{ fontSize:18, fontWeight:700, color:t.text, marginBottom:8 }}>Nenhuma planilha disponível</div>
            <div style={{ fontSize:14, color:t.textMuted }}>Nenhuma planilha foi atribuída ao seu usuário ainda.<br />Aguarde ou entre em contato com o administrador.</div>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:16 }}>
            {pages.map(pg => (
              <PageCard key={pg.id} pg={pg} employees={employees} cnt={counts[pg.id]||{total:0,resolved:0,inProgress:0,opAbertos:0}} isCurrentMonth={pg.month===cur.month&&pg.year===cur.year} onClick={()=>onOpenPage(pg, employees)} />
            ))}
          </div>
        )}
      </div>
      {changelog && <ChangelogModal onClose={()=>setChangelog(false)} onDismiss={()=>setSeen(true)} />}
    </div>
  );
}

// ── Page Detail ───────────────────────────────────────────────────────

function PageDetail({ page, initEmployees, user, onBack, onLogout, onSatisfacao }) {
  const { t } = useTheme();
  const [employees, setEmployees] = useState(initEmployees || []);
  const [records,   setRecords]   = useState([]);
  const [tipos,     setTipos]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modal,       setModal]       = useState(null);
  const [confirmId,   setConfirmId]   = useState(null);
  const [satPopup,    setSatPopup]    = useState(false);
  const [agendaModal, setAgendaModal] = useState(null);
  const [alertRecord, setAlertRecord] = useCompromissoAlerta(records);
  const [tipoEdit,    setTipoEdit]    = useState(null);
  const [changelog,   setChangelog]   = useState(false);
  const [seen,        setSeen]        = useState(() => { try { return localStorage.getItem(CHANGELOG_KEY) === "1"; } catch { return false; } });
  const FKEY = `atend_filters_${page.id}`;
  const [filters, setFilters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FKEY) || "{}");
      return { search:"", status:"Todos", tipo:"Todos", via:"Todos", atendente:"Todos", ...saved };
    } catch { return { search:"", status:"Todos", tipo:"Todos", via:"Todos", atendente:"Todos" }; }
  });

  useEffect(() => {
    let unsub;
    (async () => {
      try {
        const [emps, tps] = await Promise.all([loadEmployees(), loadTipos()]);
        setEmployees(emps); setTipos(tps);
      } catch (e) {
        console.error("PageDetail: falha ao carregar dados", e);
        setLoadError(true); setLoading(false);
        return;
      }
      const q = query(collection(db, "records"), where("pageId", "==", page.id));
      unsub = onSnapshot(q, snap => {
        setRecords(snap.docs.map(d => d.data()).sort((a, b) => a.id - b.id));
        setLoading(false);
      }, e => { console.error("PageDetail: falha ao ouvir registros", e); setLoadError(true); setLoading(false); });
    })();
    return () => unsub?.();
  }, [page.id]);

  const addRecord  = async f => {
    try {
      await store.createRecord(db, page.id, f, records.length ? Math.max(...records.map(r=>r.id))+1 : 1);
      setModal(null);
    } catch (e) {
      console.error("addRecord", e);
      window.alert("Não foi possível registrar o atendimento. Verifique a conexão e tente novamente — os dados digitados continuam no formulário.");
    }
  };
  const editRecord = async f => { await setDoc(doc(db,"records",`${page.id}-${f.id}`), {...f, pageId:page.id}); setModal(null); };
  const delRecord  = async () => { await deleteDoc(doc(db,"records",`${page.id}-${confirmId}`)); setConfirmId(null); };
  const togglePrio      = async id => { const r = records.find(x=>x.id===id); if(r) await setDoc(doc(db,"records",`${page.id}-${id}`), {...r, prioridade:!r.prioridade}); };
  const togglePesquisa  = async id => { const r = records.find(x=>x.id===id); if(r) await setDoc(doc(db,"records",`${page.id}-${id}`), {...r, pesquisaEnviada:!r.pesquisaEnviada}); };
  const resolveRecord  = async r => { await setDoc(doc(db,"records",`${page.id}-${r.id}`), {...r, status:"Resolvido", pageId:page.id}); setSatPopup(true); };
  const updateStatus   = async (r, newStatus) => { await setDoc(doc(db,"records",`${page.id}-${r.id}`), {...r, status:newStatus, pageId:page.id}); if (newStatus === "Resolvido") setSatPopup(true); };
  const saveAgenda    = async updated => { await setDoc(doc(db,"records",`${page.id}-${updated.id}`), {...updated, pageId:page.id}); setAgendaModal(null); };
  const saveTipoColor = async tp => { await setDoc(doc(db,"tipos",tp.id), tp); setTipos(prev=>prev.map(x=>x.id===tp.id?tp:x)); };
  const setF = k => v => setFilters(p=>({...p,[k]:v}));
  useEffect(() => {
    const { search:_, ...toSave } = filters;
    localStorage.setItem(FKEY, JSON.stringify(toSave));
  }, [filters]);


  const filtered = records.filter(r => {
    if (filters.search && ![r.cliente,r.descricao,r.contato,r.contato2].some(s=>String(s??"").toLowerCase().includes(filters.search.toLowerCase()))) return false;
    if (filters.status === "Não resolvidos") { if (r.status === "Resolvido") return false; }
    else if (filters.status !== "Todos" && r.status !== filters.status) return false;
    if (filters.tipo      !== "Todos" && r.tipo        !== filters.tipo)      return false;
    if (filters.via       !== "Todos" && r.via !== filters.via && r.via2 !== filters.via) return false;
    if (filters.atendente !== "Todos" && r.atendenteId !== filters.atendente) return false;
    return true;
  });

  const responsible = employees.find(e=>e.id===page.responsibleId);
  const tiposMap = Object.fromEntries(tipos.map(tp => [tp.label, tp]));
  const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const opAbertos = records.filter(r => {
    const tp = tiposMap[r.tipo];
    const isOrgao = norm(tp?.department).includes("orgao") || norm(tp?.department).includes("orgao publico") || norm(r.tipo).includes("orgao");
    return isOrgao && (r.status === "Em atendimento" || r.status === "Pendente");
  }).length;
  const stats = [
    ["Total",          records.length,                                        t.text],
    ["Resolvidos",     records.filter(r=>r.status==="Resolvido").length,      "#16a34a"],
    ["Em Atendimento", records.filter(r=>r.status==="Em atendimento").length, "#d97706"],
    ["Pendentes",      records.filter(r=>r.status==="Pendente").length,       "#dc2626"],
    ["Órgãos Abertos", opAbertos,                                             "#8b5cf6"],
  ];

  const selSt = { padding:"8px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:8, fontSize:13, color:t.inputText, background:t.inputBg, cursor:"pointer", ...FF };

  return (
    <div style={{ minHeight:"100vh", background:t.pageBg, ...FF }}>

      <div style={{ background:t.header, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 12px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", color:"#94a3b8", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:13, ...FF }}>← Planilhas</button>
          <div>
            <div style={{ color:"#f8fafc", fontWeight:700, fontSize:15, lineHeight:1.2 }}>{page.name}</div>
            <div style={{ color:"#64748b", fontSize:11 }}>{fmtMY(page.month, page.year)} · {page.department}</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <button onClick={onSatisfacao} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(251,191,36,0.4)", color:"#fde68a", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:600, ...FF }}>⭐ Satisfação</button>
          <button onClick={()=>setChangelog(true)}
            style={{ position:"relative", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", color:"#cbd5e1", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:500, display:"flex", alignItems:"center", gap:7, ...FF }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Novidades
            {!seen && <span style={{ position:"absolute", top:-4, right:-4, width:8, height:8, borderRadius:"50%", background:"#818cf8", border:"2px solid #0f172a" }} />}
          </button>
          <DarkToggle />
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Avatar name={user.name} color={user.color||"#6366f1"} size={30} />
            <span style={{ color:"#cbd5e1", fontWeight:500, fontSize:13 }}>{user.name}</span>
          </div>
          <button onClick={onLogout} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#94a3b8", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, ...FF }}>Sair</button>
        </div>
      </div>

      <div style={{ background:t.metaBg, borderBottom:`1px solid ${t.metaBorder}`, padding:"10px 24px", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
        <DeptBadge dept={page.department} />
        {responsible && (
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            <span style={{ fontSize:12, color:t.textMuted }}>Responsável:</span>
            <Avatar name={responsible.name} color={responsible.color} size={22} />
            <span style={{ fontSize:13, fontWeight:600, color:t.textSub }}>{responsible.name}</span>
          </div>
        )}
        <span style={{ fontSize:12, color:t.textMuted }}>Criada em {page.createdAt}</span>
      </div>

      <div style={{ padding:"20px 24px 48px" }}>
        <PresenceBar employees={employees} />
        <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
          {stats.map(([l,v,c])=>(
            <div key={l} style={{ background:t.card, border:`1px solid ${t.border}`, borderRadius:14, padding:"12px 18px", minWidth:118 }}>
              <div style={{ fontSize:11, color:t.textMuted, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>{l}</div>
              <div style={{ fontSize:26, fontWeight:800, color:c, lineHeight:1 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ background:t.card, borderRadius:14, border:`1px solid ${t.border}`, padding:"13px 18px", marginBottom:14, display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", position:"sticky", top:58, zIndex:10 }}>
          <input value={filters.search} onChange={e=>setF("search")(e.target.value)} placeholder="🔍  Buscar cliente, descrição ou contato..." style={{ flex:1, minWidth:190, padding:"8px 14px", border:`1.5px solid ${t.inputBorder}`, borderRadius:9, fontSize:13, color:t.inputText, outline:"none", background:t.inputBg, ...FF }} />
          <select value={filters.status}    onChange={e=>setF("status")(e.target.value)}    style={selSt}><option>Todos</option><option>Não resolvidos</option><option>Em atendimento</option><option>Resolvido</option><option>Pendente</option></select>
          <select value={filters.tipo} onChange={e=>setF("tipo")(e.target.value)} style={selSt}>
            <option value="Todos">Todos os tipos</option>
            {tipos.filter(tp=>tp.department===page.department||tp.department==="Geral").map(tp=><option key={tp.id} value={tp.label}>{tp.label}</option>)}
          </select>
          <select value={filters.via}       onChange={e=>setF("via")(e.target.value)}       style={selSt}><option>Todos</option><option>Ticket</option><option>WhatsApp</option><option>Telefone</option><option>Telegram</option></select>
          <select value={filters.atendente} onChange={e=>setF("atendente")(e.target.value)} style={selSt}>
            <option value="Todos">Todos atendentes</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button onClick={()=>setModal({mode:"add"})} style={{ padding:"9px 18px", background:"#6366f1", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", whiteSpace:"nowrap", ...FF }}>
            + Novo Atendimento
          </button>
        </div>

        <div style={{ background:t.card, borderRadius:14, border:`1px solid ${t.border}`, overflow:"hidden" }}>
          {loadError ? <LoadErrorBox /> : loading ? (
            <div style={{ padding:60, textAlign:"center", color:t.textMuted }}>Carregando registros...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:60, textAlign:"center" }}>
              <div style={{ fontSize:44, marginBottom:12 }}>😕</div>
              <div style={{ fontSize:15, fontWeight:600, color:t.text, marginBottom:4 }}>Nenhum registro encontrado</div>
              <div style={{ fontSize:13, color:t.textMuted }}>Ajuste os filtros ou adicione um novo atendimento.</div>
            </div>
          ) : (
            <div style={{ padding:"10px 12px", display:"flex", flexDirection:"column", gap:5 }}>
              {filtered.map(r => (
                <RecordRow
                  key={r.id}
                  r={r}
                  employees={employees}
                  tiposMap={tiposMap}
                  togglePrio={togglePrio}
                  togglePesquisa={togglePesquisa}
                  updateStatus={updateStatus}
                  setModal={setModal}
                  setConfirmId={setConfirmId}
                  setAgendaModal={setAgendaModal}
                  setTipoEdit={setTipoEdit}
                />
              ))}
            </div>
          )}
        </div>
        <div style={{ marginTop:10, color:t.textMuted, fontSize:12, textAlign:"right" }}>
          {filtered.length} de {records.length} registros
        </div>
      </div>

      {modal && <RecordModal record={modal.mode==="edit"?modal.record:null} employees={employees} tipos={tipos} pageDepartment={page.department} pageMonth={page.month} pageYear={page.year} onSave={modal.mode==="edit"?editRecord:addRecord} onClose={()=>setModal(null)} currentUser={user} />}
      {confirmId!==null && <ConfirmDialog message="Este registro será excluído permanentemente." onConfirm={delRecord} onCancel={()=>setConfirmId(null)} />}
      {agendaModal && <AgendaModal record={agendaModal} onSave={saveAgenda} onClose={()=>setAgendaModal(null)} />}
      {tipoEdit    && <TipoColorPanel tipos={tipos} department={page.department} initialTipo={tipoEdit} onSave={tp=>{ saveTipoColor(tp); setTipoEdit(null); }} onClose={()=>setTipoEdit(null)} />}
      {changelog   && <ChangelogModal onClose={()=>setChangelog(false)} onDismiss={()=>setSeen(true)} />}
      {alertRecord && (
        <CompromissoAlerta item={alertRecord} nome={alertRecord.cliente}
          subtitulo={`Via ${alertRecord.via} · ${alertRecord.tipo} · ${alertRecord.data}`}
          onDispensar={()=>setAlertRecord(null)}
          onVer={()=>{ setAgendaModal(alertRecord); setAlertRecord(null); }} />
      )}
      {satPopup && (
        <Overlay z={1100}>
          <div style={{ background:"#fff", borderRadius:20, padding:"32px 36px", maxWidth:360, width:"90%", textAlign:"center", boxShadow:"0 20px 50px rgba(0,0,0,0.25)", ...FF }}>
            <div style={{ fontSize:42, marginBottom:14 }}>📋</div>
            <p style={{ fontSize:16, fontWeight:600, color:"#1e293b", margin:"0 0 24px", lineHeight:1.5 }}>Você já enviou a pesquisa de satisfação?</p>
            <button onClick={()=>setSatPopup(false)} style={{ padding:"11px 40px", background:"#6366f1", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", ...FF }}>OK</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ── Login Screen ──────────────────────────────────────────────────────

function LoginScreen({ onLogin, onAdmin }) {
  const { t } = useTheme();
  const [employees,   setEmployees]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState(null);
  const [pw,          setPw]          = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [error,       setError]       = useState("");
  const [showAdmForm, setShowAdmForm] = useState(false);
  const [admPw,       setAdmPw]       = useState("");
  const [admErr,      setAdmErr]      = useState("");
  const [admModo,     setAdmModo]     = useState(ADMIN_LOGIN_SO_FIREBASE ? "firebase" : "senha");
  const [admEmail,    setAdmEmail]    = useState("");
  const [admOcupado,  setAdmOcupado]  = useState(false);
  const [admAviso,    setAdmAviso]    = useState("");

  const [loadError,   setLoadError]   = useState(false);

  useEffect(() => { loadEmployees().then(e=>{setEmployees(e);setLoading(false);}).catch(e=>{console.error(e);setLoadError(true);setLoading(false);}); }, []);

  const attempt = () => {
    if (!selected) return;
    if (pw === selected.password) onLogin(selected);
    else { setError("Senha incorreta. Tente novamente."); setPw(""); }
  };
  const attemptAdmin = () => {
    if (!ADMIN_CRED) return;
    if (admPw === ADMIN_CRED.password) onAdmin();
    else { setAdmErr("Senha de administrador incorreta."); setAdmPw(""); }
  };
  // Login do admin pelo Firebase: entra na conta e o SERVIDOR confirma se ela é administradora.
  const attemptAdminFirebase = async () => {
    if (admOcupado || !admEmail.trim() || !admPw) return;
    setAdmOcupado(true); setAdmErr(""); setAdmAviso("");
    try {
      const cred = await signInWithEmailAndPassword(auth, admEmail.trim(), admPw);
      const res = await fetch("/api/admin/eu", { headers: { Authorization: `Bearer ${await cred.user.getIdToken()}` } });
      if (!(res.headers.get("content-type") || "").includes("application/json")) {
        await signOut(auth); setAdmErr("O login pelo Firebase só funciona no site publicado (ou com 'vercel dev').");
      } else if (res.ok && (await res.json()).admin) {
        setAdmPw(""); onAdmin();
      } else {
        await signOut(auth); setAdmErr("Esta conta não tem permissão de administrador."); setAdmPw("");
      }
    } catch (e) {
      setAdmErr(ERROS_LOGIN[e?.code] || "Não foi possível entrar. Tente novamente."); setAdmPw("");
    }
    setAdmOcupado(false);
  };
  const esqueciSenha = async () => {
    if (!admEmail.trim()) { setAdmErr("Digite seu e-mail para receber o link de nova senha."); return; }
    setAdmErr(""); setAdmAviso("");
    try { await sendPasswordResetEmail(auth, admEmail.trim()); } catch { /* não revela se o e-mail existe */ }
    setAdmAviso("Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.");
  };

  const dInp = { width:"100%", padding:"9px 12px", border:t.dInpBorder, borderRadius:9, fontSize:14, color:t.dInpText, outline:"none", boxSizing:"border-box", background:t.dInpBg, ...FF };

  return (
    <div style={{ minHeight:"100vh", background:t.loginBg, display:"flex", alignItems:"center", justifyContent:"center", padding:20, ...FF, position:"relative" }}>

      <div style={{ position:"absolute", top:18, right:24 }}>
        <DarkToggle />
      </div>

      <div style={{ width:"100%", maxWidth:520 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ width:72, height:72, borderRadius:20, background:"#0f172a", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px", overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.2)" }}>
            <img src="/logo.png" alt="Logo" style={{ width:52, height:52, objectFit:"contain" }} />
          </div>
          <h1 style={{ color:t.loginText, fontSize:22, fontWeight:800, margin:0, letterSpacing:-0.5 }}>Central de Atendimentos</h1>
          <p style={{ color:t.loginSub, margin:"6px 0 0", fontSize:13.5 }}>Selecione seu perfil para continuar</p>
        </div>

        {loading ? <div style={{ textAlign:"center", color:t.loginSub, padding:40 }}>Carregando...</div>

        : loadError && !showAdmForm ? (
          <>
            <LoadErrorBox />
            <div style={{ textAlign:"center", marginTop:24 }}>
              <button onClick={()=>{setShowAdmForm(true);setAdmErr("");setAdmPw("");}}
                style={{ background:t.loginAdmBg, border:t.loginAdmBorder, color:t.loginAdmText, cursor:"pointer", fontSize:12.5, ...FF, padding:"7px 16px", borderRadius:8 }}>
                ⚙️ Área do Administrador
              </button>
            </div>
          </>
        )

        : !selected && !showAdmForm ? (
          <>
            {employees.length === 0
              ? <div style={{ textAlign:"center", color:t.loginSub, padding:40, background:t.loginCardBg, borderRadius:12, border:t.loginCardBorder }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
                  <p style={{ margin:0, fontSize:14, lineHeight:1.7, color:t.loginText }}>Nenhum atendente cadastrado.<br />Acesse como administrador para criar.</p>
                </div>
              : <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                  {employees.map(emp=>(
                    <button key={emp.id} onClick={()=>{setSelected(emp);setError("");setPw("");}}
                      style={{ background:t.loginEmpBg, border:t.loginEmpBorder, borderRadius:12, padding:"16px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, color:t.loginEmpText, ...FF, transition:"background 0.15s, box-shadow 0.15s", textAlign:"left", outline:"none" }}
                      onMouseEnter={e=>{e.currentTarget.style.background=t.loginEmpBgHover; e.currentTarget.style.boxShadow="0 0 0 2px #6366f1";}}
                      onMouseLeave={e=>{e.currentTarget.style.background=t.loginEmpBg; e.currentTarget.style.boxShadow="none";}}
                    >
                      <Avatar name={emp.name} color={emp.color} size={38} />
                      <span style={{ fontWeight:600, fontSize:14 }}>{emp.name}</span>
                    </button>
                  ))}
                </div>
            }
            <div style={{ textAlign:"center", marginTop:24 }}>
              <button onClick={()=>{setShowAdmForm(true);setAdmErr("");setAdmPw("");}}
                style={{ background:t.loginAdmBg, border:t.loginAdmBorder, color:t.loginAdmText, cursor:"pointer", fontSize:12.5, ...FF, padding:"7px 16px", borderRadius:8, display:"inline-flex", alignItems:"center", gap:6 }}>
                ⚙️ Área do Administrador
              </button>
            </div>
          </>

        ) : showAdmForm ? (
          <div style={{ background:t.loginCardBg, border:t.loginCardBorder, borderRadius:14, padding:"28px 28px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:"#fef3c7", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>⚙️</div>
              <div>
                <div style={{ color:t.loginText, fontWeight:700, fontSize:15 }}>Administrador</div>
                <button onClick={()=>{setShowAdmForm(false);setAdmErr("");}} style={{ background:"none", border:"none", color:t.loginSub, cursor:"pointer", fontSize:12.5, padding:0, ...FF }}>← Voltar</button>
              </div>
            </div>
            {admModo === "firebase" ? (<>
              <Field label="E-mail">
                <input type="email" value={admEmail} onChange={e=>{setAdmEmail(e.target.value);setAdmErr("");}} placeholder="seu@email.com" autoComplete="username" autoFocus style={dInp} />
              </Field>
              <Field label="Senha">
                <input type="password" value={admPw} onChange={e=>{setAdmPw(e.target.value);setAdmErr("");}} onKeyDown={e=>e.key==="Enter"&&attemptAdminFirebase()} placeholder="Digite a senha..." autoComplete="current-password" style={dInp} />
              </Field>
              {admErr && <p style={{ color:"#f87171", fontSize:13, margin:"-8px 0 14px", fontWeight:500 }}>{admErr}</p>}
              {admAviso && <p style={{ color:"#22c55e", fontSize:13, margin:"-8px 0 14px", fontWeight:500 }}>{admAviso}</p>}
              <button onClick={attemptAdminFirebase} disabled={admOcupado} style={{ width:"100%", padding:"11px", background:"#f59e0b", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:14, cursor:admOcupado?"wait":"pointer", opacity:admOcupado?0.7:1, ...FF }}>{admOcupado ? "Entrando…" : "Entrar como Administrador"}</button>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:12, gap:8, flexWrap:"wrap" }}>
                <button onClick={esqueciSenha} style={{ background:"none", border:"none", color:t.loginSub, cursor:"pointer", fontSize:12.5, padding:0, ...FF }}>Esqueci a senha</button>
                {!ADMIN_LOGIN_SO_FIREBASE && <button onClick={()=>{setAdmModo("senha");setAdmErr("");setAdmAviso("");setAdmPw("");}} style={{ background:"none", border:"none", color:t.loginSub, cursor:"pointer", fontSize:12.5, padding:0, ...FF }}>Usar a senha de administrador</button>}
              </div>
            </>) : (<>
              <Field label="Senha de administrador">
                <input type="password" value={admPw} onChange={e=>{setAdmPw(e.target.value);setAdmErr("");}} onKeyDown={e=>e.key==="Enter"&&attemptAdmin()} placeholder="Digite a senha..." autoFocus style={dInp} />
              </Field>
              {admErr && <p style={{ color:"#f87171", fontSize:13, margin:"-8px 0 14px", fontWeight:500 }}>{admErr}</p>}
              <button onClick={attemptAdmin} style={{ width:"100%", padding:"11px", background:"#f59e0b", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer", ...FF }}>Entrar como Administrador</button>
              <div style={{ textAlign:"center", marginTop:12 }}>
                <button onClick={()=>{setAdmModo("firebase");setAdmErr("");setAdmPw("");}} style={{ background:"none", border:"none", color:t.loginSub, cursor:"pointer", fontSize:12.5, padding:0, ...FF }}>Entrar com e-mail (Firebase)</button>
              </div>
            </>)}
          </div>

        ) : (
          <div style={{ background:t.loginCardBg, border:t.loginCardBorder, borderRadius:14, padding:"28px 28px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:22 }}>
              <Avatar name={selected.name} color={selected.color} size={46} />
              <div>
                <div style={{ color:t.loginText, fontWeight:700, fontSize:16 }}>{selected.name}</div>
                <button onClick={()=>{setSelected(null);setPw("");setError("");}} style={{ background:"none", border:"none", color:t.loginSub, cursor:"pointer", fontSize:12.5, padding:0, ...FF }}>← Trocar funcionário</button>
              </div>
            </div>
            <Field label="Senha">
              <div style={{ position:"relative" }}>
                <input type={showPw?"text":"password"} value={pw} onChange={e=>{setPw(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&attempt()} placeholder="Digite sua senha..." autoFocus style={{ ...dInp, paddingRight:44 }} />
                <button onClick={()=>setShowPw(v=>!v)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:t.loginSub, cursor:"pointer", padding:4, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {showPw
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1.2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1.2"/></svg>
                  }
                </button>
              </div>
            </Field>
            {error && <p style={{ color:"#f87171", fontSize:13, margin:"-8px 0 14px", fontWeight:500 }}>{error}</p>}
            <button onClick={attempt} style={{ width:"100%", padding:"11px", background:"#6366f1", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer", ...FF }}>Entrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────

// ── Gestão Comercial helpers ──────────────────────────────────────────

function gcKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function gcFmt(k) {
  const [y, m] = k.split("-");
  return `${MONTHS[+m-1].slice(0,3)}/${y}`;
}
function gcMonths(n = 12) {
  const r = [], d = new Date();
  for (let i = 0; i < n; i++) { r.unshift(gcKey(new Date(d))); d.setMonth(d.getMonth()-1); }
  return r;
}
function gcGetVal(obj, path, key) {
  let cur = obj || {};
  for (const p of path.split(".")) { if (cur[p] == null) return ""; cur = cur[p]; }
  return cur[key] ?? "";
}
function gcSet(obj, path, key, value) {
  const parts = path ? path.split(".") : [];
  const res = { ...obj };
  let cur = res;
  for (const p of parts) { cur[p] = { ...(cur[p] || {}) }; cur = cur[p]; }
  cur[key] = value;
  return res;
}
function gcPct(a, b) {
  return (!a || !b || +b === 0) ? "0.0" : ((+a / +b) * 100).toFixed(1);
}
function gcFmtBRL(val) {
  if (val === "" || val == null) return "";
  const n = parseFloat(String(val));
  if (isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function gcParseBRL(str) {
  const digits = String(str).replace(/\D/g, "");
  if (!digits) return "";
  return String(parseInt(digits, 10) / 100);
}
function gcFmtBRLLive(inputVal) {
  const digits = String(inputVal).replace(/\D/g, "");
  if (!digits) return "";
  return (parseInt(digits, 10) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseTimeToSec(t) {
  const s = String(t || "").trim();
  const m = s.match(/^(\d+):(\d+):(\d+)$/);
  if (m) return +m[1]*3600 + +m[2]*60 + +m[3];
  const n = parseFloat(s); return isNaN(n) ? 0 : Math.round(n);
}
function secToHHMMSS(s) {
  const h = Math.floor(s/3600), mi = Math.floor((s%3600)/60), sec = Math.floor(s%60);
  return `${String(h).padStart(2,"0")}:${String(mi).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function xlTime(val) {
  // Excel stores times as day fractions (e.g. 0.0451 ≈ 65 min); strings come as "HH:MM:SS"
  if (val == null || val === "") return 0;
  if (typeof val === "number") return Math.round(val * 86400);
  return parseTimeToSec(val);
}

// ── Report HTML builder ───────────────────────────────────────────────

// monthsArr: [{ key:"2026-01", label:"Jan/26", data:{...} }, ...]
function buildReportHtml(monthsArr, vendors, collabs, cfg) {
  const { sections } = cfg;
  const MN_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const MN_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const emitDate = new Date().toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
  const year  = monthsArr[0]?.key.split("-")[0] ?? "";
  const periodLabel = monthsArr.length === 1
    ? `${MN_FULL[+monthsArr[0].key.split("-")[1]-1]} ${year}`
    : monthsArr.map(m => MN_SHORT[+m.key.split("-")[1]-1]).join(", ") + " / " + year;

  const mxFn = (d) => {
    const ind=d.indicadores||{}, met=d.metas||{}, ren=ind.renovacao||{},
          vnd=ind.vendas||{}, inad=ind.inadimplencia||{}, leads=ind.leads||{};
    const rT=+ren.totais||0;
    const telGTime = gcGetVal(d,"telefonia.geral","tempoMedio")||"";
    const telATime = gcGetVal(d,"telefonia.administrativo","tempoMedio")||"";
    const telG = +gcGetVal(d,"telefonia.geral","recebidas")||0;
    const telA = +gcGetVal(d,"telefonia.administrativo","recebidas")||0;
    const tmaGSec = telG>0&&telGTime ? Math.round(parseTimeToSec(telGTime)/telG) : 0;
    const tmaASec = telA>0&&telATime ? Math.round(parseTimeToSec(telATime)/telA) : 0;
    const telGSec = parseTimeToSec(telGTime)||0;
    const telASec = parseTimeToSec(telATime)||0;
    return {
      ind, met, ren, vnd, inad, leads, renovTot:rT,
      renovReal: rT>0 ? +((+ren.realizadas||0)/rT*100).toFixed(1) : null,
      churnReal: rT>0 ? +((+ren.canceladas||0)/rT*100).toFixed(1) : null,
      clientesAtivos: +vnd.clientesAtivos||0,
      novasAss: +vnd.novasAss||0,
      novasAssCanceladas: +vnd.novasAssCanceladas||0,
      valorTotalNovas: +vnd.valorTotalNovas||0,
      ticketMedio: (+vnd.novasAss||0)>0 ? (+vnd.valorTotalNovas||0)/(+vnd.novasAss) : null,
      satReal: +met.satReal||0,
      waG: +gcGetVal(d,"indicadores.atenGeral","whatsapp")||0,
      waA: +gcGetVal(d,"indicadores.atenAdm","whatsapp")||0,
      tkG: +gcGetVal(d,"indicadores.atenGeral","tickets")||0,
      tkA: +gcGetVal(d,"indicadores.atenAdm","tickets")||0,
      telG, telA, telGTime, telATime,
      tmaG: tmaGSec>0 ? secToHHMMSS(tmaGSec) : "",
      tmaA: tmaASec>0 ? secToHHMMSS(tmaASec) : "",
      telTotalTime: (telGSec+telASec)>0 ? secToHHMMSS(telGSec+telASec) : "",
    };
  };
  const ms = monthsArr.map(m => ({ ...m, mx: mxFn(m.data) }));

  const fmtBRL = v => { const n=parseFloat(v)||0; return "R$ "+n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}); };
  const tds  = s => `style="padding:7px 10px;border-bottom:1px solid #f1f5f9;${s||""}"`;
  const ths  = s => `style="padding:7px 10px;background:#f8fafc;font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0;${s||""}"`;
  const mColW = ms.length <= 1 ? 200 : ms.length <= 2 ? 160 : ms.length <= 4 ? 135 : 115;
  const mkColgroup = (hasVlbl=false) => `<colgroup>${hasVlbl?`<col style="width:36px">`+`<col/>`:`<col/>`}${ms.map(()=>`<col style="width:${mColW}px">`).join("")}</colgroup>`;
  const thead = first => {
    const cols=ms.map(m=>`<th ${ths("text-align:center;white-space:nowrap")}>${m.label.toUpperCase()}</th>`).join("");
    return `${mkColgroup()}<thead><tr><th ${ths("")}>${first.toUpperCase()}</th>${cols}</tr></thead>`;
  };
  const dPct = (a, b, inv=false) => {
    const na=parseFloat(String(a??0).replace(/[^0-9.-]/g,"")||"0");
    const nb=parseFloat(String(b??0).replace(/[^0-9.-]/g,"")||"0");
    if (!na&&!nb) return ""; if (!na) return "";
    const p=+((nb-na)/Math.abs(na)*100).toFixed(1);
    const ok=inv?p<=0:p>=0;
    const c=Math.abs(p)<0.05?"#94a3b8":ok?"#22c55e":"#ef4444";
    return `<br><span style="font-size:10px;font-weight:700;color:${c}">${p>0?"+":""}${p}%</span>`;
  };
  const compRow = (label, getFn, inv=false, bold=false, noD=false, tip="") => {
    const vals=ms.map((m,i) => {
      const v=getFn(m.mx); const s=(v!=null&&v!=="") ? String(v) : "";
      const d=(!noD&&ms.length>1&&s)?(i===0?`<br><span style="font-size:10px;color:#cbd5e1">-</span>`:dPct(getFn(ms[0].mx),v,inv)):"";
      return `<td ${tds("text-align:center;"+(bold?"font-weight:700;":""))}>${s}${d}</td>`;
    }).join("");
    const tipHtml = tip ? ` <span class="tip" data-tip="${tip}">💬</span>` : "";
    return `<tr><td ${tds("color:#64748b;font-size:12px")}>${label}${tipHtml}</td>${vals}</tr>`;
  };
  const vSection = (lbl, items) => items.map((it,idx) => {
    const vals=ms.map((m,i) => {
      const v=it.fn(m.mx); const s=(v!=null&&v!=="") ? String(v) : "";
      const d=(!it.noD&&ms.length>1&&s)?(i===0?`<br><span style="font-size:10px;color:#cbd5e1">-</span>`:dPct(it.fn(ms[0].mx),v,it.inv||false)):"";
      return `<td ${tds("text-align:center;"+(it.bold?"font-weight:700;":""))}>${s}${d}</td>`;
    }).join("");
    const lTd=`<td ${tds("color:#64748b;font-size:12px")}>${it.label}</td>`;
    return idx===0
      ? `<tr><td rowspan="${items.length}" class="vlbl">${lbl}</td>${lTd}${vals}</tr>`
      : `<tr>${lTd}${vals}</tr>`;
  }).join("");
  const colabThead = () => {
    const cols=ms.map(m=>`<th ${ths("text-align:center;white-space:nowrap")}>${m.label.toUpperCase()}</th>`).join("");
    return `${mkColgroup(true)}<thead><tr><th ${ths("width:36px;padding:4px")}></th><th ${ths("")}>INDICADOR</th>${cols}</tr></thead>`;
  };

  const css = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;font-size:13px;line-height:1.5}.hdr{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;padding:28px 36px 22px}.hdr h1{font-size:28px;font-weight:900;letter-spacing:-.5px}.hdr .sub{font-size:12px;color:#94a3b8;margin-top:5px}.body{max-width:1100px;margin:0 auto;padding:8px 28px 48px}h2{font-size:13px;font-weight:800;color:#0f172a;padding:10px 16px;background:#f8fafc;border-left:4px solid #6366f1;margin:24px 0 0;text-transform:uppercase;letter-spacing:.6px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:0}th{padding:7px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0}.tblwrap{border:1px solid #e2e8f0;border-radius:8px;overflow:visible;margin-bottom:16px;margin-top:1px}.vcard{border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;margin-top:1px}.vcard-hdr{background:#1e293b;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px}.vcard-hdr strong{font-size:14px;font-weight:800}.vcard-hdr .code{font-size:11px;color:#94a3b8}.vlbl{writing-mode:vertical-lr;transform:rotate(180deg);text-align:center;font-size:9px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#94a3b8;background:#f8fafc;padding:8px 4px;border-right:1px solid #e2e8f0;white-space:nowrap;width:36px}.tip{position:relative;cursor:help;display:inline-block;font-size:11px;user-select:none;vertical-align:middle}.tip::after{content:attr(data-tip);position:absolute;left:22px;top:50%;transform:translateY(-50%);background:#1e293b;color:#f1f5f9;padding:10px 14px;border-radius:9px;font-size:11.5px;white-space:pre-line;width:300px;z-index:9999;display:none;line-height:1.7;box-shadow:0 6px 20px rgba(0,0,0,0.4);font-weight:400;pointer-events:none}.tip:hover::after{display:block}@media print{body{font-size:11px}.hdr{-webkit-print-color-adjust:exact;print-color-adjust:exact}.vcard{break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tblwrap{break-inside:avoid}h2{break-after:avoid}.tip{display:none}}`;

  // textos explicativos dos indicadores (visíveis ao passar o mouse no ícone 💬)
  const TIP_NOVA_ASS   = "Lógike Admin → Pedidos Pagos&#10;Período: dia 20 do mês anterior até dia 21 do mês atual&#10;Tipo: Vendedor&#10;Outros filtros → Total pedido ≥ R$ 900,00";
  const TIP_RENOV      = "Lógike Admin → Renovações&#10;Período: mês atual&#10;Status: Todos | Programa: Todos&#10;Tipo: Assin. Programa";
  const TIP_CHURN      = "Lógike Admin → Renovações&#10;Período: mês atual&#10;Status: Canceladas | Programa: Todos&#10;Tipo: Assin. Programa&#10;Cálculo: (canceladas ÷ total de renovações) × 100";
  const TIP_SAT        = "Lógike Admin → Gestão → Pesquisa de Satisfação&#10;Período: mês atual&#10;Respostas, atendente, setor e comentário: Todos";
  const TIP_CLI_ATIVOS = "Lógike Admin → Gestão → Informações Gerenciais&#10;Sem filtro de data&#10;Banco, tipo de cliente e programa: Todos&#10;Nº de acessos: Todos | Assinaturas: Ativas";
  const TIP_VALOR_NOVA = "Lógike Admin → Pedidos Pagos&#10;Período: dia 20 do mês anterior até dia 21 do mês atual&#10;Tipo: Vendedor&#10;Outros filtros → Total pedido ≥ R$ 900,00&#10;Usar o valor total da pesquisa";

  // 1. INDICADORES DO SETOR
  let indSec = "";
  if (sections.metas) {
    indSec = `<h2>Indicadores do Setor</h2><div class="tblwrap"><table>${thead("Indicadores")}<tbody>${[
      compRow("Novas assinaturas",      mx => mx.novasAss||"",                              false, false, false, TIP_NOVA_ASS),
      compRow("Taxa de Renovação",      mx => mx.renovReal!=null?mx.renovReal+"%":"",       false, false, false, TIP_RENOV),
      compRow("Taxa de Churn",          mx => mx.churnReal!=null?mx.churnReal+"%":"",       true,  false, false, TIP_CHURN),
      compRow("Satisfação do Cliente",  mx => mx.satReal?mx.satReal+"%":"",                 false, false, false, TIP_SAT),
    ].join("")}</tbody></table></div>`;
  }

  // 2–5. COMERCIAL / LEADS / RENOVAÇÃO / INADIMPLENTES
  let comSec = "";
  if (sections.comercial) {
    const comRows = [
      compRow("Clientes ativos",                 mx => mx.clientesAtivos||"",                    false, false, false, TIP_CLI_ATIVOS),
      compRow("Novas assinaturas",               mx => mx.novasAss||"",                          false, false, false, TIP_NOVA_ASS),
      compRow("Novas assinaturas Canceladas",     mx => mx.novasAssCanceladas||"",               true),
      compRow("Valor total em novas assinaturas", mx => mx.valorTotalNovas>0?fmtBRL(mx.valorTotalNovas):"", false, false, false, TIP_VALOR_NOVA),
      compRow("Ticket médio Total",               mx => mx.ticketMedio?fmtBRL(mx.ticketMedio):""),
    ].join("");
    const leadsRows = [
      compRow("Total de leads",                mx => mx.leads.totais||""),
      compRow("Leads qualificados",            mx => mx.leads.qualificados||""),
      compRow("Leads convertidos no período",  mx => mx.leads.convertidos||""),
    ].join("");
    const renovRows = [
      compRow("Geradas",     mx => mx.ren.geradas||""),
      compRow("Totais",      mx => mx.renovTot||""),
      compRow("Pagas",       mx => mx.ren.realizadas||""),
      compRow("Canceladas",  mx => mx.ren.canceladas||"", true),
      compRow("Desativadas", mx => mx.ren.desativadas||"", true),
    ].join("");
    const inadRows = [
      compRow("Total",         mx => mx.inad.totais||"", true),
      compRow("Regularizados", mx => mx.inad.regularizadas||""),
      compRow("Em Aberto",     mx => mx.inad.emAberto||"", true),
      compRow("Cancelamentos", mx => mx.inad.canceladas||"", true),
    ].join("");
    comSec = `<h2>Comercial</h2><div class="tblwrap"><table>${thead("Indicadores")}<tbody>${comRows}</tbody></table></div><h2>Leads Trabalhados</h2><div class="tblwrap"><table>${thead("Indicadores")}<tbody>${leadsRows}</tbody></table></div><h2>Renovação</h2><div class="tblwrap"><table>${thead("Indicadores")}<tbody>${renovRows}</tbody></table></div><h2>Inadimplentes</h2><div class="tblwrap"><table>${thead("Indicadores")}<tbody>${inadRows}</tbody></table></div>`;
  }

  // 6–8. ATENDIMENTOS (consolidado / renovação / adm)
  let atenSec = "";
  if (sections.atendimentos) {
    const mkAten = (waFn, tkFn, telFn, timeFn) => [
      compRow("WhatsApp",           waFn),
      compRow("Tickets",            tkFn),
      compRow("Telefone",           telFn),
      compRow("Total em ligações",  timeFn, false, false, true),
    ].join("");
    atenSec =
      `<h2>Atendimentos</h2><div class="tblwrap"><table>${thead("Indicadores")}<tbody>${mkAten(mx=>(mx.waG+mx.waA)||"",mx=>(mx.tkG+mx.tkA)||"",mx=>(mx.telG+mx.telA)||"",mx=>mx.telTotalTime||"")}</tbody></table></div>` +
      `<h2>Atendimentos (Renovação)</h2><div class="tblwrap"><table>${thead("Indicadores")}<tbody>${mkAten(mx=>mx.waG||"",mx=>mx.tkG||"",mx=>mx.telG||"",mx=>mx.telGTime||"")}</tbody></table></div>` +
      `<h2>Atendimentos (Adm &amp; Financeiro)</h2><div class="tblwrap"><table>${thead("Indicadores")}<tbody>${mkAten(mx=>mx.waA||"",mx=>mx.tkA||"",mx=>mx.telA||"",mx=>mx.telATime||"")}</tbody></table></div>`;
  }

  // 9. VENDEDORES
  let vendSec = "";
  if (sections.vendedores) {
    if (!vendors.length) {
      vendSec = `<h2>Vendedores</h2><p style="color:#94a3b8;font-style:italic;padding:12px 0">Nenhum vendedor cadastrado.</p>`;
    } else {
      const vcards = vendors.map(v => {
        const fname=`${v.name}${v.surname?" "+v.surname:""}`;
        const code=v.codigo?`<span class="code">(${v.codigo})</span>`:"";
        const rows=[
          compRow("Venda nova (R$)",        mx => { const d=(mx.ind.vendedores||{})[v.id]||{}; return d.valor?fmtBRL(d.valor):""; }),
          compRow("Cross Venda (R$)",        mx => { const d=(mx.ind.vendedores||{})[v.id]||{}; return d.valorCrossSell?fmtBRL(d.valorCrossSell):""; }),
          compRow("Lead's trabalhados",      mx => { const d=(mx.ind.vendedores||{})[v.id]||{}; return d.leadsTrab||""; }),
          compRow("Lead's desqualificados",  mx => { const d=(mx.ind.vendedores||{})[v.id]||{}; return d.leadsDesq||""; }),
          compRow("Lead's convertidos",      mx => { const d=(mx.ind.vendedores||{})[v.id]||{}; return d.leadsConv||""; }),
          compRow("Ticket médio",            mx => { const d=(mx.ind.vendedores||{})[v.id]||{}; return d.valor&&+d.leadsConv>0?fmtBRL(+d.valor/+d.leadsConv):""; }),
        ].join("");
        return `<div class="vcard"><div class="vcard-hdr"><strong>${fname}</strong>${code}</div><div><table>${thead("Indicadores")}<tbody>${rows}</tbody></table></div></div>`;
      }).join("");
      vendSec = `<h2>Vendedores</h2>${vcards}`;
    }
  }

  // 10–11. ATENDENTES (renovação / adm)
  let colabSec = "";
  if (sections.colaboradores) {
    const renovCollabs = collabs.filter(c => c.dept !== "administrativo");
    const admCollabs   = collabs.filter(c => c.dept === "administrativo");
    const buildCards = list => {
      if (!list.length) return `<p style="color:#94a3b8;font-style:italic;padding:12px 0">Nenhum colaborador neste departamento.</p>`;
      return list.map(c => {
        const fname=`${c.name}${c.surname?" "+c.surname:""}`;
        const pres = vSection("PRESENÇA", [
          {label:"Dias trabalhados",          fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.diasTrab||""; }},
          {label:"Faltas sem justificativas",  fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.faltasSemJust||""; }},
          {label:"Atrasos",                    fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.atrasos||""; }},
          {label:"Atestados",                  fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.atestados||""; }},
          {label:"Saídas autorizadas",         fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.saidasAut||""; }},
          {label:"Férias",                     fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.ferias||""; }},
        ]);
        const atend = vSection("ATENDIMENTOS", [
          {label:"WhatsApp",                        fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.whatsapp||""; }},
          {label:"Tickets",                         fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.tickets||""; }},
          {label:"Telefone",                        fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.telefone||""; }},
          {label:"Pausas",                          fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.pausas||""; }},
          {label:"Tempo médio em ligações",         fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.mediaLigacao||""; }, noD:true},
          {label:"Tempo total em ligações",         fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return d.talkTime||""; }, noD:true},
          {label:"Total de atendimentos",           fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; return ((+d.whatsapp||0)+(+d.tickets||0)+(+d.telefone||0))||""; }, bold:true},
          {label:"Média de atendimento diário",     fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; const t=(+d.whatsapp||0)+(+d.tickets||0)+(+d.telefone||0); return d.diasTrab&&+d.diasTrab>0?(t/+d.diasTrab).toFixed(1):""; }},
          {label:"Média de pausas por dia",         fn: mx => { const d=(mx.ind.colab||{})[c.id]||{}; if(!d.pausaTimeTotal||!d.diasTrab||+d.diasTrab===0) return ""; const s=parseTimeToSec(d.pausaTimeTotal); return s>0?secToHHMMSS(Math.round(s/+d.diasTrab)):""; }, noD:true},
        ]);
        const avaliacoes = ms.map(m => ({ label: m.label, content: ((m.mx.ind.colab)||{})[c.id]?.avaliacao || "" }));
        const hasAval = avaliacoes.some(a => a.content);
        const avalBody = ms.length === 1
          ? `<div style="padding:14px 16px;font-size:13px;line-height:1.8;color:#334155">${avaliacoes[0].content}</div>`
          : `<div style="display:flex">${avaliacoes.map((a, i) => `<div style="flex:1;padding:14px 16px;${i>0?"border-left:1px solid #e2e8f0":""}"><div style="font-size:10px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">${a.label}</div><div style="font-size:13px;line-height:1.8;color:#334155">${a.content||'<em style="color:#94a3b8">Sem avaliação registrada.</em>'}</div></div>`).join("")}</div>`;
        const avalCard = hasAval
          ? `<div style="height:4px"></div><div class="vcard"><div class="vcard-hdr" style="background:#1e3a5f"><strong>📝 Avaliação — ${fname}</strong></div>${avalBody}</div>`
          : "";
        return `<div class="vcard"><div class="vcard-hdr"><strong>${fname}</strong></div><table>${colabThead()}<tbody>${pres}</tbody></table></div><div style="height:4px"></div><div class="vcard"><table>${mkColgroup(true)}<tbody>${atend}</tbody></table></div>${avalCard}`;
      }).join("");
    };
    colabSec = `<h2>Atendentes - Renovação</h2>${buildCards(renovCollabs)}<h2>Atendentes - Adm &amp; Financeiro</h2>${buildCards(admCollabs)}`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório Comercial</title>
<style>${css}</style>
</head>
<body>
<div class="hdr">
  <h1>Relatório <span style="color:#60a5fa">Comercial</span></h1>
  <div class="sub">Período: ${periodLabel} &middot; Emitido em ${emitDate}</div>
</div>
<div class="body">
${indSec}${comSec}${atenSec}${vendSec}${colabSec}
</div>
</body>
</html>`;
}

// ── Gestão Comercial ──────────────────────────────────────────────────

function GestaoComercial({ onBack, onLogout }) {
  const { t, dark, toggle } = useTheme();
  const [curSec,  setCurSec]  = useState("metas");
  const [navHover, setNavHover] = useState(null);
  const [curMonth,setCurMonth]= useState(gcKey());
  const [availYears,setAvailYears] = useState(() => { const y = new Date().getFullYear(); return [y-1, y]; });
  const [vendors, setVendors] = useState([]);
  const [collabs, setCollabs] = useState([]);
  const [md,      setMd]      = useState({});
  const [mdKey,      setMdKey]      = useState(0);
  const [monthsData, setMonthsData] = useState({});
  const [dashHover,  setDashHover]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [gcToast, setGCToast] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCfg, setReportCfg] = useState(() => {
    const now = new Date();
    return { year:now.getFullYear(), months:[now.getMonth()+1], sections:{ metas:true, comercial:true, vendedores:true, atendimentos:true, colaboradores:true } };
  });
  const [indTab,  setIndTab]  = useState("comercial");
  const [addModal,setAddModal]= useState(null);
  const [confDel, setConfDel] = useState(null);
  const [newName,    setNewName]    = useState("");
  const [newSurname, setNewSurname] = useState("");
  const [newDept,    setNewDept]    = useState("geral");
  const [editColab,      setEditColab]      = useState(null);
  const [editData,       setEditData]       = useState({ name:"", surname:"", dept:"geral" });
  const [editVendor,      setEditVendor]      = useState(null);
  const [editVendorData,  setEditVendorData]  = useState({ name:"", surname:"", codigo:"", regime:"clt", comissao:"" });
  const [newVendorSurname,  setNewVendorSurname]  = useState("");
  const [newVendorCodigo,   setNewVendorCodigo]   = useState("");
  const [newVendorRegime,   setNewVendorRegime]   = useState("clt");
  const [newVendorComissao, setNewVendorComissao] = useState("");
  const toastRef   = useRef(null);
  const xlsxRef    = useRef(null);
  const [presenceEmps, setPresenceEmps] = useState([]);

  const curYear     = parseInt(curMonth.split("-")[0]);
  const curMonthNum = parseInt(curMonth.split("-")[1]);

  useEffect(() => {
    if (!availYears.includes(curYear))
      setAvailYears(prev => [...prev, curYear].sort((a,b) => a-b));
  }, [curYear]);

  const showGCToast = msg => {
    setGCToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setGCToast(""), 2200);
  };

  useEffect(() => {
    (async () => {
      const [vs, cs, emps] = await Promise.all([
        getDocs(collection(db, "gc_vendors")),
        getDocs(collection(db, "gc_collabs")),
        loadEmployees().catch(() => []),
      ]);
      setVendors(vs.docs.map(d => d.data()).sort((a,b) => a.name.localeCompare(b.name)));
      setCollabs(cs.docs.map(d => d.data()).sort((a,b) => a.name.localeCompare(b.name)));
      setPresenceEmps(emps);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "gc_months", curMonth));
      setMd(snap.exists() ? snap.data() : {});
      setMdKey(k => k + 1);
    })();
  }, [curMonth]);

  useEffect(() => {
    const [y, mo] = curMonth.split("-").map(Number);
    const keys = [];
    for (let i = -5; i <= 2; i++) {
      const d = new Date(y, mo - 1 + i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (k !== curMonth) keys.push(k);
    }
    Promise.all(keys.map(async k => {
      const snap = await getDoc(doc(db, "gc_months", k));
      return [k, snap.exists() ? snap.data() : null];
    })).then(results => {
      const obj = {};
      results.forEach(([k, data]) => { if (data) obj[k] = data; });
      setMonthsData(obj);
    }).catch(() => {});
  }, [curMonth]);

  const saveField = async (path, key, value) => {
    const newMd = gcSet(md, path, key, value);
    setMd(newMd);
    await setDoc(doc(db, "gc_months", curMonth), newMd);
    showGCToast("✓ Salvo");
  };

  const inp = (extra = {}) => ({
    width: "100%", border: `1.5px solid ${t.border}`, borderRadius: 8,
    padding: "7px 10px", fontSize: 13, color: t.text, background: t.inputBg,
    outline: "none", fontFamily: "inherit", ...extra
  });

  const fld = (path, fkey, label, type = "number") => (
    <div key={`${path}.${fkey}`} style={{ marginBottom: 11 }}>
      <label style={{ display:"block", fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:3, textTransform:"uppercase", letterSpacing:"0.5px" }}>{label}</label>
      <input type={type} defaultValue={gcGetVal(md, path, fkey)} placeholder={type==="number"?"0":""}
        style={inp()} onBlur={e => saveField(path, fkey, e.target.value)} />
    </div>
  );

  const fldCur = (path, fkey, label) => {
    const raw = gcGetVal(md, path, fkey);
    return (
      <div key={`${path}.${fkey}`} style={{ marginBottom: 11 }}>
        <label style={{ display:"block", fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:3, textTransform:"uppercase", letterSpacing:"0.5px" }}>{label}</label>
        <input type="text" defaultValue={raw ? gcFmtBRL(raw) : ""} placeholder="R$ 0,00"
          style={inp()}
          onChange={e => { e.target.value = gcFmtBRLLive(e.target.value); }}
          onBlur={e => saveField(path, fkey, gcParseBRL(e.target.value))} />
      </div>
    );
  };

  const ta = (path, fkey, label, rows = 3) => (
    <div key={`${path}.${fkey}`} style={{ marginBottom: 11 }}>
      <label style={{ display:"block", fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:3, textTransform:"uppercase", letterSpacing:"0.5px" }}>{label}</label>
      <textarea rows={rows} defaultValue={gcGetVal(md, path, fkey)}
        style={inp({ resize:"vertical" })} onBlur={e => saveField(path, fkey, e.target.value)} />
    </div>
  );

  const kpiCard = (val, label, color = t.text) => (
    <div style={{ background:t.card, borderRadius:12, padding:14, textAlign:"center", boxShadow:"0 1px 3px rgba(0,0,0,.08)" }}>
      <div style={{ fontSize:21, fontWeight:700, color }}>{val}</div>
      <div style={{ fontSize:10, color:t.textMuted, marginTop:3, textTransform:"uppercase", letterSpacing:".3px" }}>{label}</div>
    </div>
  );

  const pb = (p, color) => (
    <div style={{ height:7, background:t.border, borderRadius:4, overflow:"hidden", marginTop:5 }}>
      <div style={{ height:"100%", borderRadius:4, transition:"width .3s", width:`${Math.min(+p||0,100)}%`, background:color }} />
    </div>
  );

  const pcol = p => +p >= 100 ? "#22c55e" : +p >= 70 ? "#f59e0b" : "#ef4444";

  const card = (children) => (
    <div style={{ background:t.card, borderRadius:12, padding:18, boxShadow:"0 1px 3px rgba(0,0,0,.08)" }}>
      {children}
    </div>
  );

  const cardH = label => (
    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:13 }}>{label}</div>
  );

  const subH = (label) => (
    <div style={{ fontSize:11, fontWeight:700, color:"#60a5fa", textTransform:"uppercase", letterSpacing:".5px", marginBottom:11, marginTop:4 }}>{label}</div>
  );

  const kpiRow = children => (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))", gap:11, marginBottom:14 }}>{children}</div>
  );

  const cardGrid = children => (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))", gap:14 }}>{children}</div>
  );

  // ── Section renders ────────────────────────────────────────────────

  const renderMetas = () => {
    const d   = md.metas || {};
    const ren = (md.indicadores||{}).renovacao || {};
    const vnd = (md.indicadores||{}).vendas    || {};

    // Auto-calculated "realizado" from Indicadores
    const novasAuto = vnd.novasAss != null ? String(vnd.novasAss) : null;
    const renovTot  = +ren.totais || 0;
    const renovAuto = renovTot > 0 ? ((+ren.realizadas||0) / renovTot * 100).toFixed(1) : null;
    const churnAuto = renovTot > 0 ? ((+ren.canceladas||0) / renovTot * 100).toFixed(1) : null;

    const novasReal = novasAuto ?? d.novasReal;
    const renovReal = renovAuto ?? d.renovReal;
    const churnReal = churnAuto ?? d.churnReal;

    const pn = gcPct(novasReal, d.novasMeta);
    const pr = gcPct(renovReal, d.renovMeta);
    const pc = gcPct(churnReal, d.churnMeta);
    const ps = gcPct(d.satReal, d.satMeta);

    const autoFld = (label, val) => (
      <div style={{ marginBottom:11 }}>
        <label style={{ display:"block", fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:3, textTransform:"uppercase", letterSpacing:"0.5px" }}>{label}</label>
        <div style={{ ...inp(), display:"flex", alignItems:"center", justifyContent:"space-between", background: dark?"rgba(34,197,94,0.08)":"rgba(34,197,94,0.06)", borderColor:"rgba(34,197,94,0.35)", color:t.text, cursor:"default" }}>
          <span style={{ fontWeight:700 }}>{val ?? "—"}</span>
          <span style={{ fontSize:9, fontWeight:700, color:"#22c55e", textTransform:"uppercase", letterSpacing:".5px" }}>auto</span>
        </div>
      </div>
    );

    return (<>
      {kpiRow(<>
        {kpiCard(novasReal||"—", "Novas Assinaturas", "#3b82f6")}
        {kpiCard(renovReal?renovReal+"%":"—", "Taxa de Renovação", +renovReal>=+d.renovMeta&&d.renovMeta?"#22c55e":"#f59e0b")}
        {kpiCard(churnReal?churnReal+"%":"—", "Taxa de Churn", +churnReal<=+d.churnMeta&&d.churnMeta?"#22c55e":"#ef4444")}
        {kpiCard(d.satReal?d.satReal+"%":"—", "Satisfação", +d.satReal>=+d.satMeta&&d.satMeta?"#22c55e":"#f59e0b")}
      </>)}
      {cardGrid(<>
        {card(<>
          {cardH("🆕 Novas Assinaturas")}
          {fld("metas","novasMeta","Meta (qtd)")}
          {autoFld("Realizado (qtd)", novasAuto)}
          {pb(pn,pcol(pn))}
          <div style={{fontSize:11,color:t.textMuted,textAlign:"right",marginTop:3}}>{pn}% atingido</div>
        </>)}
        {card(<>
          {cardH("🔄 Taxa de Renovação (%)")}
          {fld("metas","renovMeta","Meta (%)")}
          {autoFld("Realizado (%)", renovAuto)}
          {pb(pr,pcol(pr))}
          <div style={{fontSize:11,color:t.textMuted,textAlign:"right",marginTop:3}}>{pr}% atingido</div>
        </>)}
        {card(<>
          {cardH("📉 Taxa de Churn (%)")}
          {fld("metas","churnMeta","Meta máx. (%)")}
          {autoFld("Realizado (%)", churnAuto)}
          {pb(pc, d.churnMeta && +churnReal <= +d.churnMeta ? "#22c55e" : "#ef4444")}
          <div style={{fontSize:11,color:d.churnMeta&&+churnReal<=+d.churnMeta?"#22c55e":"#ef4444",textAlign:"right",marginTop:3,fontWeight:600}}>{churnReal||0}% (meta: ≤{d.churnMeta||0}%)</div>
        </>)}
        {card(<>
          {cardH("😊 Satisfação (%)")}
          {fld("metas","satMeta","Meta (%)")}
          {fld("metas","satReal","Realizado (%)")}
          {pb(ps,pcol(ps))}
          <div style={{fontSize:11,color:t.textMuted,textAlign:"right",marginTop:3}}>{ps}% atingido</div>
        </>)}
      </>)}
    </>);
  };

  const renderDash = () => {
    const ind  = md.indicadores || {};
    const ren  = ind.renovacao  || {};
    const vnd  = ind.vendas     || {};
    const met  = md.metas       || {};

    const waG  = +gcGetVal(md,"indicadores.atenGeral","whatsapp")||0;
    const waA  = +gcGetVal(md,"indicadores.atenAdm",  "whatsapp")||0;
    const tkG  = +gcGetVal(md,"indicadores.atenGeral","tickets") ||0;
    const tkA  = +gcGetVal(md,"indicadores.atenAdm",  "tickets") ||0;
    const telG = +gcGetVal(md,"telefonia.geral",          "recebidas")||0;
    const telA = +gcGetVal(md,"telefonia.administrativo", "recebidas")||0;
    const atenTotal = waG+waA+tkG+tkA+telG+telA;

    const renovTot = +ren.totais || 0;
    const renovPct = renovTot > 0 ? +((+ren.realizadas||0)/renovTot*100).toFixed(1) : null;
    const churnPct = renovTot > 0 ? +((+ren.canceladas||0)/renovTot*100).toFixed(1) : null;

    const bar = (val, max, color) => (
      <div style={{ flex:1, background:dark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", borderRadius:4, height:14, overflow:"hidden" }}>
        <div style={{ width: max>0 ? Math.max(3,(val/max)*100)+"%" : "3%", height:"100%", background:color, borderRadius:4, transition:"width .5s" }} />
      </div>
    );

    const ring = (pct, color, size=68) => {
      const r=size*.36, cx=size/2, cy=size/2, circ=2*Math.PI*r;
      const dash=(Math.min(+pct||0,100)/100)*circ;
      return (
        <svg width={size} height={size}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.07)"} strokeWidth={size*.1}/>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size*.1}
            strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ*.25} strokeLinecap="round"/>
          <text x={cx} y={cy+4} textAnchor="middle" fontSize={size*.19} fontWeight="bold" fill={color}>
            {pct!=null?pct+"%":"—"}
          </text>
        </svg>
      );
    };

    const vendorRows = vendors.map(v => {
      const vd = (ind.vendedores||{})[v.id] || {};
      const total = (+vd.valor||0) + (+vd.valorCrossSell||0);
      return { name:`${v.name}${v.surname?" "+v.surname:""}`, total, conv:+vd.leadsConv||0 };
    }).filter(r=>r.total>0).sort((a,b)=>b.total-a.total).slice(0,5);
    const maxVend = Math.max(...vendorRows.map(r=>r.total), 1);

    const maxAten = Math.max(waG,waA,tkG,tkA,telG,telA,1);

    const kpiItem = (label, val, color, sub) => (
      <div style={{ background:t.card, borderRadius:12, padding:"14px 16px", boxShadow:"0 1px 3px rgba(0,0,0,.08)", borderTop:`3px solid ${color}` }}>
        <div style={{ fontSize:9, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:".6px", marginBottom:6 }}>{label}</div>
        <div style={{ fontSize:26, fontWeight:800, color, lineHeight:1, marginBottom:4 }}>{val}</div>
        <div style={{ fontSize:10, color:t.textMuted }}>{sub}</div>
      </div>
    );

    return (<>
      {/* Report button */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
        <button onClick={() => setShowReportModal(true)}
          style={{ padding:"7px 16px", background:"rgba(99,102,241,0.12)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:8, color:"#818cf8", fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
          🖨️ Emitir relatório
        </button>
      </div>
      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        {kpiItem("Novas Assinaturas", vnd.novasAss||"—", "#3b82f6", met.novasMeta?`meta: ${met.novasMeta}`:"sem meta definida")}
        {kpiItem("Taxa de Renovação", renovPct!=null?renovPct+"%":"—", "#22c55e", renovTot?`${ren.realizadas||0} de ${renovTot} totais`:"sem dados")}
        {kpiItem("Taxa de Churn",     churnPct!=null?churnPct+"%":"—", "#ef4444", renovTot?`${ren.canceladas||0} canceladas`:"sem dados")}
        {kpiItem("Total Atendimentos",atenTotal||"—", "#a78bfa", "WA + Tickets + Telefone")}
      </div>

      {/* Charts row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        {card(<>
          {subH("🎧 Atendimentos por Canal")}
          {[
            { dept:"Geral",           items:[{l:"WhatsApp",v:waG,c:"#22c55e"},{l:"Tickets",v:tkG,c:"#3b82f6"},{l:"Telefone",v:telG,c:"#a78bfa"}] },
            { dept:"Adm. & Financeiro",items:[{l:"WhatsApp",v:waA,c:"#22c55e"},{l:"Tickets",v:tkA,c:"#3b82f6"},{l:"Telefone",v:telA,c:"#a78bfa"}] },
          ].map(({ dept, items }) => (
            <div key={dept} style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:6 }}>{dept}</div>
              {items.map(it => (
                <div key={it.l} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                  <span style={{ fontSize:10, color:it.c, minWidth:58, fontWeight:600 }}>{it.l}</span>
                  {bar(it.v, maxAten, it.c)}
                  <span style={{ fontSize:11, fontWeight:700, color:t.text, minWidth:28, textAlign:"right" }}>{it.v}</span>
                </div>
              ))}
            </div>
          ))}
        </>)}

        {card(<>
          {subH("🔄 Renovação")}
          <div style={{ display:"flex", justifyContent:"space-around", marginBottom:14 }}>
            <div style={{ textAlign:"center" }}>
              {ring(renovPct, "#22c55e")}
              <div style={{ fontSize:9, color:t.textMuted, marginTop:4 }}>RENOVAÇÃO</div>
            </div>
            <div style={{ textAlign:"center" }}>
              {ring(churnPct, "#ef4444")}
              <div style={{ fontSize:9, color:t.textMuted, marginTop:4 }}>CHURN</div>
            </div>
          </div>
          {[
            { label:"Totais",     val:renovTot,           color:"#3b82f6" },
            { label:"Realizadas", val:+ren.realizadas||0, color:"#22c55e" },
            { label:"Canceladas", val:+ren.canceladas||0, color:"#ef4444" },
            { label:"Desativadas",val:+ren.desativadas||0,color:"#f59e0b" },
          ].map(row => (
            <div key={row.label} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
              <span style={{ fontSize:10, color:t.textMuted, minWidth:68 }}>{row.label}</span>
              {bar(row.val, Math.max(renovTot,1), row.color)}
              <span style={{ fontSize:11, fontWeight:700, color:row.color, minWidth:28, textAlign:"right" }}>{row.val}</span>
            </div>
          ))}
        </>)}
      </div>

      {/* Top Vendedores */}
      {vendorRows.length > 0 && card(<>
        {subH("💼 Top Vendedores por Valor")}
        {vendorRows.map((r,i) => (
          <div key={r.name} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:800, color:t.textMuted, minWidth:16 }}>{i+1}</span>
            <span style={{ fontSize:12, color:t.text, minWidth:130 }}>{r.name}</span>
            {bar(r.total, maxVend, "#f59e0b")}
            <span style={{ fontSize:11, fontWeight:700, color:"#f59e0b", minWidth:88, textAlign:"right" }}>
              {r.total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
            </span>
          </div>
        ))}
      </>)}

      {/* Comparativo Mensal */}
      {(() => {
        const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        const [cy, cmo] = curMonth.split("-").map(Number);
        const allMonths = [];
        for (let i = -5; i <= 2; i++) {
          const d = new Date(cy, cmo - 1 + i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          allMonths.push({ key, label: MONTHS[d.getMonth()], current: key === curMonth });
        }
        const chartMonths = allMonths.filter(m => m.current || monthsData[m.key]);
        if (chartMonths.length < 2) return null;

        const mMetrics = (key) => {
          const mData = key === curMonth ? md : (monthsData[key] || {});
          const ind = mData.indicadores || {};
          const ren = ind.renovacao || {};
          const vnd = ind.vendas || {};
          const rT = +ren.totais || 0;
          return {
            novas: +vnd.novasAss || 0,
            renov: rT > 0 ? +((+ren.realizadas||0)/rT*100).toFixed(1) : 0,
            churn: rT > 0 ? +((+ren.canceladas||0)/rT*100).toFixed(1) : 0,
            aten:  (+gcGetVal(mData,"indicadores.atenGeral","whatsapp")||0)+
                   (+gcGetVal(mData,"indicadores.atenAdm","whatsapp")||0)+
                   (+gcGetVal(mData,"indicadores.atenGeral","tickets")||0)+
                   (+gcGetVal(mData,"indicadores.atenAdm","tickets")||0)+
                   (+gcGetVal(mData,"telefonia.geral","recebidas")||0)+
                   (+gcGetVal(mData,"telefonia.administrativo","recebidas")||0),
            sat:     +(mData.metas?.satReal  || 0),
            satMeta: +(mData.metas?.satMeta  || 0),
          };
        };

        const bez = (pts) => {
          if (pts.length < 2) return `M${pts[0]?.x},${pts[0]?.y}`;
          let d = `M${pts[0].x},${pts[0].y}`;
          for (let i=1;i<pts.length;i++) {
            const cx=(pts[i-1].x+pts[i].x)/2;
            d+=` C${cx},${pts[i-1].y} ${cx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
          }
          return d;
        };

        const mkSeries = (metric) => chartMonths.map(m => ({ val: mMetrics(m.key)[metric], label: m.label, current: m.current }));

        const trend = (series) => {
          const ci = series.findIndex(s=>s.current);
          const cv = series[ci]?.val??0, pv = ci>0?series[ci-1].val:null;
          if (pv===null||pv===0) return null;
          const d=(((cv-pv)/pv)*100).toFixed(1);
          return { pct:Math.abs(d), up:cv>=pv };
        };

        // ── Multi-line chart (Renovação vs Churn) ──────────────────────
        const multiLineChart = ({ seriesDef, suffix="", cKey }) => {
          const months = seriesDef[0].data;
          if (months.length < 2) return null;
          const W=400, H=110, pL=34, pR=10, pT=10, pB=26;
          const cW=W-pL-pR, cH=H-pT-pB;
          const allVals = seriesDef.flatMap(s=>s.data.map(d=>d.val));
          const rawMax = Math.max(...allVals,1);
          const step = rawMax<=10?2:rawMax<=50?10:rawMax<=100?20:50;
          const maxVal = Math.ceil(rawMax/step)*step || step;
          const xStep = months.length>1 ? cW/(months.length-1) : cW;
          const toX = i => pL+i*xStep;
          const toY = v => pT+cH-(v/maxVal)*cH;
          const yTicks = [];
          for (let v=0;v<=maxVal;v+=step) yTicks.push(v);
          const hovX = dashHover?.cKey===cKey ? dashHover.xIdx : null;

          return (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible" }}>
              {/* Y grid + labels */}
              {yTicks.map(v=>(
                <g key={v}>
                  <line x1={pL} y1={toY(v)} x2={W-pR} y2={toY(v)}
                    stroke={dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.04)"} strokeDasharray="3 4" strokeWidth={0.8} vectorEffect="non-scaling-stroke"/>
                  <text x={pL-6} y={toY(v)+3.5} textAnchor="end" fontSize="9" fill="#64748b">{v}</text>
                </g>
              ))}

              {/* Hover hit columns */}
              {months.map((m,i)=>(
                <rect key={i} x={toX(i)-xStep*0.5} y={pT} width={xStep} height={cH}
                  fill="transparent" style={{cursor:"crosshair"}}
                  onMouseEnter={()=>setDashHover({cKey,xIdx:i})}
                  onMouseLeave={()=>setDashHover(null)}/>
              ))}

              {/* Vertical hover line */}
              {hovX!=null && <line x1={toX(hovX)} y1={pT} x2={toX(hovX)} y2={pT+cH}
                stroke={dark?"rgba(255,255,255,0.18)":"rgba(0,0,0,0.12)"} strokeWidth={1} strokeDasharray="4 3"/>}

              {/* Series lines */}
              {seriesDef.map((s,si)=>{
                const pts=s.data.map((d,i)=>({...d,x:toX(i),y:toY(d.val)}));
                return <path key={si} d={bez(pts)} fill="none" stroke={s.color} strokeWidth={1}
                  strokeDasharray={s.dashed?"7 4":undefined} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>;
              })}

              {/* Dots */}
              {seriesDef.map((s,si)=>
                s.data.map((d,i)=>{
                  const x=toX(i), y=toY(d.val), isCur=d.current, isHov=hovX===i;
                  return (
                    <g key={`${si}-${i}`}>
                      {isCur && <circle cx={x} cy={y} r={8} fill={s.color} opacity={0.1}/>}
                      {isHov && !isCur && <circle cx={x} cy={y} r={6} fill={s.color} opacity={0.12}/>}
                      <circle cx={x} cy={y} r={isCur?3:isHov?2.5:2}
                        fill={isCur||isHov?s.color:(dark?"#1a2640":"#f1f5f9")}
                        stroke={s.color} strokeWidth={1} vectorEffect="non-scaling-stroke"/>
                    </g>
                  );
                })
              )}

              {/* Hover tooltip */}
              {hovX!=null && (()=>{
                const tx=Math.max(52,Math.min(W-52,toX(hovX)));
                const vals=seriesDef.map(s=>({color:s.color,label:s.label,val:s.data[hovX]?.val??0}));
                const bH=vals.length*14+16;
                return (
                  <g style={{pointerEvents:"none"}}>
                    <rect x={tx-40} y={pT+2} width={80} height={bH} rx={5}
                      fill={dark?"#0f1e35":"#1e293b"} opacity={0.93}/>
                    <text x={tx} y={pT+13} textAnchor="middle" fontSize="7.5" fill="#94a3b8" fontWeight="700">
                      {months[hovX]?.label}
                    </text>
                    {vals.map((v,vi)=>(
                      <text key={vi} x={tx} y={pT+13+(vi+1)*14} textAnchor="middle" fontSize="8" fill={v.color} fontWeight="700">
                        {v.label}: {v.val}{suffix}
                      </text>
                    ))}
                  </g>
                );
              })()}

              {/* X labels */}
              {months.map((m,i)=>(
                <text key={i} x={toX(i)} y={H-2} textAnchor="middle" fontSize="9"
                  fill={m.current?(dark?"#e2e8f0":"#1e293b"):"#64748b"}
                  fontWeight={m.current?"bold":"normal"}>{m.label}</text>
              ))}
            </svg>
          );
        };

        // ── Sparkline (single metric) ──────────────────────────────────
        const spark = (data, color, suffix, cKey) => {
          if (data.every(d=>d.val===0)) return (
            <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",color:t.textMuted,fontSize:11}}>Sem dados</div>
          );
          const W=260, H=52, pL=8, pR=8, pT=16, pB=18;
          const cW=W-pL-pR, cH=H-pT-pB;
          const max=Math.max(...data.map(d=>d.val),1);
          const xStep=data.length>1?cW/(data.length-1):0;
          const pts=data.map((d,i)=>({...d,x:pL+i*xStep,y:pT+cH-(d.val/max)*cH}));
          const linePath=bez(pts);
          const areaPath=linePath+` L${pts[pts.length-1].x},${pT+cH} L${pts[0].x},${pT+cH} Z`;
          const gId=`sg-${cKey}`;
          const hovX=dashHover?.cKey===cKey?dashHover.xIdx:null;
          return (
            <svg width="100%" viewBox={`0 0 ${W} ${H+2}`} style={{overflow:"visible"}}>
              <defs>
                <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.22"/>
                  <stop offset="100%" stopColor={color} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {[0.33,0.66].map(f=>(
                <line key={f} x1={pL} y1={pT+cH*(1-f)} x2={W-pR} y2={pT+cH*(1-f)}
                  stroke={dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.04)"} strokeDasharray="3 4" strokeWidth={0.8} vectorEffect="non-scaling-stroke"/>
              ))}
              <path d={areaPath} fill={`url(#${gId})`}/>
              <path d={linePath} fill="none" stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
              {pts.map((p,i)=>{
                const isHov=hovX===i, isCur=p.current;
                const tx=Math.max(26,Math.min(W-26,p.x));
                return (
                  <g key={i} style={{cursor:"crosshair"}}
                    onMouseEnter={()=>setDashHover({cKey,xIdx:i})}
                    onMouseLeave={()=>setDashHover(null)}>
                    {isCur&&<circle cx={p.x} cy={p.y} r={8} fill={color} opacity={0.1}/>}
                    {isHov&&!isCur&&<circle cx={p.x} cy={p.y} r={6} fill={color} opacity={0.12}/>}
                    <circle cx={p.x} cy={p.y} r={isCur?3:isHov?2.5:2}
                      fill={isCur||isHov?color:(dark?"#1a2640":"#f1f5f9")}
                      stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke"/>
                    {isHov&&(
                      <g style={{pointerEvents:"none"}}>
                        <rect x={tx-18} y={p.y-28} width={36} height={14} rx={4} fill={dark?"#0f1e35":"#1e293b"} opacity={0.93}/>
                        <polygon points={`${tx-4},${p.y-14} ${tx+4},${p.y-14} ${tx},${p.y-7}`} fill={dark?"#0f1e35":"#1e293b"} opacity={0.93}/>
                        <text x={tx} y={p.y-18} textAnchor="middle" fontSize="7" fontWeight="700" fill={color}>{p.val}{suffix}</text>
                      </g>
                    )}
                    {isCur&&!isHov&&<text x={p.x} y={p.y-12} textAnchor="middle" fontSize="9" fill={color} fontWeight="800">{p.val}{suffix}</text>}
                    <text x={p.x} y={H+2} textAnchor="middle" fontSize="7.5"
                      fill={isCur?color:"#64748b"} fontWeight={isCur?"bold":"normal"}>{p.label}</text>
                  </g>
                );
              })}
            </svg>
          );
        };

        const sparkCard = (ch) => {
          const tr=trend(ch.series);
          const currVal=ch.series.find(s=>s.current)?.val;
          return (
            <div key={ch.key} style={{borderRadius:12,padding:"14px 16px",background:dark?"rgba(255,255,255,0.03)":"#f8fafc",border:`1px solid ${t.border}`,borderTop:`3px solid ${ch.color}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:10,fontWeight:700,color:t.textMuted,textTransform:"uppercase",letterSpacing:".5px"}}>{ch.title}</span>
                {tr&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:tr.up?"rgba(34,197,94,0.15)":"rgba(239,68,68,0.15)",color:tr.up?"#22c55e":"#ef4444"}}>{tr.up?"▲":"▼"} {tr.pct}%</span>}
              </div>
              <div style={{fontSize:22,fontWeight:800,color:ch.color,lineHeight:1,marginBottom:8}}>{currVal??"—"}{ch.suffix}</div>
              {spark(ch.series,ch.color,ch.suffix,ch.key)}
            </div>
          );
        };

        return (
          <div style={{marginTop:14}}>
            <div style={{background:t.card,borderRadius:14,padding:"20px 22px",boxShadow:"0 1px 3px rgba(0,0,0,.08)"}}>
              {subH("📅 Comparativo Mensal")}

              {/* Row 1: Renovação vs Churn  |  Satisfação vs Meta */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                {[
                  { cKey:"renov-churn", title:"Renovação vs Churn", suffix:"%", seriesDef:[
                    { label:"Renovação%", color:"#22c55e", dashed:false, data:mkSeries("renov") },
                    { label:"Churn%",     color:"#ef4444", dashed:true,  data:mkSeries("churn") },
                  ]},
                  { cKey:"sat-meta", title:"Satisfação do Cliente", suffix:"%", seriesDef:[
                    { label:"Satisfação%", color:"#f59e0b", dashed:false, data:mkSeries("sat")     },
                    { label:"Meta%",       color:"#64748b", dashed:true,  data:mkSeries("satMeta") },
                  ]},
                ].map(cfg => (
                  <div key={cfg.cKey} style={{background:dark?"rgba(255,255,255,0.03)":"rgba(248,250,252,1)",borderRadius:12,padding:"12px 14px",border:`1px solid ${t.border}`}}>
                    <div style={{fontSize:10,fontWeight:700,color:t.textMuted,textTransform:"uppercase",letterSpacing:".7px",marginBottom:8}}>{cfg.title}</div>
                    {multiLineChart({ cKey:cfg.cKey, suffix:cfg.suffix, seriesDef:cfg.seriesDef })}
                    <div style={{display:"flex",justifyContent:"center",gap:18,marginTop:8}}>
                      {cfg.seriesDef.map(s=>(
                        <div key={s.label} style={{display:"flex",alignItems:"center",gap:6}}>
                          <svg width="22" height="10">
                            <line x1="0" y1="5" x2="22" y2="5" stroke={s.color} strokeWidth="1" strokeDasharray={s.dashed?"7 4":undefined}/>
                            <circle cx="11" cy="5" r="3" fill={s.color}/>
                          </svg>
                          <span style={{fontSize:10,color:t.textMuted}}>{s.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Row 2: Novas Assinaturas + Total Atendimentos sparklines */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                {[
                  {title:"Novas Assinaturas", key:"novas", series:mkSeries("novas"), color:"#3b82f6", suffix:""},
                  {title:"Total Atendimentos",key:"aten",  series:mkSeries("aten"),  color:"#a78bfa", suffix:""},
                ].map(sparkCard)}
              </div>
            </div>
          </div>
        );
      })()}
    </>);
  };

  const renderFunil = () => {
    const d = md.funil || {};
    const tq = gcPct(d.leadQual, d.leads);
    const tc = gcPct(d.leadConv, d.leads);
    return (<>
      {kpiRow(<>
        {kpiCard(d.leads||0, "Total de Leads", "#3b82f6")}
        {kpiCard(d.leadQual||0, "Leads Qualificados", "#f59e0b")}
        {kpiCard(d.leadConv||0, "Leads Convertidos", "#22c55e")}
        {kpiCard(tc+"%", "Taxa de Conversão", +tc>=20?"#22c55e":+tc>=10?"#f59e0b":"#ef4444")}
      </>)}
      {cardGrid(<>
        {card(<>{cardH("📊 Funil")}{fld("funil","leads","Total de Leads")}{fld("funil","leadQual","Leads Qualificados")}{fld("funil","leadConv","Leads Convertidos")}</>)}
        {card(<>
          {cardH("🔄 Taxas de Conversão")}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
              <span style={{color:t.textSub}}>Leads → Qualificados</span><strong style={{color:t.text}}>{tq}%</strong>
            </div>{pb(tq,"#f59e0b")}
          </div>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
              <span style={{color:t.textSub}}>Leads → Convertidos</span><strong style={{color:t.text}}>{tc}%</strong>
            </div>{pb(tc,"#22c55e")}
          </div>
        </>)}
      </>)}
    </>);
  };

  const renderInad = () => {
    const d = md.inadimplencia || {};
    return (<>
      {kpiRow(<>
        {kpiCard("R$ "+parseFloat(d.aberto||0).toLocaleString("pt-BR",{minimumFractionDigits:0}), "Total em Aberto", "#ef4444")}
        {kpiCard(d.vencidas||0, "Parcelas Vencidas", "#f59e0b")}
        {kpiCard(d.acordos||0, "Acordos Realizados", "#3b82f6")}
        {kpiCard("R$ "+parseFloat(d.baixas||0).toLocaleString("pt-BR",{minimumFractionDigits:0}), "Baixas do Mês", "#22c55e")}
      </>)}
      {cardGrid(<>
        {card(<>{cardH("⚠️ Inadimplência")}{fld("inadimplencia","aberto","Total em Aberto (R$)")}{fld("inadimplencia","vencidas","Parcelas Vencidas (qtd)")}{fld("inadimplencia","acordos","Acordos Realizados (qtd)")}{fld("inadimplencia","baixas","Baixas do Mês (R$)")}</>)}
        {card(<>{cardH("📋 Observações")}{ta("inadimplencia","obs","Notas do mês",5)}</>)}
      </>)}
    </>);
  };

  const renderIndicadores = () => {
    const d = md.indicadores || {};

    const ticketMedio = d.vendas?.novasAss && d.vendas?.valorTotalNovas
      ? (parseFloat(d.vendas.valorTotalNovas) / parseFloat(d.vendas.novasAss)).toFixed(2)
      : null;

    const secH = (label) => (
      <div style={{ fontSize:14, fontWeight:800, color:t.text, margin:"24px 0 14px", paddingBottom:8, borderBottom:`2px solid ${t.border}`, textTransform:"uppercase", letterSpacing:".8px" }}>{label}</div>
    );

    const colabCard = (c, headerColor) => {
      const cd = ((d.colab)||{})[c.id] || {};
      const initials = c.name.split(" ").filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join("");
      const atendAuto = (+cd.whatsapp||0) + (+cd.tickets||0) + (+cd.telefone||0);
      const mediaAuto = cd.diasTrab && +cd.diasTrab > 0 ? (atendAuto / +cd.diasTrab).toFixed(1) : "—";
      const mediaPausaAuto = (() => {
        if (!cd.pausaTimeTotal || !cd.diasTrab || +cd.diasTrab === 0) return null;
        const secs = parseTimeToSec(cd.pausaTimeTotal);
        return secs > 0 ? secToHHMMSS(Math.round(secs / +cd.diasTrab)) : null;
      })();
      const deptLabel = c.dept === "administrativo" ? "Adm. & Financeiro" : "Geral";
      const inpEdit = { border:"1px solid rgba(255,255,255,0.3)", borderRadius:6, padding:"5px 8px", fontSize:12, color:"#fff", background:"rgba(255,255,255,0.12)", fontFamily:"inherit", outline:"none", width:"100%" };
      return (
        <div key={c.id} style={{ background:t.card, borderRadius:12, boxShadow:"0 2px 8px rgba(0,0,0,.10)", overflow:"hidden" }}>
          {/* Header */}
          {editColab === c.id ? (
            <div style={{ padding:"14px 16px", background:headerColor }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:7 }}>
                <input type="text" value={editData.name} onChange={e => setEditData(p=>({...p,name:e.target.value}))} placeholder="Nome" style={inpEdit} />
                <input type="text" value={editData.surname} onChange={e => setEditData(p=>({...p,surname:e.target.value}))} placeholder="Sobrenome" style={inpEdit} />
              </div>
              <select value={editData.dept} onChange={e => setEditData(p=>({...p,dept:e.target.value}))}
                style={{ ...inpEdit, marginBottom:9 }}>
                <option value="geral">Departamento Geral</option>
                <option value="administrativo">Adm. & Financeiro</option>
              </select>
              <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                <button onClick={() => setEditColab(null)}
                  style={{ background:"rgba(255,255,255,0.12)", color:"#fff", border:"1px solid rgba(255,255,255,0.2)", borderRadius:6, padding:"4px 12px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>Cancelar</button>
                <button onClick={async () => {
                  const fullName = (editData.name.trim()+" "+editData.surname.trim()).trim();
                  if (!fullName) return;
                  const updated = { ...c, name:fullName, dept:editData.dept };
                  await setDoc(doc(db,"gc_collabs",c.id), updated);
                  setCollabs(prev => prev.map(x => x.id===c.id ? updated : x).sort((a,b)=>a.name.localeCompare(b.name)));
                  setEditColab(null);
                  showGCToast("✓ Salvo");
                }} style={{ background:"#22c55e", color:"#fff", border:"none", borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Salvar</button>
              </div>
            </div>
          ) : (
            <div style={{ padding:"14px 16px", background:headerColor, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:"50%", background:"rgba(255,255,255,0.18)", border:"2px solid rgba(255,255,255,0.35)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800, color:"#fff", flexShrink:0, letterSpacing:".5px" }}>{initials}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, color:"#fff", lineHeight:1.2 }}>{c.name}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.65)", textTransform:"uppercase", letterSpacing:".6px", marginTop:2 }}>{deptLabel}</div>
              </div>
              <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                <button onClick={() => {
                  const parts = c.name.trim().split(" ");
                  setEditData({ name:parts[0]||"", surname:parts.slice(1).join(" ")||"", dept:c.dept||"geral" });
                  setEditColab(c.id);
                }} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", color:"#fff", fontSize:12 }}>✏️</button>
                <button onClick={() => setConfDel({ type:"collab", id:c.id, name:c.name })}
                  style={{ background:"rgba(239,68,68,.25)", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", color:"#fca5a5", fontSize:12 }}>🗑️</button>
              </div>
            </div>
          )}
          {/* KPI chips */}
          <div style={{ display:"flex", gap:6, padding:"10px 12px", background: dark ? "rgba(0,0,0,0.15)" : "#f1f5f9", borderBottom:`1px solid ${t.border}` }}>
            {[
              { label:"Atend. Totais", val: atendAuto > 0 ? atendAuto : "—", color:"#3b82f6", sub:"WA+TK+TEL" },
              { label:"Média/dia",     val: mediaAuto,                        color:"#22c55e", sub:"total÷dias" },
              { label:"Pausa/dia",     val: mediaPausaAuto || "—",            color:"#f59e0b", sub:"pausaT÷dias" },
            ].map(chip => (
              <div key={chip.label} style={{ flex:1, textAlign:"center", padding:"7px 4px", background:t.card, borderRadius:8, border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:8, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:3 }}>{chip.label}</div>
                <div style={{ fontSize:18, fontWeight:800, color:chip.color, lineHeight:1 }}>{chip.val}</div>
                <div style={{ fontSize:8, color:t.textMuted, marginTop:2 }}>auto · {chip.sub}</div>
              </div>
            ))}
          </div>
          {/* Body */}
          <div style={{ padding:"14px 16px" }}>
            {subH("📅 Presença")}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 12px" }}>
              {fld("indicadores.colab."+c.id,"diasTrab","Dias Trabalhados")}
              {fld("indicadores.colab."+c.id,"faltasSemJust","Faltas s/ Just.")}
              {fld("indicadores.colab."+c.id,"atrasos","Atrasos")}
              {fld("indicadores.colab."+c.id,"atestados","Atestados")}
              {fld("indicadores.colab."+c.id,"saidasAut","Saídas Aut.")}
              {fld("indicadores.colab."+c.id,"ferias","Férias (dias)")}
            </div>
            {subH("📊 Performance")}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 12px" }}>
              {fld("indicadores.colab."+c.id,"whatsapp","WhatsApp")}
              {fld("indicadores.colab."+c.id,"tickets","Tickets")}
              {fld("indicadores.colab."+c.id,"telefone","Telefone")}
              {fld("indicadores.colab."+c.id,"pausas","Pausas (qtd)")}
              {fld("indicadores.colab."+c.id,"mediaLigacao","Média em Ligação (AHT)","text")}
              {fld("indicadores.colab."+c.id,"talkTime","Tempo Total em Ligações","text")}
            </div>
            {/* Avaliação Individual */}
            <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${t.border}` }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:7 }}>📝 Avaliação Individual</div>
              <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                {[
                  { label:"N", title:"Normal",          cmd:null },
                  { label:"B", title:"Negrito",         cmd:"bold",          s:{ fontWeight:"bold" } },
                  { label:"I", title:"Itálico",         cmd:"italic",        s:{ fontStyle:"italic" } },
                  { label:"S", title:"Sublinhado",      cmd:"underline",     s:{ textDecoration:"underline" } },
                  { label:"T", title:"Tachado",         cmd:"strikeThrough", s:{ textDecoration:"line-through" } },
                ].map(({ label, title, cmd, s }) => (
                  <button key={label} title={title}
                    onMouseDown={e => {
                      e.preventDefault();
                      if (!cmd) { document.execCommand("removeFormat", false, null); return; }
                      document.execCommand(cmd, false, null);
                    }}
                    style={{ ...(s||{}), background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:5, padding:"3px 9px", cursor:"pointer", fontSize:12, color:t.text, fontFamily:"inherit", minWidth:28 }}>
                    {label}
                  </button>
                ))}
              </div>
              <div
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: cd.avaliacao || "" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#3b82f6"; }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = t.border;
                  saveField("indicadores.colab."+c.id, "avaliacao", e.currentTarget.innerHTML);
                }}
                style={{ minHeight:80, border:`1.5px solid ${t.border}`, borderRadius:8, padding:"8px 10px", fontSize:13, color:t.text, background:t.inputBg, outline:"none", lineHeight:1.6, transition:"border-color .15s" }}
              />
            </div>
          </div>
        </div>
      );
    };

    const geralCollabs = collabs.filter(c => c.dept === "geral");
    const admCollabs   = collabs.filter(c => c.dept === "administrativo");

    const indTabs = [
      { key:"comercial",    label:"Comercial",      icon:"🏢" },
      { key:"atendimentos", label:"Atendimentos",   icon:"🎧" },
      { key:"vendedores",   label:"Vendedores",     icon:"💼" },
      { key:"colaboradores",label:"Colaboradores",  icon:"👥" },
    ];

    return (
      <>
        {/* ── TAB BAR ───────────────────────────────── */}
        <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:`2px solid ${t.border}`, paddingBottom:0 }}>
          {indTabs.map(tab => {
            const active = indTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setIndTab(tab.key)} style={{
                padding:"9px 18px", border:"none", cursor:"pointer", fontFamily:"inherit",
                fontSize:13, fontWeight: active ? 700 : 500,
                color: active ? "#3b82f6" : t.textMuted,
                background:"transparent",
                borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
                marginBottom:"-2px", borderRadius:"6px 6px 0 0",
                transition:"color .15s",
              }}>{tab.icon} {tab.label}</button>
            );
          })}
        </div>

        {/* ── COMERCIAL ─────────────────────────────── */}
        {indTab === "comercial" && cardGrid(<>
          {card(<>
            {subH("💰 Vendas")}
            {fld("indicadores.vendas","clientesAtivos","Clientes Ativos")}
            {fld("indicadores.vendas","novasAss","Novas Assinaturas")}
            {fld("indicadores.vendas","novasAssCanceladas","Novas Assinaturas Canceladas")}
            {fldCur("indicadores.vendas","valorTotalNovas","Valor Total em Novas Assinaturas (R$)")}
            <div style={{ marginTop:10, padding:"10px 12px", background:t.pageBg, borderRadius:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:4 }}>Ticket Médio Total (automático)</div>
              <div style={{ fontSize:20, fontWeight:700, color:"#3b82f6" }}>
                {ticketMedio ? "R$ "+parseFloat(ticketMedio).toLocaleString("pt-BR",{minimumFractionDigits:2}) : "—"}
              </div>
            </div>
          </>)}
          {card(<>
            {subH("🔄 Renovação")}
            {fld("indicadores.renovacao","geradas","Renovações Geradas")}
            {fld("indicadores.renovacao","totais","Renovações Totais")}
            {fld("indicadores.renovacao","realizadas","Renovações Realizadas")}
            {fld("indicadores.renovacao","canceladas","Renovações Canceladas")}
            {fld("indicadores.renovacao","desativadas","Renovações Desativadas")}
          </>)}
          {card(<>
            {subH("⚠️ Inadimplência")}
            {fld("indicadores.inadimplencia","totais","Inadimplentes Totais")}
            {fld("indicadores.inadimplencia","regularizadas","Regularizadas")}
            {fld("indicadores.inadimplencia","emAberto","Em Aberto")}
            {fld("indicadores.inadimplencia","canceladas","Canceladas")}
          </>)}
          {card(<>
            {subH("🎯 Leads Trabalhados")}
            {fld("indicadores.leads","totais","Total de Leads")}
            {fld("indicadores.leads","qualificados","Leads Qualificados")}
            {fld("indicadores.leads","convertidos","Leads Convertidos")}
          </>)}
        </>)}

        {/* ── ATENDIMENTOS ──────────────────────────── */}
        {indTab === "atendimentos" && <>
          {(() => {
            const sumWA  = (+gcGetVal(md,"indicadores.atenGeral","whatsapp")||0) + (+gcGetVal(md,"indicadores.atenAdm","whatsapp")||0);
            const sumTk  = (+gcGetVal(md,"indicadores.atenGeral","tickets")||0)  + (+gcGetVal(md,"indicadores.atenAdm","tickets")||0);
            const sumTel = (+gcGetVal(md,"telefonia.geral","recebidas")||0)      + (+gcGetVal(md,"telefonia.administrativo","recebidas")||0);
            const sumTs  = parseTimeToSec(gcGetVal(md,"telefonia.geral","tempoMedio")||"")
                         + parseTimeToSec(gcGetVal(md,"telefonia.administrativo","tempoMedio")||"");
            const items = [
              { label:"WhatsApp",        val: sumWA  || "—", color:"#22c55e" },
              { label:"Tickets",         val: sumTk  || "—", color:"#3b82f6" },
              { label:"Telefone",        val: sumTel || "—", color:"#a78bfa" },
              { label:"Tempo Ligações",  val: sumTs > 0 ? secToHHMMSS(sumTs) : "—", color:"#f59e0b" },
            ];
            return card(<>
              {subH("📊 Total Consolidado")}
              <div style={{ display:"flex", gap:10 }}>
                {items.map(it => (
                  <div key={it.label} style={{ flex:1, textAlign:"center", background: dark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)", borderRadius:8, padding:"10px 6px", border:`1px solid ${t.border}` }}>
                    <div style={{ fontSize:9, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:4 }}>{it.label}</div>
                    <div style={{ fontSize:22, fontWeight:800, color:it.color, lineHeight:1 }}>{it.val}</div>
                    <div style={{ fontSize:9, color:t.textMuted, marginTop:3 }}>auto · soma</div>
                  </div>
                ))}
              </div>
            </>);
          })()}
          <div style={{ marginBottom:20 }} />
          {cardGrid(<>
            {card(<>
              {subH("🏢 Geral")}
              {fld("indicadores.atenGeral","whatsapp","WhatsApp")}
              {fld("indicadores.atenGeral","tickets","Tickets")}
              {fld("telefonia.geral","recebidas","Atendimento via Telefone")}
              {fld("telefonia.geral","tempoMedio","Tempo Total em Ligações (HH:MM:SS)","text")}
            </>)}
            {card(<>
              {subH("📋 Adm. & Financeiro")}
              {fld("indicadores.atenAdm","whatsapp","WhatsApp")}
              {fld("indicadores.atenAdm","tickets","Tickets")}
              {fld("telefonia.administrativo","recebidas","Atendimento via Telefone")}
              {fld("telefonia.administrativo","tempoMedio","Tempo Total em Ligações (HH:MM:SS)","text")}
            </>)}
          </>)}
          <div style={{ borderTop:`2px solid ${t.border}`, margin:"24px 0 18px", paddingTop:18 }}>
            <div style={{ fontSize:14, fontWeight:800, color:t.text, marginBottom:16, textTransform:"uppercase", letterSpacing:".8px" }}>📞 Telefonia</div>
          </div>
          {renderTel()}
        </>}

        {/* ── VENDEDORES ────────────────────────────── */}
        {indTab === "vendedores" && <>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
            <button onClick={() => { setNewName(""); setNewVendorSurname(""); setNewVendorCodigo(""); setNewVendorRegime("clt"); setNewVendorComissao(""); setAddModal("vendor"); }}
              style={{ background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>+ Adicionar Vendedor</button>
          </div>
          {vendors.length === 0 ? (
            <div style={{ color:t.textMuted, fontSize:13, padding:"12px 0" }}>Nenhum vendedor cadastrado.</div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:14 }}>
              {vendors.map(v => {
                const vd = (d.vendedores||{})[v.id] || {};
                const isEditing = editVendor === v.id;
                const initials = v.name.split(" ").filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join("");
                const hdrBg = "linear-gradient(135deg,#1e3a5f,#1e5490)";
                const inpE = { width:"100%", border:"1px solid rgba(255,255,255,0.3)", borderRadius:6, padding:"6px 9px", fontSize:12, color:"#fff", background:"rgba(255,255,255,0.12)", fontFamily:"inherit", outline:"none" };
                const REGIME = { clt:{label:"CLT",bg:"rgba(59,130,246,0.3)",color:"#93c5fd"}, pj:{label:"PJ",bg:"rgba(249,115,22,0.3)",color:"#fdba74"}, comissionado:{label:"Comissionado",bg:"rgba(34,197,94,0.25)",color:"#86efac"}, nao_comissionado:{label:"Não Comis.",bg:"rgba(100,116,139,0.3)",color:"#94a3b8"} };
                const reg = REGIME[v.regime] || REGIME.clt;
                const parts = v.name.trim().split(" ");
                return (
                  <div key={v.id} style={{ background:t.card, borderRadius:12, boxShadow:"0 2px 8px rgba(0,0,0,.10)", overflow:"hidden" }}>
                    {isEditing ? (
                      <div style={{ padding:"14px 16px", background:hdrBg }}>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:7 }}>
                          <input type="text" value={editVendorData.name} onChange={e=>setEditVendorData(p=>({...p,name:e.target.value}))} placeholder="Nome" style={inpE} autoFocus />
                          <input type="text" value={editVendorData.surname} onChange={e=>setEditVendorData(p=>({...p,surname:e.target.value}))} placeholder="Sobrenome" style={inpE} />
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:7 }}>
                          <input type="text" value={editVendorData.codigo} onChange={e=>setEditVendorData(p=>({...p,codigo:e.target.value}))} placeholder="Código (ex: V001)" style={inpE} />
                          <input type="number" value={editVendorData.comissao} onChange={e=>setEditVendorData(p=>({...p,comissao:e.target.value}))} placeholder="% Comissão" min={0} max={100} style={inpE} />
                        </div>
                        <select value={editVendorData.regime} onChange={e=>setEditVendorData(p=>({...p,regime:e.target.value}))} style={{ ...inpE, marginBottom:9 }}>
                          <option value="clt">CLT</option>
                          <option value="pj">PJ</option>
                          <option value="comissionado">Comissionado</option>
                          <option value="nao_comissionado">Não Comissionado</option>
                        </select>
                        <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                          <button onClick={() => setEditVendor(null)} style={{ background:"rgba(255,255,255,0.12)", color:"#fff", border:"1px solid rgba(255,255,255,0.2)", borderRadius:6, padding:"4px 12px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>Cancelar</button>
                          <button onClick={async () => {
                            const fullName = (editVendorData.name.trim()+" "+editVendorData.surname.trim()).trim();
                            if (!fullName) return;
                            const updated = { ...v, name:fullName, codigo:editVendorData.codigo, regime:editVendorData.regime, comissao:editVendorData.comissao };
                            await setDoc(doc(db,"gc_vendors",v.id), updated);
                            setVendors(prev => prev.map(x => x.id===v.id ? updated : x).sort((a,b) => a.name.localeCompare(b.name)));
                            setEditVendor(null);
                            showGCToast("✓ Salvo");
                          }} style={{ background:"#22c55e", color:"#fff", border:"none", borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Salvar</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding:"14px 16px", background:hdrBg }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                          <div style={{ width:38, height:38, borderRadius:"50%", background:"rgba(255,255,255,0.18)", border:"2px solid rgba(255,255,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#fff", flexShrink:0 }}>{initials}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, fontSize:14, color:"#fff", lineHeight:1.2 }}>{v.name}</div>
                            {v.codigo && <div style={{ fontSize:10, color:"rgba(255,255,255,0.6)", marginTop:2 }}>Cód: {v.codigo}</div>}
                          </div>
                          <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                            <button onClick={() => { setEditVendorData({ name:parts[0]||"", surname:parts.slice(1).join(" ")||"", codigo:v.codigo||"", regime:v.regime||"clt", comissao:v.comissao||"" }); setEditVendor(v.id); }}
                              style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", color:"#fff", fontSize:12 }}>✏️</button>
                            <button onClick={() => setConfDel({ type:"vendor", id:v.id, name:v.name })}
                              style={{ background:"rgba(239,68,68,.25)", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", color:"#fca5a5", fontSize:12 }}>🗑️</button>
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          <span style={{ background:reg.bg, color:reg.color, padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:700 }}>{reg.label}</span>
                          {v.comissao && <span style={{ background:"rgba(34,197,94,0.2)", color:"#86efac", padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:700 }}>{v.comissao}% comissão</span>}
                        </div>
                      </div>
                    )}
                    <div style={{ padding:"14px 16px" }}>
                      {fldCur("indicadores.vendedores."+v.id,"valor","Valor Vendas Novas")}
                      {fldCur("indicadores.vendedores."+v.id,"valorCrossSell","Valor de Cross Sell")}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 12px" }}>
                        {fld("indicadores.vendedores."+v.id,"leadsTrab","Leads Trabalhados")}
                        {fld("indicadores.vendedores."+v.id,"leadsDesq","Leads Desqualificados")}
                        {fld("indicadores.vendedores."+v.id,"leadsConv","Leads Convertidos")}
                      </div>
                      {(() => {
                        const ticketMedio = vd.valor && vd.leadsConv && +vd.leadsConv > 0 ? +vd.valor / +vd.leadsConv : null;
                        const valorComis  = vd.valor && v.comissao ? +vd.valor * +v.comissao / 100 : null;
                        const chip = (label, value, color, sub) => (
                          <div style={{ flex:1, textAlign:"center", padding:"8px 6px", background:t.pageBg, borderRadius:8, border:`1px solid ${t.border}` }}>
                            <div style={{ fontSize:9, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:3 }}>{label}</div>
                            <div style={{ fontSize:15, fontWeight:800, color, lineHeight:1 }}>{value ? gcFmtBRL(String(value.toFixed(2))) : "—"}</div>
                            <div style={{ fontSize:9, color:t.textMuted, marginTop:2 }}>{sub}</div>
                          </div>
                        );
                        return (
                          <div style={{ display:"flex", gap:8, marginTop:12, paddingTop:12, borderTop:`1px solid ${t.border}` }}>
                            {chip("Ticket Médio", ticketMedio, "#3b82f6", "auto · valor÷conv.")}
                            {chip("Comissão", valorComis, "#22c55e", `auto · ${v.comissao||0}% do valor`)}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
            })}
          </div>
          )}
        </>}

        {/* ── COLABORADORES ─────────────────────────── */}
        {indTab === "colaboradores" && <>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
            <button onClick={() => { setNewName(""); setNewSurname(""); setNewDept("geral"); setAddModal("collab"); }}
              style={{ background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>+ Adicionar Colaborador</button>
          </div>
          {geralCollabs.length > 0 && <>
            <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, marginBottom:12, textTransform:"uppercase", letterSpacing:".5px" }}>🏢 Departamento Geral</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(295px,1fr))", gap:14, marginBottom:22 }}>
              {geralCollabs.map(c => colabCard(c, "linear-gradient(135deg,#1e3a5f,#1e4976)"))}
            </div>
          </>}
          {admCollabs.length > 0 && <>
            <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, marginBottom:12, textTransform:"uppercase", letterSpacing:".5px" }}>📋 Departamento Adm. & Financeiro</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(295px,1fr))", gap:14 }}>
              {admCollabs.map(c => colabCard(c, "linear-gradient(135deg,#3d1a5f,#4a1a76)"))}
            </div>
          </>}
          {geralCollabs.length === 0 && admCollabs.length === 0 && (
            <div style={{ color:t.textMuted, fontSize:13, padding:"12px 0" }}>Nenhum colaborador cadastrado. Adicione na aba Colaboradores.</div>
          )}
        </>}
      </>
    );
  };

  const renderVendas = () => {
    const d = md.vendas || {};
    const btnStyle = { background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" };
    return (
      <div style={{ background:t.card, borderRadius:12, boxShadow:"0 1px 3px rgba(0,0,0,.08)", overflow:"hidden" }}>
        <div style={{ padding:"14px 18px", borderBottom:`1px solid ${t.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:".5px" }}>💼 Desempenho por Vendedor</span>
          <button onClick={() => { setNewName(""); setAddModal("vendor"); }} style={btnStyle}>+ Adicionar Vendedor</button>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>{["Vendedor","Leads","Propostas","Fechamentos","Faturamento (R$)","Conv.",""].map((h,i)=>(
                <th key={i} style={{ background:t.thead, padding:"9px 14px", textAlign:"left", fontSize:11, fontWeight:600, color:t.textMuted, textTransform:"uppercase", letterSpacing:".3px" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr><td colSpan={7} style={{ padding:22, textAlign:"center", color:t.textMuted, fontSize:13 }}>Nenhum vendedor cadastrado.</td></tr>
              ) : vendors.map(v => {
                const vd = d[v.id] || {};
                const cv = gcPct(vd.fechamentos, vd.leads);
                return (
                  <tr key={v.id}>
                    <td style={{ padding:"9px 14px", fontSize:13, color:t.text, borderTop:`1px solid ${t.border}` }}><strong>{v.name}</strong></td>
                    {["leads","propostas","fechamentos"].map(k => (
                      <td key={k} style={{ padding:"5px 10px", borderTop:`1px solid ${t.border}` }}>
                        <input type="number" defaultValue={vd[k]||""} placeholder="0"
                          style={{ border:"none", background:"transparent", fontSize:13, width:80, color:t.text, padding:"2px 4px", fontFamily:"inherit" }}
                          onFocus={e => e.target.style.background = dark?"#1d3461":"#f0f7ff"}
                          onBlur={e => { e.target.style.background="transparent"; saveField("vendas."+v.id, k, e.target.value); }} />
                      </td>
                    ))}
                    <td style={{ padding:"5px 10px", borderTop:`1px solid ${t.border}` }}>
                      <input type="text" defaultValue={vd.faturamento ? gcFmtBRL(vd.faturamento) : ""} placeholder="R$ 0,00"
                        style={{ border:"none", background:"transparent", fontSize:13, width:110, color:t.text, padding:"2px 4px", fontFamily:"inherit" }}
                        onFocus={e => e.target.style.background = dark?"#1d3461":"#f0f7ff"}
                        onChange={e => { e.target.value = gcFmtBRLLive(e.target.value); }}
                        onBlur={e => {
                          e.target.style.background = "transparent";
                          saveField("vendas."+v.id, "faturamento", gcParseBRL(e.target.value));
                        }} />
                    </td>
                    <td style={{ padding:"9px 14px", fontSize:13, fontWeight:600, color:+cv>=20?"#22c55e":+cv>=10?"#f59e0b":"#ef4444", borderTop:`1px solid ${t.border}` }}>{cv}%</td>
                    <td style={{ padding:"9px 14px", borderTop:`1px solid ${t.border}` }}>
                      <button onClick={() => setConfDel({ type:"vendor", id:v.id, name:v.name })}
                        style={{ background:"#fee2e2", color:"#ef4444", border:"none", borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"inherit" }}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const deptBlock = (path, label, icon) => card(<>
    {cardH(`${icon} ${label}`)}
    {fld(path,"total","Total de Atendimentos")}
    {fld(path,"resolvidos","Resolvidos")}
    {fld(path,"tempoMedio","Tempo Médio Resposta (min)")}
    {fld(path,"nps","NPS (0–100)")}
    {fld(path,"satisfacao","Taxa de Satisfação (%)")}
  </>);

  const renderAten = () => cardGrid(<>
    {deptBlock("atendimento.geral","Departamento Geral","🏢")}
    {deptBlock("atendimento.administrativo","Departamento Administrativo","📋")}
  </>);

  const telBlock = (path, label, icon) => card(<>
    {cardH(`${icon} ${label}`)}
    {fld(path,"recebidas","Chamadas Recebidas")}
    {fld(path,"tempoMedio","Tempo Total em Ligações (HH:MM:SS)","text")}
  </>);

  const handleXlsxImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type:"array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval:"" });

      // Normalize header keys: lowercase, trim
      const norm = (k) => String(k).toLowerCase().replace(/\s+/g,"");
      const normRows = rows.map(r => {
        const o = {};
        Object.keys(r).forEach(k => { o[norm(k)] = r[k]; });
        return o;
      });

      // Match agent name to collaborator (case-insensitive, partial)
      const matchColab = (agentName) => {
        const a = String(agentName).toLowerCase().trim();
        return collabs.find(c => {
          const cn = c.name.toLowerCase().trim();
          return cn === a || cn.includes(a) || a.includes(cn);
        });
      };

      let newMd = { ...md };
      let matched = 0, unmatched = [];
      const geralIds = new Set(collabs.filter(c => c.dept === "geral").map(c => c.id));
      const admIds   = new Set(collabs.filter(c => c.dept === "administrativo").map(c => c.id));
      let telGeral = { answered:0, talkSec:0 }, telAdm = { answered:0, talkSec:0 };

      normRows.forEach(row => {
        const colab = matchColab(row["agent"] ?? row["agente"] ?? "");
        if (!colab) { unmatched.push(String(row["agent"] ?? row["agente"] ?? "?")); return; }
        matched++;
        const path = "indicadores.colab." + colab.id;
        if (row["answered"]  != null) newMd = gcSet(newMd, path, "telefone",       String(row["answered"]));
        if (row["pauses"]    != null) newMd = gcSet(newMd, path, "pausas",         String(row["pauses"]));
        { const s = xlTime(row["aht"]);       if (s > 0) newMd = gcSet(newMd, path, "mediaLigacao",   secToHHMMSS(s)); }
        { const s = xlTime(row["pausatime"] ?? row["pausetime"]); if (s > 0) newMd = gcSet(newMd, path, "pausaTimeTotal", secToHHMMSS(s)); }
        { const s = xlTime(row["talktime"]);  if (s > 0) newMd = gcSet(newMd, path, "talkTime",       secToHHMMSS(s)); }

        // Accumulate telefonia totals per dept
        const ans      = +(row["answered"] || 0);
        const talkSec  = xlTime(row["talktime"] ?? row["talk time"]);
        if (geralIds.has(colab.id)) { telGeral.answered += ans; telGeral.talkSec += talkSec; }
        else if (admIds.has(colab.id)) { telAdm.answered += ans; telAdm.talkSec += talkSec; }
      });

      // Fill telefonia fields
      if (telGeral.answered) newMd = gcSet(newMd, "telefonia.geral", "recebidas",  String(telGeral.answered));
      if (telGeral.talkSec)  newMd = gcSet(newMd, "telefonia.geral", "tempoMedio", secToHHMMSS(telGeral.talkSec));
      if (telAdm.answered)   newMd = gcSet(newMd, "telefonia.administrativo", "recebidas",  String(telAdm.answered));
      if (telAdm.talkSec)    newMd = gcSet(newMd, "telefonia.administrativo", "tempoMedio", secToHHMMSS(telAdm.talkSec));

      setMd(newMd);
      setMdKey(k => k + 1);
      await setDoc(doc(db, "gc_months", curMonth), newMd, { merge: true });
      const msg = unmatched.length
        ? `✓ ${matched} importado(s). Não encontrado(s): ${unmatched.join(", ")}`
        : `✓ ${matched} colaborador(es) importado(s) com sucesso`;
      showGCToast(msg);
    } catch (err) {
      showGCToast("Erro ao ler o arquivo. Verifique o formato.");
      console.error(err);
    }
  };

  const renderTel = () => (
    <div style={{ background:t.card, borderRadius:12, padding:"18px 22px", display:"flex", alignItems:"center", gap:18, boxShadow:"0 1px 3px rgba(0,0,0,.08)" }}>
      <div style={{ fontSize:32 }}>📊</div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:14, color:t.text, marginBottom:3 }}>Importar relatório de ligações (.xlsx)</div>
        <div style={{ fontSize:12, color:t.textMuted }}>Colunas esperadas: <strong>Agent, Answered, Pauses, Pausa Time, Talk Time, AHT</strong></div>
        <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>Preenche automaticamente: Telefone, Pausas, Chamadas Recebidas, Tempo Total em Ligações, Média em Ligação e Média Pausa/dia.</div>
      </div>
      <input ref={xlsxRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }} onChange={handleXlsxImport} />
      <button onClick={() => xlsxRef.current?.click()}
        style={{ background:"#3b82f6", color:"#fff", border:"none", borderRadius:9, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
        📎 Selecionar arquivo
      </button>
    </div>
  );

  const renderColab = () => {
    const addBtn = { background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" };
    return (
      <>
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
          <button onClick={() => { setNewName(""); setNewDept("geral"); setAddModal("collab"); }} style={addBtn}>+ Adicionar Colaborador</button>
        </div>
        {collabs.length === 0 ? (
          <div style={{ textAlign:"center", padding:36, color:t.textMuted, background:t.card, borderRadius:12 }}>Nenhum colaborador cadastrado.</div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(275px,1fr))", gap:14 }}>
            {collabs.map(c => {
              const cd = (md.rh || {})[c.id] || {};
              return (
                <div key={c.id} style={{ background:t.card, borderRadius:12, boxShadow:"0 1px 3px rgba(0,0,0,.08)", overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", background:"linear-gradient(135deg,#1e2d47,#2d3f55)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontWeight:600, fontSize:14 }}>👤 {c.name}</span>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <span style={{ background:c.dept==="geral"?"#dbeafe":"#fce7f3", color:c.dept==="geral"?"#1d4ed8":"#9d174d", padding:"2px 7px", borderRadius:20, fontSize:10, fontWeight:600 }}>
                        {c.dept==="geral"?"Geral":"Adm."}
                      </span>
                      <button onClick={() => setConfDel({ type:"collab", id:c.id, name:c.name })}
                        style={{ background:"rgba(239,68,68,.2)", color:"#fca5a5", border:"none", borderRadius:6, padding:"3px 7px", cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ padding:"14px 16px" }}>
                    {[["freq","Frequência (%)"],["pont","Pontualidade (%)"],["perf","Performance (%)"],["meta","Meta Individual (%)"]].map(([k,lbl]) => (
                      <div key={k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:9 }}>
                        <label style={{ fontSize:12, color:t.textSub }}>{lbl}</label>
                        <input type="number" min={0} max={100} defaultValue={cd[k]||""} placeholder="100"
                          style={{ width:70, border:`1.5px solid ${t.border}`, borderRadius:6, padding:"3px 7px", fontSize:13, textAlign:"right", color:t.text, background:t.inputBg, fontFamily:"inherit", outline:"none" }}
                          onBlur={e => saveField("rh."+c.id, k, e.target.value)} />
                      </div>
                    ))}
                    <div style={{ marginTop:10 }}>
                      <label style={{ fontSize:10, fontWeight:700, color:t.textMuted, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:".5px" }}>Observações</label>
                      <textarea rows={2} defaultValue={cd.obs||""}
                        style={{ width:"100%", border:`1.5px solid ${t.border}`, borderRadius:8, padding:"6px 9px", fontSize:12, resize:"none", color:t.text, background:t.inputBg, fontFamily:"inherit", outline:"none" }}
                        onBlur={e => saveField("rh."+c.id, "obs", e.target.value)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const renderConf = () => cardGrid(
    card(<>
      {cardH("ℹ️ Armazenamento")}
      <p style={{ fontSize:13, color:t.textSub, lineHeight:1.6 }}>Dados salvos no Firebase — acessíveis de qualquer dispositivo.</p>
    </>)
  );

  const generateReport = async () => {
    if (!reportCfg.months.length) { showGCToast("⚠ Selecione ao menos um mês."); return; }
    const MN_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const sortedMonths = [...reportCfg.months].sort((a,b) => a-b);
    const monthsArr = await Promise.all(sortedMonths.map(async mo => {
      const key = `${reportCfg.year}-${String(mo).padStart(2,"0")}`;
      const label = `${MN_SHORT[mo-1]}/${String(reportCfg.year).slice(2)}`;
      let data = {};
      if (key === curMonth) { data = md; }
      else {
        try { const snap = await getDoc(doc(db,"gc_months",key)); data = snap.exists()?snap.data():{}; } catch {}
      }
      return { key, label, data };
    }));
    const html = buildReportHtml(monthsArr, vendors, collabs, reportCfg);
    const win = window.open("", "_blank");
    if (!win) { showGCToast("⚠ Permissão de popup bloqueada — libere popups para este site."); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { try { win.print(); } catch {} }, 600);
    setShowReportModal(false);
  };

  const publishReport = async () => {
    if (!reportCfg.months.length) { showGCToast("⚠ Selecione ao menos um mês."); return; }
    const MN_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const sortedMonths = [...reportCfg.months].sort((a,b) => a-b);
    const monthsArr = await Promise.all(sortedMonths.map(async mo => {
      const key = `${reportCfg.year}-${String(mo).padStart(2,"0")}`;
      const label = `${MN_SHORT[mo-1]}/${String(reportCfg.year).slice(2)}`;
      let data = {};
      if (key === curMonth) { data = md; }
      else { try { const snap = await getDoc(doc(db,"gc_months",key)); data = snap.exists()?snap.data():{}; } catch {} }
      return { key, label, data };
    }));
    const html = buildReportHtml(monthsArr, vendors, collabs, reportCfg);
    const bimestre = Math.ceil(sortedMonths[0] / 2);
    const BIM_LABELS = ["1°","2°","3°","4°","5°","6°"];
    const docId = `${reportCfg.year}-B${bimestre}`;
    try {
      await setDoc(doc(db, "relatorios_publicos", docId), {
        html, year: reportCfg.year, bimestre,
        label: `${BIM_LABELS[bimestre-1]} Bimestre / ${reportCfg.year}`,
        months: monthsArr.map(m => m.label),
        publishedAt: new Date().toISOString(),
      });
      showGCToast("✅ Relatório publicado! Acesse: " + window.location.origin + "/?relatorio=1");
      setShowReportModal(false);
    } catch(e) { showGCToast("❌ Erro ao publicar: " + (e.message||e)); }
  };

  const SEC_NAV = [
    { id:"dashboard",      icon:"📊", label:"Dashboard" },
    { id:"metas",          icon:"🎯", label:"Metas" },
    { id:"indicadores",    icon:"📈", label:"Indicadores" },
    { id:"config",         icon:"⚙️", label:"Config." },
  ];

  const SEC_TITLES = {
    dashboard:"📊 Dashboard",
    metas:"🎯 Metas", funil:"📊 Funil de Leads", inadimplencia:"⚠️ Inadimplência",
    indicadores:"📈 Indicadores", atendimento:"🎧 Atendimento",
    colaboradores:"👥 Colaboradores", config:"⚙️ Configurações"
  };

  const secRenders = {
    dashboard:renderDash,
    metas:renderMetas, funil:renderFunil, inadimplencia:renderInad,
    indicadores:renderIndicadores, atendimento:renderAten,
    colaboradores:renderColab, config:renderConf
  };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:t.pageBg, color:t.text, ...FF }}>
      Carregando...
    </div>
  );

  const modalBtnSec = { background:t.btnSecBg, color:t.btnSecText, border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" };
  const modalBtnPri = { background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", ...FF }}>

      {/* Header */}
      <div style={{ background:"#0f172a", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 22px", flexShrink:0, boxShadow:"0 2px 12px rgba(0,0,0,.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.1)", color:"#94a3b8", borderRadius:8, padding:"5px 11px", cursor:"pointer", fontSize:12, ...FF }}>← Voltar</button>
          <span style={{ fontSize:20 }}>📊</span>
          <span style={{ color:"#f8fafc", fontWeight:800, fontSize:16 }}>Gestão Comercial</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <DarkToggle />
          <button onClick={onLogout} style={{ background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.1)", color:"#94a3b8", borderRadius:8, padding:"5px 11px", cursor:"pointer", fontSize:12, ...FF }}>Sair</button>
        </div>
      </div>

      {presenceEmps.length > 0 && <div style={{ padding:"6px 18px", flexShrink:0, background:"#0f172a" }}><PresenceBar employees={presenceEmps} /></div>}

      {/* Body */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* Sidebar */}
        <aside style={{ width:205, background:"#1e2d47", display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" }}>
          {SEC_NAV.map(s => {
            const active = curSec === s.id;
            const hovered = navHover === s.id && !active;
            return (
              <div key={s.id}
                onClick={() => setCurSec(s.id)}
                onMouseEnter={() => setNavHover(s.id)}
                onMouseLeave={() => setNavHover(null)}
                style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 16px", cursor:"pointer", fontSize:13,
                  transition:"background .18s, color .18s, transform .18s, border-color .18s",
                  borderLeft: active ? "3px solid #60a5fa" : hovered ? "3px solid #3b82f6" : "3px solid transparent",
                  background: active ? "#2d3f55" : hovered ? "rgba(96,165,250,0.08)" : "transparent",
                  color: active ? "#60a5fa" : hovered ? "#cbd5e1" : "#94a3b8",
                  transform: hovered ? "translateX(4px)" : "translateX(0)" }}>
                <span style={{ fontSize:14, width:17, textAlign:"center", transition:"transform .18s", transform: hovered ? "scale(1.15)" : "scale(1)" }}>{s.icon}</span>{s.label}
              </div>
            );
          })}
        </aside>

        {/* Main */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Year + Month bar */}
          <div style={{ background:"#1a2535", borderBottom:"1px solid #0f172a", flexShrink:0 }}>
            {/* Year row */}
            <div style={{ padding:"8px 18px 4px", display:"flex", alignItems:"center", gap:6 }}>
              {availYears.map(y => (
                <button key={y}
                  onClick={() => setCurMonth(`${y}-${String(curMonthNum).padStart(2,"0")}`)}
                  style={{ padding:"5px 16px", borderRadius:20, fontSize:13, fontWeight:700, cursor:"pointer", border:"none", fontFamily:"inherit", transition:"all .15s",
                    background: y===curYear ? "#3b82f6" : "rgba(255,255,255,.08)",
                    color:      y===curYear ? "#fff"    : "#64748b" }}>
                  {y}
                </button>
              ))}
              <button
                onClick={() => setAvailYears(prev => [...prev, Math.max(...prev)+1])}
                title="Adicionar próximo ano"
                style={{ width:26, height:26, borderRadius:"50%", background:"#22c55e", color:"#fff", border:"none", cursor:"pointer", fontSize:17, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit", flexShrink:0 }}>+</button>
            </div>
            {/* Month row */}
            <div style={{ padding:"4px 18px 8px", display:"flex", alignItems:"center", gap:4 }}>
              {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map((mName, i) => {
                const mNum = i + 1;
                const active = mNum === curMonthNum;
                return (
                  <button key={mName}
                    onClick={() => setCurMonth(`${curYear}-${String(mNum).padStart(2,"0")}`)}
                    style={{ padding:"4px 12px", borderRadius:20, fontSize:12, cursor:"pointer", border:"none", fontFamily:"inherit", transition:"all .15s",
                      background: active ? "#0d9488" : "rgba(255,255,255,.06)",
                      color:      active ? "#fff"    : "#475569",
                      fontWeight: active ? 600       : 400 }}>
                    {mName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content — key forces remount when data loads */}
          <div key={mdKey} style={{ flex:1, overflowY:"auto", padding:20, background:t.pageBg }}>
            <div style={{ fontSize:16, fontWeight:700, color:t.text, marginBottom:16 }}>{SEC_TITLES[curSec]||curSec}</div>
            {(secRenders[curSec] || (() => null))()}
          </div>

        </div>
      </div>

      {/* Report modal */}
      {showReportModal && (
        <Overlay>
          <div style={{ background:t.card, borderRadius:16, padding:28, width:"100%", maxWidth:430, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:t.text }}>🖨️ Emitir Relatório</h2>
              <button onClick={() => setShowReportModal(false)} style={{ background:t.btnSecBg, border:"none", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16, color:t.text, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>

            <div style={{ marginBottom:18 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>Período</label>
              <div style={{ marginBottom:10 }}>
                <label style={{ display:"block", fontSize:11, color:t.textMuted, marginBottom:4 }}>Ano</label>
                <input type="number" value={reportCfg.year} min={2020} max={2099}
                  onChange={e => setReportCfg(p => ({ ...p, year:+e.target.value }))}
                  style={{ width:100, border:`1.5px solid ${t.border}`, borderRadius:8, padding:"7px 10px", fontSize:13, color:t.text, background:t.inputBg, fontFamily:"inherit", outline:"none" }} />
              </div>
              <label style={{ display:"block", fontSize:11, color:t.textMuted, marginBottom:6 }}>Meses <span style={{ color:t.textMuted, fontStyle:"italic" }}>(selecione um ou mais)</span></label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
                {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map((m,i) => {
                  const mo = i+1;
                  const sel = reportCfg.months.includes(mo);
                  return (
                    <div key={mo} onClick={() => setReportCfg(p => ({ ...p, months: sel ? p.months.filter(x=>x!==mo) : [...p.months, mo] }))}
                      style={{ padding:"6px 0", textAlign:"center", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700, border:`1.5px solid ${sel?"#6366f1":t.border}`,
                        background: sel ? (dark?"rgba(99,102,241,0.2)":"rgba(99,102,241,0.1)") : t.inputBg,
                        color: sel ? "#818cf8" : t.textMuted, userSelect:"none" }}>
                      {m}
                    </div>
                  );
                })}
              </div>
              {reportCfg.months.length === 0 && <div style={{ fontSize:11, color:"#ef4444", marginTop:5 }}>Selecione ao menos um mês.</div>}
            </div>

            <div style={{ marginBottom:22 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:10 }}>Incluir no Relatório</label>
              {[
                { key:"metas",         label:"🎯 Metas do Setor" },
                { key:"comercial",     label:"💼 Comercial (Vendas, Leads, Renovação, Inadimplência)" },
                { key:"vendedores",    label:"👤 Vendedores" },
                { key:"atendimentos",  label:"🎧 Atendimentos" },
                { key:"colaboradores", label:"👥 Colaboradores" },
              ].map(s => (
                <div key={s.key} onClick={() => setReportCfg(p => ({ ...p, sections:{ ...p.sections, [s.key]:!p.sections[s.key] }}))}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, cursor:"pointer", marginBottom:4,
                    background: reportCfg.sections[s.key] ? (dark?"rgba(99,102,241,0.12)":"rgba(99,102,241,0.06)") : "transparent" }}>
                  <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${reportCfg.sections[s.key]?"#6366f1":t.border}`,
                    background: reportCfg.sections[s.key] ? "#6366f1" : "transparent",
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:11, color:"#fff", fontWeight:700 }}>
                    {reportCfg.sections[s.key] ? "✓" : ""}
                  </div>
                  <span style={{ fontSize:13, color:t.text }}>{s.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setShowReportModal(false)}
                  style={{ flex:1, padding:"10px", background:t.btnSecBg, border:"none", borderRadius:9, color:t.btnSecText, fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                  Cancelar
                </button>
                <button onClick={generateReport}
                  style={{ flex:2, padding:"10px", background:"#6366f1", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                  🖨️ Emitir Relatório
                </button>
              </div>
              <button onClick={publishReport}
                style={{ width:"100%", padding:"10px", background:"linear-gradient(135deg,#10b981,#059669)", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                🌐 Publicar na Página de Relatórios
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Add Vendor / Collab modal */}
      {addModal && (
        <Overlay>
          <div style={{ background:t.card, borderRadius:16, padding:28, width:"100%", maxWidth: addModal==="vendor" ? 460 : 380, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}>
            <h2 style={{ margin:"0 0 6px", fontSize:17, color:t.text }}>{addModal==="vendor"?"💼 Adicionar Vendedor":"👤 Adicionar Colaborador"}</h2>
            <p style={{ color:t.textSub, fontSize:13, marginBottom:18 }}>Aparecerá em todos os meses.</p>
            {(() => {
              const inpS = { width:"100%", border:`1.5px solid ${t.border}`, borderRadius:8, padding:"9px 11px", fontSize:13, color:t.text, background:t.inputBg, fontFamily:"inherit", outline:"none" };
              const lbl = (txt) => <label style={{ display:"block", fontSize:12, color:t.textSub, marginBottom:5, fontWeight:500 }}>{txt}</label>;
              if (addModal === "vendor") return (<>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                  <div>{lbl("Nome")}<input autoFocus type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ex: João" style={inpS} /></div>
                  <div>{lbl("Sobrenome")}<input type="text" value={newVendorSurname} onChange={e=>setNewVendorSurname(e.target.value)} placeholder="Ex: Silva" style={inpS} /></div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                  <div>{lbl("Código do Vendedor")}<input type="text" value={newVendorCodigo} onChange={e=>setNewVendorCodigo(e.target.value)} placeholder="Ex: V001" style={inpS} /></div>
                  <div>{lbl("% Comissão")}<input type="number" min={0} max={100} value={newVendorComissao} onChange={e=>setNewVendorComissao(e.target.value)} placeholder="Ex: 5" style={inpS} /></div>
                </div>
                <div style={{ marginBottom:12 }}>{lbl("Regime")}
                  <select value={newVendorRegime} onChange={e=>setNewVendorRegime(e.target.value)} style={{ ...inpS }}>
                    <option value="clt">CLT</option>
                    <option value="pj">PJ</option>
                    <option value="comissionado">Comissionado</option>
                    <option value="nao_comissionado">Não Comissionado</option>
                  </select>
                </div>
              </>);
              return (<>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                  <div>{lbl("Nome")}<input autoFocus type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ex: Maria" style={inpS} /></div>
                  <div>{lbl("Sobrenome")}<input type="text" value={newSurname} onChange={e=>setNewSurname(e.target.value)} placeholder="Ex: Silva" style={inpS} /></div>
                </div>
                <div style={{ marginBottom:12 }}>{lbl("Departamento")}
                  <select value={newDept} onChange={e=>setNewDept(e.target.value)} style={{ ...inpS }}>
                    <option value="geral">Departamento Geral</option>
                    <option value="administrativo">Adm. & Financeiro</option>
                  </select>
                </div>
              </>);
            })()}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:18 }}>
              <button onClick={() => setAddModal(null)} style={modalBtnSec}>Cancelar</button>
              <button onClick={async () => {
                const n = newName.trim();
                if (!n) return;
                if (addModal === "vendor") {
                  const fullName = (n+" "+newVendorSurname.trim()).trim();
                  const v = { id:genId(), name:fullName, codigo:newVendorCodigo.trim(), regime:newVendorRegime, comissao:newVendorComissao };
                  await setDoc(doc(db,"gc_vendors",v.id), v);
                  setVendors(prev => [...prev, v].sort((a,b) => a.name.localeCompare(b.name)));
                } else {
                  const fullName = (n+" "+newSurname.trim()).trim();
                  const c = { id:genId(), name:fullName, dept:newDept };
                  await setDoc(doc(db,"gc_collabs",c.id), c);
                  setCollabs(prev => [...prev, c].sort((a,b) => a.name.localeCompare(b.name)));
                }
                setAddModal(null);
                showGCToast("✓ Salvo");
              }} style={modalBtnPri}>Salvar</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Confirm delete */}
      {confDel && (
        <ConfirmDialog
          message={`Remover "${confDel.name}"? Os dados mensais serão mantidos.`}
          onCancel={() => setConfDel(null)}
          onConfirm={async () => {
            if (confDel.type === "vendor") {
              await deleteDoc(doc(db,"gc_vendors",confDel.id));
              setVendors(prev => prev.filter(v => v.id !== confDel.id));
            } else {
              await deleteDoc(doc(db,"gc_collabs",confDel.id));
              setCollabs(prev => prev.filter(c => c.id !== confDel.id));
            }
            setConfDel(null);
            showGCToast("✓ Removido");
          }}
        />
      )}

      {gcToast && <Toast msg={gcToast} />}
    </div>
  );
}

// ── Página Pública de Relatórios ─────────────────────────────────────
function PublicReport() {
  const PASS = "lgkrelatorio123";
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem("rpt_auth") === "1");
  const [pwInput,  setPwInput]  = useState("");
  const [pwError,  setPwError]  = useState(false);
  const [reports,  setReports]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selYear,  setSelYear]  = useState(null);
  const [selBim,   setSelBim]   = useState(null);

  useEffect(() => {
    if (!unlocked) return;
    getDocs(collection(db, "relatorios_publicos"))
      .then(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => b.year - a.year || b.bimestre - a.bimestre);
        setReports(data);
        if (data.length) { setSelYear(data[0].year); setSelBim(data[0].bimestre); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [unlocked]);

  const tryUnlock = () => {
    if (pwInput === PASS) { sessionStorage.setItem("rpt_auth","1"); setUnlocked(true); }
    else { setPwError(true); setTimeout(() => setPwError(false), 1800); }
  };

  if (!unlocked) return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:16, padding:"40px 36px", width:"100%", maxWidth:360, boxShadow:"0 24px 64px rgba(0,0,0,.35)", textAlign:"center" }}>
        <div style={{ fontSize:36, marginBottom:12 }}>🔒</div>
        <h2 style={{ margin:"0 0 6px", fontSize:20, fontWeight:800, color:"#0f172a" }}>Área Restrita</h2>
        <p style={{ margin:"0 0 24px", fontSize:13, color:"#64748b" }}>Digite a senha para acessar os relatórios.</p>
        <input
          type="password" value={pwInput} onChange={e => setPwInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && tryUnlock()}
          placeholder="Senha"
          autoFocus
          style={{ width:"100%", padding:"11px 14px", borderRadius:9, border:`2px solid ${pwError?"#ef4444":"#e2e8f0"}`,
            fontSize:14, outline:"none", fontFamily:"inherit", marginBottom:12,
            boxSizing:"border-box", transition:"border-color .2s",
            animation: pwError ? "shake .3s" : "none" }} />
        {pwError && <p style={{ margin:"-6px 0 10px", fontSize:12, color:"#ef4444" }}>Senha incorreta.</p>}
        <button onClick={tryUnlock}
          style={{ width:"100%", padding:"11px", background:"linear-gradient(135deg,#1e3a5f,#3b82f6)", border:"none",
            borderRadius:9, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
          Entrar
        </button>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
    </div>
  );

  const BIM_LABELS  = ["1°","2°","3°","4°","5°","6°"];
  const BIM_MONTHS  = [["Jan","Fev"],["Mar","Abr"],["Mai","Jun"],["Jul","Ago"],["Set","Out"],["Nov","Dez"]];
  const years       = [...new Set(reports.map(r => r.year))].sort((a,b) => b-a);
  const yearReports = reports.filter(r => r.year === selYear);
  const selected    = yearReports.find(r => r.bimestre === selBim);

  const pickYear = y => {
    setSelYear(y);
    const yr = reports.filter(r => r.year === y);
    if (yr.length) setSelBim(yr.sort((a,b) => b.bimestre-a.bimestre)[0].bimestre);
  };

  const download = () => {
    if (!selected) return;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;opacity:0;border:none;pointer-events:none";
    document.body.appendChild(iframe);
    iframe.contentDocument.write(selected.html);
    iframe.contentDocument.close();
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch {}
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 600);
  };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh",
      background:"#0f172a", color:"#fff", fontSize:16 }}>
      Carregando relatórios...
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#f1f5f9", fontFamily:"'Segoe UI',Arial,sans-serif" }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", color:"#fff", padding:"28px 36px 22px" }}>
        <h1 style={{ fontSize:28, fontWeight:900, letterSpacing:"-.5px", margin:0 }}>
          Relatório <span style={{ color:"#60a5fa" }}>Comercial</span>
        </h1>
        <div style={{ fontSize:12, color:"#94a3b8", marginTop:5 }}>Acompanhe os indicadores por bimestre</div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"28px 28px 48px" }}>
        {reports.length === 0 ? (
          <div style={{ textAlign:"center", color:"#64748b", fontSize:15, padding:"64px 0" }}>
            Nenhum relatório publicado ainda.
          </div>
        ) : (
          <>
            {/* Year selector */}
            <div style={{ display:"flex", gap:8, marginBottom:20 }}>
              {years.map(y => (
                <button key={y} onClick={() => pickYear(y)}
                  style={{ padding:"6px 22px", borderRadius:20, border:"none", fontWeight:700, fontSize:15, cursor:"pointer",
                    background: selYear===y ? "#3b82f6":"#e2e8f0",
                    color:      selYear===y ? "#fff":"#64748b" }}>
                  {y}
                </button>
              ))}
            </div>

            {/* Bimester tabs */}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:24 }}>
              {[1,2,3,4,5,6].map(b => {
                const pub    = yearReports.find(r => r.bimestre === b);
                const active = selBim === b && !!pub;
                return (
                  <button key={b} onClick={() => pub && setSelBim(b)} disabled={!pub}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:20,
                      border:`2px solid ${active?"#3b82f6":pub?"#cbd5e1":"#e2e8f0"}`,
                      background: active?"#3b82f6":pub?"#fff":"#f8fafc",
                      color:      active?"#fff":pub?"#334155":"#cbd5e1",
                      fontWeight:600, fontSize:13, cursor:pub?"pointer":"default", opacity:pub?1:0.45,
                      transition:"all .15s" }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", display:"inline-block",
                      background: active?"#fff":pub?"#22c55e":"#cbd5e1" }} />
                    {BIM_LABELS[b-1]} bimestre
                    {pub && (
                      <span style={{ fontSize:11, color: active?"rgba(255,255,255,.7)":"#94a3b8", marginLeft:2 }}>
                        {BIM_MONTHS[b-1][0]}-{BIM_MONTHS[b-1][1]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Download + report */}
            {selected ? (
              <>
                <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
                  <button onClick={download}
                    style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 22px",
                      background:"#0f172a", border:"none", borderRadius:9, color:"#fff",
                      fontWeight:700, fontSize:13, cursor:"pointer" }}>
                    ⬇ Baixar Relatório
                  </button>
                </div>
                <div style={{ border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden", background:"#fff" }}>
                  <iframe srcDoc={selected.html} title="Relatório Comercial"
                    style={{ width:"100%", border:"none", display:"block", minHeight:600 }}
                    onLoad={e => { try { e.target.style.height = e.target.contentDocument.body.scrollHeight + 32 + "px"; } catch {} }} />
                </div>
              </>
            ) : (
              <div style={{ textAlign:"center", color:"#94a3b8", padding:"48px 0", fontSize:14 }}>
                Nenhum relatório disponível para este bimestre.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Ponto Digital ─────────────────────────────────────────────────────

function PontoDigital({ user, onBack }) {
  const { t } = useTheme();
  const [signature,   setSignature]   = useState(null);
  const [carimbo,     setCarimbo]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [pdfFile,     setPdfFile]     = useState(null);
  const [pagesData,   setPagesData]   = useState([]); // [{ dataUrl, pdfW, pdfH }]
  const [pagesLoading,setPagesLoading]= useState(false);
  const [status,      setStatus]      = useState("idle");
  const [signedUrl,   setSignedUrl]   = useState(null);
  const [errMsg,      setErrMsg]      = useState("");
  // position per page: { xPct, yPct, pageIdx }
  const [sigPos,   setSigPos]   = useState({ xPct: 55, yPct: 80, pageIdx: 0 });
  const [stampPos, setStampPos] = useState({ xPct: 3,  yPct: 80, pageIdx: 0 });
  const [dragging, setDragging] = useState(null);
  const pageRefs      = useRef([]);
  const dragOffsetRef = useRef({ x: 0, y: 0, pageIdx: 0 });

  useEffect(() => {
    Promise.all([loadSignature(user.id), loadSignature("carimbo")]).then(([sig, car]) => {
      setSignature(sig); setCarimbo(car); setLoading(false);
    });
  }, [user.id]);

  useEffect(() => () => {
    if (signedUrl) URL.revokeObjectURL(signedUrl);
  }, [signedUrl]);

  async function handlePdf(f) {
    if (!f) return;
    if (!f.type.includes("pdf") && !f.name.endsWith(".pdf")) return;
    if (signedUrl) URL.revokeObjectURL(signedUrl);
    setPdfFile(f); setStatus("idle"); setSignedUrl(null);
    setPagesData([]); setPagesLoading(true);
    pageRefs.current = [];
    // Reset positions to bottom area defaults
    setSigPos({ xPct: 55, yPct: 80, pageIdx: 0 });
    setStampPos({ xPct: 3, yPct: 80, pageIdx: 0 });

    try {
      const pdfjsLib = await import("pdfjs-dist/build/pdf.min.js");
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
      }
      const arrayBuf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
      const rendered = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp0  = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 1200 / vp0.width);
        const vp   = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        rendered.push({ dataUrl: canvas.toDataURL("image/jpeg", 0.88), pdfW: vp0.width, pdfH: vp0.height });
      }
      setPagesData(rendered);
    } catch {
      // Fallback: blank A4 proportioned page
      try {
        const { PDFDocument } = await import("pdf-lib");
        const doc = await PDFDocument.load(await f.arrayBuffer());
        const pages = doc.getPages().map(p => { const { width, height } = p.getSize(); return { dataUrl: null, pdfW: width, pdfH: height }; });
        setPagesData(pages);
      } catch { setPagesData([{ dataUrl: null, pdfW: 595, pdfH: 842 }]); }
    } finally {
      setPagesLoading(false);
    }
  }

  async function handleSign() {
    if (!pdfFile || !signature) return;
    setStatus("processing");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const b64ToBuffer = b64 => {
        const base = b64.includes(",") ? b64.split(",")[1] : b64;
        const bin = atob(base);
        const buf = new ArrayBuffer(bin.length);
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return buf;
      };
      const pdfDoc = await PDFDocument.load(await pdfFile.arrayBuffer());
      const embedImg = async b64 => {
        const header = b64.split(",")[0].toLowerCase();
        const buf = b64ToBuffer(b64);
        return (header.includes("jpeg") || header.includes("jpg")) ? pdfDoc.embedJpg(buf) : pdfDoc.embedPng(buf);
      };
      const sigImg   = await embedImg(signature);
      const stampImg = carimbo ? await embedImg(carimbo) : null;
      const pdfPages = pdfDoc.getPages();
      for (let i = 0; i < pdfPages.length; i++) {
        const page = pdfPages[i];
        const { width, height } = page.getSize();
        if (stampImg && stampPos.pageIdx === i) {
          const d  = stampImg.scaleToFit(90, 90);
          const px = (stampPos.xPct / 100) * width;
          const py = height - (stampPos.yPct / 100) * height - d.height;
          page.drawImage(stampImg, { x: Math.max(0, px), y: Math.max(0, py), width: d.width, height: d.height });
        }
        if (sigPos.pageIdx === i) {
          const sd = sigImg.scaleToFit(160, 55);
          const px = (sigPos.xPct / 100) * width;
          const py = height - (sigPos.yPct / 100) * height - sd.height;
          page.drawImage(sigImg, { x: Math.max(0, px), y: Math.max(0, py), width: sd.width, height: sd.height });
        }
      }
      const saved = await pdfDoc.save();
      const buf = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength);
      const url = URL.createObjectURL(new Blob([buf], { type:"application/pdf" }));
      setSignedUrl(url); setStatus("done");
    } catch(e) {
      console.error(e);
      setErrMsg("Erro ao processar o PDF. Verifique se o arquivo não está protegido por senha.");
      setStatus("error");
    }
  }

  function handleDownload() {
    if (!signedUrl || !pdfFile) return;
    const a = document.createElement("a");
    a.href = signedUrl;
    a.download = pdfFile.name.replace(/\.pdf$/i,"") + "_assinado.pdf";
    a.click();
  }

  function startDrag(which, e, pageIdx) {
    e.preventDefault(); e.stopPropagation();
    const el = pageRefs.current[pageIdx];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pos  = which === "sig" ? sigPos : stampPos;
    dragOffsetRef.current = {
      x: (e.clientX - rect.left) - (pos.xPct / 100) * rect.width,
      y: (e.clientY - rect.top)  - (pos.yPct / 100) * rect.height,
      pageIdx,
    };
    setDragging(which);
  }

  function onContainerDrag(e) {
    if (!dragging) return;
    // Find which page the mouse is currently over
    let targetIdx  = dragOffsetRef.current.pageIdx;
    let targetRect = null;
    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) { targetIdx = i; targetRect = r; break; }
    }
    if (!targetRect) {
      const el = pageRefs.current[targetIdx];
      if (el) targetRect = el.getBoundingClientRect();
    }
    if (!targetRect) return;
    const newX = Math.max(0, Math.min(88, ((e.clientX - targetRect.left - dragOffsetRef.current.x) / targetRect.width)  * 100));
    const newY = Math.max(0, Math.min(92, ((e.clientY - targetRect.top  - dragOffsetRef.current.y) / targetRect.height) * 100));
    dragOffsetRef.current.pageIdx = targetIdx;
    if (dragging === "sig") setSigPos({ xPct: newX, yPct: newY, pageIdx: targetIdx });
    else setStampPos({ xPct: newX, yPct: newY, pageIdx: targetIdx });
  }

  function stopDrag() { setDragging(null); }

  const dragStyle = (pos, which) => ({
    position:"absolute",
    left:`${pos.xPct}%`, top:`${pos.yPct}%`,
    height:"7%", maxWidth:"28%",
    objectFit:"contain",
    cursor: dragging === which ? "grabbing" : "grab",
    borderRadius:4, padding:3,
    background:"rgba(255,255,255,0.92)",
    border:`2px dashed ${dragging === which ? "#6366f1" : "rgba(99,102,241,0.7)"}`,
    boxShadow:"0 2px 10px rgba(0,0,0,0.2)",
    userSelect:"none",
  });

  const canSign = pdfFile && signature && pagesData.length > 0;

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:t.pageBg, ...FF }}>

      {/* Header */}
      <div style={{ background:t.header, padding:"0 24px", display:"flex", alignItems:"center", gap:14, height:58, flexShrink:0, zIndex:50, boxShadow:"0 2px 12px rgba(0,0,0,0.4)" }}>
        <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", color:"#94a3b8", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:13, ...FF }}>← Voltar</button>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>📄</span>
          <span style={{ color:"#f8fafc", fontWeight:800, fontSize:16 }}>Ponto Digital</span>
        </div>
        {(signature || carimbo) && pagesData.length > 0 && (
          <span style={{ fontSize:11, color:"rgba(167,139,250,0.8)", marginLeft:8 }}>
            Arraste a assinatura/carimbo para a posição desejada no documento
          </span>
        )}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:12 }}>
          <DarkToggle />
          <Avatar name={user.name} color={user.color||"#6366f1"} size={30} />
          <span style={{ color:"#cbd5e1", fontWeight:500, fontSize:13 }}>{user.name}</span>
        </div>
      </div>

      {loading ? (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:t.textMuted, fontSize:15 }}>Carregando...</div>
      ) : (
        <div style={{ flex:1, display:"grid", gridTemplateColumns:"240px 1fr", overflow:"hidden" }}>

          {/* ── Painel esquerdo: controles ── */}
          <div style={{ borderRight:`1px solid ${t.border}`, padding:16, display:"flex", flexDirection:"column", gap:14, overflowY:"auto", background:t.card }}>

            <div style={{ background:signature?"#f0fdf4":"#fffbeb", border:`1px solid ${signature?"#86efac":"#fcd34d"}`, borderRadius:12, padding:"12px 14px", display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{signature?"✅":"⚠️"}</span>
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:signature?"#166534":"#92400e" }}>{signature ? "Assinatura ok" : "Sem assinatura"}</div>
                <div style={{ fontSize:11, color:signature?"#15803d":"#b45309", marginTop:2 }}>{signature ? "Arraste no documento →" : "Solicite ao administrador."}</div>
              </div>
            </div>

            <div style={{ background:t.pageBg, border:`1px solid ${t.border}`, borderRadius:12, padding:14 }}>
              <div style={{ fontWeight:700, fontSize:13, color:t.text, marginBottom:10 }}>PDF do Ponto</div>
              {!pdfFile ? (
                <label style={{ display:"block", cursor:"pointer" }}>
                  <div
                    onDragOver={e=>{e.preventDefault(); e.currentTarget.style.borderColor="#6366f1";}}
                    onDragLeave={e=>{e.currentTarget.style.borderColor=t.border;}}
                    onDrop={e=>{e.preventDefault(); handlePdf(e.dataTransfer.files[0]);}}
                    style={{ border:`2px dashed ${t.border}`, borderRadius:10, padding:"24px 12px", textAlign:"center", transition:"border-color 0.2s" }}>
                    <div style={{ fontSize:28, marginBottom:6 }}>📎</div>
                    <div style={{ fontWeight:600, fontSize:12, color:t.text }}>Clique ou arraste o PDF</div>
                  </div>
                  <input type="file" accept="application/pdf,.pdf" style={{ display:"none" }} onChange={e=>{handlePdf(e.target.files?.[0]); e.target.value="";}} />
                </label>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:8, border:`1px solid ${t.border}`, borderRadius:8, padding:"8px 12px" }}>
                  <span style={{ fontSize:18 }}>📄</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:11, color:t.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{pdfFile.name}</div>
                    <div style={{ fontSize:10, color:t.textMuted }}>{(pdfFile.size/1024).toFixed(0)} KB · {pagesData.length || "?"} pág.</div>
                  </div>
                  <button onClick={()=>{if(signedUrl)URL.revokeObjectURL(signedUrl); setPdfFile(null); setPagesData([]); setStatus("idle"); setSignedUrl(null);}}
                    style={{ background:"#fee2e2", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:12, color:"#dc2626" }}>✕</button>
                </div>
              )}
            </div>

            <div style={{ marginTop:"auto", display:"flex", flexDirection:"column", gap:8 }}>
              {status === "idle" && (
                <button onClick={handleSign} disabled={!canSign}
                  style={{ width:"100%", padding:"12px", borderRadius:8, border:"none", fontWeight:600, fontSize:14, cursor:canSign?"pointer":"not-allowed", background:canSign?"#6366f1":"#e2e8f0", color:canSign?"#fff":t.textMuted, ...FF }}>
                  ✍️  Assinar PDF
                </button>
              )}
              {status === "processing" && (
                <button disabled style={{ width:"100%", padding:13, borderRadius:12, border:"none", fontWeight:700, fontSize:14, background:"#e2e8f0", color:t.textMuted, cursor:"not-allowed", ...FF }}>⏳  Processando…</button>
              )}
              {status === "done" && (<>
                <button onClick={handleDownload} style={{ width:"100%", padding:"12px", borderRadius:8, border:"none", fontWeight:600, fontSize:14, cursor:"pointer", background:"#16a34a", color:"#fff", ...FF }}>Baixar PDF Assinado</button>
                <button onClick={()=>{setStatus("idle");setSignedUrl(null);}} style={{ width:"100%", padding:11, borderRadius:12, border:`1px solid ${t.border}`, fontWeight:600, fontSize:13, cursor:"pointer", background:t.btnSecBg, color:t.btnSecText, ...FF }}>Assinar outro PDF</button>
              </>)}
              {status === "error" && (<>
                <div style={{ background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:10, padding:"10px 12px", fontSize:12, color:"#dc2626" }}>⚠️ {errMsg}</div>
                <button onClick={()=>setStatus("idle")} style={{ width:"100%", padding:11, borderRadius:12, border:`1px solid ${t.border}`, fontWeight:600, fontSize:13, cursor:"pointer", background:t.btnSecBg, color:t.btnSecText, ...FF }}>Tentar novamente</button>
              </>)}
            </div>

          </div>

          {/* ── Área direita: PDF renderizado com overlays arrastáveis ── */}
          <div
            style={{ overflow:"auto", background:"#374151", cursor: dragging ? "grabbing" : "default", userSelect:"none" }}
            onMouseMove={onContainerDrag}
            onMouseUp={stopDrag}
            onMouseLeave={stopDrag}
          >
            {pagesLoading ? (
              <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
                <div style={{ fontSize:28 }}>⏳</div>
                <span style={{ fontSize:13, color:"rgba(255,255,255,0.6)" }}>Carregando documento…</span>
              </div>
            ) : pagesData.length > 0 ? (
              <div style={{ padding:"24px 40px", display:"flex", flexDirection:"column", gap:20, alignItems:"center" }}>
                {pagesData.map((pg, idx) => (
                  <div
                    key={idx}
                    ref={el => pageRefs.current[idx] = el}
                    style={{ position:"relative", width:"100%", maxWidth:900, boxShadow:"0 4px 24px rgba(0,0,0,0.5)", background:"#fff" }}
                  >
                    {pg.dataUrl ? (
                      <img src={pg.dataUrl} draggable={false} style={{ display:"block", width:"100%", height:"auto", pointerEvents:"none" }} />
                    ) : (
                      <div style={{ paddingBottom:`${(pg.pdfH/pg.pdfW)*100}%`, position:"relative", background:"#fff" }}>
                        <div style={{ position:"absolute", inset:0 }}>
                          {[10,20,30,40,50,60,70,80,90].map(y => (
                            <div key={y} style={{ position:"absolute", top:`${y}%`, left:"6%", right:"6%", height:1, background:"rgba(0,0,0,0.05)" }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Stamp on this page */}
                    {carimbo && stampPos.pageIdx === idx && (
                      <img src={carimbo} alt="carimbo" draggable={false}
                        onMouseDown={e => startDrag("stamp", e, idx)}
                        style={dragStyle(stampPos, "stamp")} />
                    )}
                    {/* Signature on this page */}
                    {signature && sigPos.pageIdx === idx && (
                      <img src={signature} alt="assinatura" draggable={false}
                        onMouseDown={e => startDrag("sig", e, idx)}
                        style={dragStyle(sigPos, "sig")} />
                    )}
                    {pagesData.length > 1 && (
                      <div style={{ position:"absolute", top:8, right:10, fontSize:10, color:"rgba(0,0,0,0.3)", fontWeight:600 }}>
                        {idx + 1} / {pagesData.length}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14 }}>
                <span style={{ fontSize:56, opacity:0.2 }}>📄</span>
                <span style={{ fontSize:14, color:"rgba(255,255,255,0.4)" }}>Carregue um PDF para começar</span>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default function App() {
  const [view,     setView]     = useState(() => new URLSearchParams(window.location.search).get("relatorio")==="1" ? "public-report" : "login");
  const [user,     setUser]     = useState(null);
  const [openPage, setOpenPage] = useState(null);
  const [openEmps, setOpenEmps] = useState([]);
  const [dark,     setDark]     = useState(() => localStorage.getItem("theme") === "dark");

  const toggle = () => setDark(d => {
    const next = !d;
    localStorage.setItem("theme", next ? "dark" : "light");
    return next;
  });

  const t = dark ? THEMES.dark : THEMES.light;

  useEffect(() => {
    const s = document.createElement("style");
    s.setAttribute("data-ds", "1");
    s.textContent = `
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; -webkit-font-smoothing: antialiased; }
      button, input, select, textarea { font-family: 'Segoe UI', system-ui, sans-serif; }
      button:focus-visible, a:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
      input:focus, select:focus, textarea:focus { box-shadow: 0 0 0 3px rgba(99,102,241,0.15) !important; border-color: #6366f1 !important; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    `;
    if (!document.querySelector("[data-ds]")) document.head.appendChild(s);
    return () => { const el = document.querySelector("[data-ds]"); if (el) document.head.removeChild(el); };
  }, []);

  const logout = () => { if (user) deleteDoc(doc(db,"presence",user.id)).catch(()=>{}); setUser(null); setView("login"); setOpenPage(null); };

  useEffect(() => {
    if (!user) return;

    const ref = doc(db, "presence", user.id);

    const isAfterWork = () => {
      const now = new Date();
      const day = now.getDay(); // 0=dom, 6=sab
      if (day === 0 || day === 6) return true;
      return now.getHours() > WORK_END.hour || (now.getHours() === WORK_END.hour && now.getMinutes() >= WORK_END.minute);
    };

    const update = status => setDoc(ref, { uid: user.id, status }, { merge: false }).catch(() => {});

    // Status inicial — escreve imediatamente ao logar
    update(isAfterWork() ? "away" : "online");

    // Visibilidade da aba (minimizar / trocar de aba)
    const onVisibility = () => update(document.hidden || isAfterWork() ? "away" : "online");

    // Foco da janela (alt+tab / outro app) — debounce longo para ignorar blur de navegação interna
    let blurTimer;
    const onBlur     = () => { blurTimer = setTimeout(() => update("away"), 20000); };
    const onFocus    = () => { clearTimeout(blurTimer); update(isAfterWork() ? "away" : "online"); };
    const onActivity = () => { clearTimeout(blurTimer); };

    // Checar horário a cada minuto + heartbeat de presença
    const clock = setInterval(() => {
      if (isAfterWork()) update("away");
      else if (!document.hidden) update("online");
    }, 30000);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur",     onBlur);
    window.addEventListener("focus",    onFocus);
    window.addEventListener("click",    onActivity);
    window.addEventListener("keydown",  onActivity);

    return () => {
      clearTimeout(blurTimer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur",     onBlur);
      window.removeEventListener("focus",    onFocus);
      window.removeEventListener("click",    onActivity);
      window.removeEventListener("keydown",  onActivity);
    };
  }, [user?.id]);
  const goHome       = () => { setOpenPage(null); setView("home"); };
  const goPonto      = () => setView("ponto");
  // Satisfação pode ser aberta pela tela inicial ou pela planilha; "Voltar" retorna para a origem.
  const [satFrom, setSatFrom] = useState("home");
  const goSatisfacao = (from = "home") => { setSatFrom(from); setView("satisfacao"); };
  const goPage       = (pg, emps) => { setOpenPage(pg); setOpenEmps(emps||[]); setView("page"); };
  const goGestao     = () => setView("gestao");
  const goInad       = () => setView("inadimplentes");

  return (
    <ThemeCtx.Provider value={{ t, dark, toggle }}>
      {view === "public-report" && <PublicReport />}
      {view === "admin"   && <AdminPanel onBack={() => setView("login")} onGestao={goGestao} />}
      {view === "login"   && <LoginScreen onLogin={u=>{setUser(u);setView("home");}} onAdmin={()=>setView("admin")} />}
      {view === "page"    && openPage && <PageDetail page={openPage} initEmployees={openEmps} user={user} onBack={goHome} onLogout={logout} onSatisfacao={() => goSatisfacao("page")} />}
      {view === "gestao"  && <GestaoComercial onBack={() => setView("admin")} onLogout={logout} />}
      {view === "home"        && user && <HomeScreen user={user} onOpenPage={goPage} onLogout={logout} onGestao={goGestao} onPonto={goPonto} onSatisfacao={() => goSatisfacao("home")} onInadimplentes={goInad} />}
      {view === "ponto"       && user && <PontoDigital user={user} onBack={goHome} />}
      {view === "inadimplentes" && user?.acessoInadimplentes && <InadimplentesScreen user={user} onBack={goHome} />}
      {view === "satisfacao"  && user && <SatisfacaoView user={user} onBack={satFrom === "page" && openPage ? () => setView("page") : goHome} />}
      {isSafeMode && (
        <div style={{ position:"fixed", left:0, right:0, bottom:0, zIndex:99999, background:"repeating-linear-gradient(135deg,#f59e0b 0 14px,#d97706 14px 28px)", color:"#1c1917", textAlign:"center", padding:"6px 12px", fontSize:12.5, fontWeight:800, letterSpacing:0.3, boxShadow:"0 -2px 10px rgba(0,0,0,0.3)", pointerEvents:"none", ...FF }}>
          🧪 MODO SEGURO — banco de TESTE (cópia do backup de {import.meta.env.VITE_SAFE_BACKUP_LABEL || "?"}). Nada aqui afeta os dados reais.
        </div>
      )}
    </ThemeCtx.Provider>
  );
}
