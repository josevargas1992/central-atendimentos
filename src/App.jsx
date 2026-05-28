import { useState, useEffect, useRef, createContext, useContext } from "react";
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, writeBatch, query, where, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";

// ── Constants ─────────────────────────────────────────────────────────

const ADMIN_CRED = { id:"admin", password:"462b525C" };

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
  "Em atendimento": { bg:"#fef3c7", text:"#92400e", dot:"#f59e0b" },
  "Resolvido":      { bg:"#dcfce7", text:"#166534", dot:"#22c55e" },
  "Pendente":       { bg:"#fee2e2", text:"#991b1b", dot:"#f87171" },
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
  const c = STATUS_CFG[status] || { bg:"#f1f5f9", text:"#475569", dot:"#94a3b8" };
  return <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:c.bg, color:c.text, padding:"4px 10px 4px 7px", borderRadius:20, fontSize:11.5, fontWeight:600, whiteSpace:"nowrap" }}><span style={{ width:7, height:7, borderRadius:"50%", background:c.dot, flexShrink:0 }} />{status}</span>;
}
function TipoBadge({ tipo, tipoObj, onClick }) {
  const c = tipoObj || TIPO_CFG[tipo] || { bg:"#f1f5f9", text:"#475569" };
  return <span onClick={onClick} style={{ background:c.bg, color:c.text, padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:"nowrap", display:"inline-block", cursor:onClick?"pointer":"default" }}>{tipo}</span>;
}
function ViaBadge({ via }) {
  const map = { Ticket:["🎫","#6366f1"], WhatsApp:["💬","#22c55e"], Telefone:["📞","#0ea5e9"], Telegram:["✈️","#229ED9"] };
  const [icon, color] = map[via] || ["📋","#64748b"];
  return <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12.5, color, fontWeight:500 }}><span>{icon}</span>{via}</span>;
}
function DeptBadge({ dept }) {
  return <span style={{ background:"#f1f5f9", color:"#475569", padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:"nowrap", display:"inline-block" }}>{dept}</span>;
}

function Overlay({ children, z=1000 }) {
  return <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.78)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:z, padding:16, ...FF }}>{children}</div>;
}

function ModalShell({ title, onClose, children, footer, maxWidth=560 }) {
  const { t } = useTheme();
  return (
    <Overlay>
      <div style={{ background:t.card, borderRadius:20, width:"100%", maxWidth, maxHeight:"92vh", display:"flex", flexDirection:"column", boxShadow:"0 30px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"20px 24px 16px", borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:t.text }}>{title}</h2>
          <button onClick={onClose} style={{ background:t.btnSecBg, border:"none", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16, color:t.text, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        <div style={{ padding:"20px 24px", overflowY:"auto", flex:1 }}>{children}</div>
        {footer && <div style={{ padding:"16px 24px", borderTop:`1px solid ${t.border}`, flexShrink:0 }}>{footer}</div>}
      </div>
    </Overlay>
  );
}

function Field({ label, children }) {
  const { t } = useTheme();
  return <div style={{ marginBottom:16 }}><label style={{ display:"block", fontSize:11, fontWeight:700, color:t.textMuted, textTransform:"uppercase", letterSpacing:"0.6px", marginBottom:6 }}>{label}</label>{children}</div>;
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:"#1e293b", color:"#f8fafc", padding:"12px 22px", borderRadius:12, fontSize:14, fontWeight:500, boxShadow:"0 8px 24px rgba(0,0,0,0.3)", zIndex:3000, whiteSpace:"nowrap" }}>{msg}</div>;
}

const btnP = (dis) => ({ flex:1, padding:12, background:dis?"#cbd5e1":"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor:dis?"not-allowed":"pointer", ...FF });
const btnD = { flex:1, padding:12, background:"#dc2626", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF };

function ConfirmDialog({ message, onConfirm, onCancel }) {
  const { t } = useTheme();
  return (
    <Overlay z={1100}>
      <div style={{ background:t.card, borderRadius:18, padding:32, maxWidth:400, width:"90%", textAlign:"center", boxShadow:"0 20px 50px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize:44, marginBottom:12 }}>⚠️</div>
        <h3 style={{ margin:"0 0 8px", color:t.text, fontSize:17 }}>Tem certeza?</h3>
        <p style={{ color:t.textSub, fontSize:14, margin:"0 0 24px", lineHeight:1.6 }}>{message}</p>
        <div style={{ display:"flex", gap:12 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, background:t.btnSecBg, border:"none", borderRadius:10, color:t.btnSecText, fontWeight:600, fontSize:14, cursor:"pointer", ...FF }}>Cancelar</button>
          <button onClick={onConfirm} style={btnD}>Confirmar</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Storage helpers (Firestore) ───────────────────────────────────────

async function getCol(colName) {
  const snap = await getDocs(collection(db, colName));
  return snap.docs.map(d => d.data());
}

async function syncCol(colName, list, idKey = "id") {
  const snap = await getDocs(collection(db, colName));
  const batch = writeBatch(db);
  const kept = new Set(list.map(x => String(x[idKey])));
  snap.docs.forEach(d => { if (!kept.has(d.id)) batch.delete(d.ref); });
  list.forEach(x => batch.set(doc(db, colName, String(x[idKey])), x));
  await batch.commit();
}

async function loadEmployees() {
  try {
    const data = await getCol("employees");
    if (data.length) return data;
    await syncCol("employees", DEFAULT_EMPLOYEES);
    return DEFAULT_EMPLOYEES;
  } catch { return DEFAULT_EMPLOYEES; }
}

async function loadPages() {
  try {
    const data = await getCol("pages");
    if (data.length) return data;
    const batch = writeBatch(db);
    batch.set(doc(db, "pages", SEED_PAGE.id), SEED_PAGE);
    SEED_RECORDS.forEach(r => batch.set(doc(db, "records", `${SEED_PAGE.id}-${r.id}`), { ...r, pageId: SEED_PAGE.id }));
    await batch.commit();
    return [SEED_PAGE];
  } catch { return [SEED_PAGE]; }
}

async function savePages(list) {
  try { await syncCol("pages", list); } catch {}
}

async function loadRecords(pageId) {
  try {
    const q = query(collection(db, "records"), where("pageId", "==", pageId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data()).sort((a, b) => a.id - b.id);
  } catch { return []; }
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
  try {
    const data = await getCol("tipos");
    if (data.length) return data;
    await syncCol("tipos", DEFAULT_TIPOS);
    return DEFAULT_TIPOS;
  } catch { return DEFAULT_TIPOS; }
}

async function saveTipos(list) {
  try { await syncCol("tipos", list); } catch {}
}

async function loadDepartments() {
  try {
    const data = await getCol("departments");
    if (data.length) return data;
    await syncCol("departments", DEFAULT_DEPARTMENTS);
    return DEFAULT_DEPARTMENTS;
  } catch { return DEFAULT_DEPARTMENTS; }
}

async function saveDepartments(list) {
  try { await syncCol("departments", list); } catch {}
}

// ── Department Modal ──────────────────────────────────────────────────

function DepartmentModal({ dept, onSave, onClose }) {
  const { t } = useTheme();
  const inp = { width:"100%", padding:"9px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:9, fontSize:14, color:t.inputText, outline:"none", boxSizing:"border-box", background:t.inputBg, ...FF };
  const bS  = { flex:1, padding:12, background:t.btnSecBg, border:"none", borderRadius:10, color:t.btnSecText, fontWeight:600, fontSize:14, cursor:"pointer", ...FF };

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
      footer={<div style={{ display:"flex", gap:12 }}><button onClick={onClose} style={bS}>Cancelar</button><button onClick={submit} style={btnP(false)}>{editing ? "Salvar Alterações" : "Criar Departamento"}</button></div>}
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
  const inp = { width:"100%", padding:"9px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:9, fontSize:14, color:t.inputText, outline:"none", boxSizing:"border-box", background:t.inputBg, ...FF };
  const sel = { ...inp, cursor:"pointer" };
  const bS  = { flex:1, padding:12, background:t.btnSecBg, border:"none", borderRadius:10, color:t.btnSecText, fontWeight:600, fontSize:14, cursor:"pointer", ...FF };

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
      footer={<div style={{ display:"flex", gap:12 }}><button onClick={onClose} style={bS}>Cancelar</button><button onClick={submit} style={btnP(false)}>{editing ? "Salvar Alterações" : "Criar Tipo"}</button></div>}
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
  const bS = { padding:"10px 18px", background:t.btnSecBg, border:"none", borderRadius:10, color:t.btnSecText, fontWeight:600, fontSize:14, cursor:"pointer", ...FF };

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
          {[["TOTAL",cnt.total,"#1e293b"],["RESOLVIDOS",cnt.resolved,"#16a34a"],["EM ABERTO",cnt.inProgress,"#d97706"]].map(([l,v,c])=>(
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
  const inp = { width:"100%", padding:"9px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:9, fontSize:14, color:t.inputText, outline:"none", boxSizing:"border-box", background:t.inputBg, ...FF };
  const sel = { ...inp, cursor:"pointer" };
  const bS  = { flex:1, padding:12, background:t.btnSecBg, border:"none", borderRadius:10, color:t.btnSecText, fontWeight:600, fontSize:14, cursor:"pointer", ...FF };

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
      footer={<div style={{ display:"flex", gap:12 }}><button onClick={onClose} style={bS}>Cancelar</button><button onClick={submit} style={btnP(false)}>{editing?"Salvar Alterações":"Criar Planilha"}</button></div>}
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
  const inp = { width:"100%", padding:"9px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:9, fontSize:14, color:t.inputText, outline:"none", boxSizing:"border-box", background:t.inputBg, ...FF };
  const sel = { ...inp, cursor:"pointer" };
  const bS  = { flex:1, padding:12, background:t.btnSecBg, border:"none", borderRadius:10, color:t.btnSecText, fontWeight:600, fontSize:14, cursor:"pointer", ...FF };

  const editing = !!employee;
  const [name,       setName]       = useState(employee?.name       || "");
  const [password,   setPassword]   = useState(employee?.password   || "");
  const [color,      setColor]      = useState(employee?.color      || PALETTE[0]);
  const [department, setDepartment] = useState(employee?.department || departments[0]?.name || "");
  const [showPw,     setShowPw]     = useState(false);
  const [error,      setError]      = useState("");

  const submit = () => {
    if (!name.trim())     return setError("O nome é obrigatório.");
    if (!password.trim()) return setError("A senha é obrigatória.");
    onSave({ id: employee?.id || (slugify(name.trim()) || String(Date.now())), name:name.trim(), password:password.trim(), color, department });
  };

  return (
    <ModalShell title={editing?"✏️  Editar Atendente":"➕  Novo Atendente"} onClose={onClose} maxWidth={460}
      footer={<div style={{ display:"flex", gap:12 }}><button onClick={onClose} style={bS}>Cancelar</button><button onClick={submit} style={btnP(false)}>{editing?"Salvar Alterações":"Cadastrar Atendente"}</button></div>}
    >
      <Field label="Nome *">
        <input value={name} onChange={e=>{setName(e.target.value);setError("");}} style={inp} placeholder="Ex: Maria Silva" autoFocus />
      </Field>
      <Field label="Senha de acesso *">
        <div style={{ position:"relative" }}>
          <input type={showPw?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} style={{ ...inp, paddingRight:44 }} placeholder="Defina uma senha..." />
          <button onClick={()=>setShowPw(v=>!v)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:t.textMuted, cursor:"pointer", fontSize:17, padding:4 }}>{showPw?"👁":"👁️"}</button>
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
  const [modal,       setModal]       = useState(null);
  const [confirmId,   setConfirmId]   = useState(null);
  const [confirmType, setConfirmType] = useState(null);
  const [toast,       setToast]       = useState("");

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(""), 3000); };

  useEffect(() => {
    (async () => {
      const [emps, pgs, tps, depts] = await Promise.all([loadEmployees(), loadPages(), loadTipos(), loadDepartments()]);
      const sorted = [...pgs].sort((a,b)=>b.year!==a.year?b.year-a.year:b.month-a.month);
      setEmployees(emps); setPages(sorted); setTipos(tps); setDepartments(depts);
      const cnts = {};
      await Promise.all(sorted.map(async p => {
        const recs = await loadRecords(p.id);
        cnts[p.id] = { total:recs.length, resolved:recs.filter(r=>r.status==="Resolvido").length, inProgress:recs.filter(r=>r.status==="Em atendimento").length };
      }));
      setCounts(cnts); setLoading(false);
    })();
  }, []);

  const persistPages = async list => {
    const sorted = [...list].sort((a,b)=>b.year!==a.year?b.year-a.year:b.month-a.month);
    setPages(sorted); await savePages(sorted);
  };

  const savePage = async pg => {
    const isEdit = modal.mode === "edit";
    const updated = isEdit ? pages.map(p=>p.id===pg.id?pg:p) : [...pages, pg];
    await persistPages(updated);
    if (!isEdit) setCounts(c=>({...c,[pg.id]:{total:0,resolved:0,inProgress:0}}));
    showToast(isEdit ? "✓  Planilha atualizada." : "✓  Planilha criada.");
    setModal(null);
  };

  const deletePage = async () => {
    const pg = pages.find(p=>p.id===confirmId);
    await persistPages(pages.filter(p=>p.id!==confirmId));
    await deletePageRecords(confirmId);
    showToast("🗑️  Planilha \"" + (pg?.name||"") + "\" excluída.");
    setConfirmId(null); setConfirmType(null);
  };

  const persistEmployees = async list => { setEmployees(list); try { await syncCol("employees", list); } catch {}; };

  const persistTipos = async list => { setTipos(list); await saveTipos(list); };

  const persistDepartments = async list => { setDepartments(list); await saveDepartments(list); };

  const saveDeptFn = async dept => {
    const isEdit = modal.mode === "edit";
    const updated = isEdit ? departments.map(d=>d.id===dept.id?dept:d) : [...departments, dept];
    await persistDepartments(updated);
    showToast(isEdit ? `✓  "${dept.name}" atualizado.` : `✓  "${dept.name}" criado.`);
    setModal(null);
  };

  const deleteDept = async () => {
    const dept = departments.find(d=>d.id===confirmId);
    await persistDepartments(departments.filter(d=>d.id!==confirmId));
    showToast(`🗑️  "${dept?.name||"Departamento"}" removido.`);
    setConfirmId(null); setConfirmType(null);
  };

  const saveTipoFn = async tp => {
    const isEdit = modal.mode === "edit";
    const updated = isEdit ? tipos.map(x=>x.id===tp.id?tp:x) : [...tipos, tp];
    await persistTipos(updated);
    showToast(isEdit ? `✓  Tipo "${tp.label}" atualizado.` : `✓  Tipo "${tp.label}" criado.`);
    setModal(null);
  };

  const deleteTipo = async () => {
    const tp = tipos.find(x=>x.id===confirmId);
    await persistTipos(tipos.filter(x=>x.id!==confirmId));
    showToast(`🗑️  Tipo "${tp?.label||""}" removido.`);
    setConfirmId(null); setConfirmType(null);
  };

  const saveEmployee = async emp => {
    const isEdit = modal.mode === "edit";
    let updated;
    if (isEdit) { updated = employees.map(e=>e.id===emp.id?emp:e); }
    else {
      if (employees.find(e=>e.id===emp.id)) emp.id = emp.id+"-"+Date.now();
      updated = [...employees, emp];
    }
    await persistEmployees(updated);
    showToast(isEdit ? `✓  ${emp.name} atualizado.` : `✓  ${emp.name} cadastrado.`);
    setModal(null);
  };

  const deleteEmployee = async () => {
    const emp = employees.find(e=>e.id===confirmId);
    await persistEmployees(employees.filter(e=>e.id!==confirmId));
    showToast("🗑️  " + (emp?.name||"Atendente") + " removido.");
    setConfirmId(null); setConfirmType(null);
  };

  const tabBtn = (key, label) => (
    <button onClick={()=>setTab(key)} style={{ padding:"10px 22px", border:"none", borderRadius:10, fontWeight:700, fontSize:14, cursor:"pointer", ...FF, background: tab===key ? t.tabActiveBg : "transparent", color: tab===key ? t.tabActiveText : t.tabInactiveText, transition:"all 0.15s" }}>
      {label}
    </button>
  );

  const cur = nowMY();

  return (
    <div style={{ minHeight:"100vh", background:t.pageBg, ...FF }}>

      <div style={{ background:t.header, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 12px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", color:"#94a3b8", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:13, ...FF }}>← Sair do Admin</button>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:9, background:"linear-gradient(135deg,#f59e0b,#ef4444)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚙️</div>
            <span style={{ color:"#f8fafc", fontWeight:800, fontSize:16 }}>Painel Administrativo</span>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <DarkToggle />
          {tab === "planilhas" && <button onClick={()=>setModal({mode:"add",type:"page"})} style={{ padding:"8px 18px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>+ Nova Planilha</button>}
          {tab === "atendentes" && <button onClick={()=>setModal({mode:"add",type:"emp"})}  style={{ padding:"8px 18px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>+ Novo Atendente</button>}
          {tab === "tipos"         && <button onClick={()=>setModal({mode:"add",type:"tipo"})} style={{ padding:"8px 18px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>+ Novo Tipo</button>}
          {tab === "departamentos" && <button onClick={()=>setModal({mode:"add",type:"dept"})} style={{ padding:"8px 18px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>+ Novo Departamento</button>}
        </div>
      </div>

      <div style={{ background:t.metaBg, borderBottom:`1px solid ${t.metaBorder}`, padding:"10px 24px", display:"flex", alignItems:"center", gap:4 }}>
        {tabBtn("planilhas",     "📋  Planilhas")}
        {tabBtn("atendentes",    "👥  Atendentes")}
        {tabBtn("tipos",         "🏷️  Tipos")}
        {tabBtn("departamentos", "🏢  Departamentos")}
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
        {loading ? <div style={{ textAlign:"center", padding:80, color:t.textMuted }}>Carregando...</div> : (

          tab === "planilhas" ? (
            pages.length === 0 ? (
              <div style={{ textAlign:"center", padding:80, background:t.card, borderRadius:18, border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:56, marginBottom:16 }}>📋</div>
                <div style={{ fontSize:18, fontWeight:700, color:t.text, marginBottom:8 }}>Nenhuma planilha criada</div>
                <div style={{ fontSize:14, color:t.textMuted, marginBottom:24 }}>Crie a primeira planilha — ela ficará visível para todos os atendentes.</div>
                <button onClick={()=>setModal({mode:"add",type:"page"})} style={{ padding:"12px 28px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", ...FF }}>+ Criar primeira planilha</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:16 }}>
                {pages.map(pg => (
                  <PageCard key={pg.id} pg={pg} employees={employees} cnt={counts[pg.id]||{total:0,resolved:0,inProgress:0}} isCurrentMonth={pg.month===cur.month&&pg.year===cur.year} onClick={()=>{}}
                    actions={<>
                      <button onClick={()=>setModal({mode:"edit",type:"page",page:pg})} style={{ background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:8, padding:"5px 9px", cursor:"pointer", fontSize:13 }}>✏️</button>
                      <button onClick={()=>{setConfirmId(pg.id);setConfirmType("page");}} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"5px 9px", cursor:"pointer", fontSize:13 }}>🗑️</button>
                    </>}
                  />
                ))}
              </div>
            )
          ) : tab === "atendentes" ? (
            employees.length === 0 ? (
              <div style={{ textAlign:"center", padding:80, background:t.card, borderRadius:18, border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:52, marginBottom:14 }}>👥</div>
                <div style={{ fontSize:17, fontWeight:700, color:t.text, marginBottom:8 }}>Nenhum atendente cadastrado</div>
                <button onClick={()=>setModal({mode:"add",type:"emp"})} style={{ marginTop:8, padding:"10px 24px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>+ Criar primeiro atendente</button>
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
                <button onClick={()=>setModal({mode:"add",type:"tipo"})} style={{ marginTop:8, padding:"10px 24px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>+ Criar primeiro tipo</button>
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
                              <button onClick={()=>setModal({mode:"edit",type:"tipo",tipo:tp})} style={{ background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:8, padding:"5px 9px", cursor:"pointer", fontSize:13 }}>✏️</button>
                              <button onClick={()=>{setConfirmId(tp.id);setConfirmType("tipo");}} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"5px 9px", cursor:"pointer", fontSize:13 }}>🗑️</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )
          ) : (
            // ── Departamentos tab ──────────────────────────────────
            departments.length === 0 ? (
              <div style={{ textAlign:"center", padding:80, background:t.card, borderRadius:18, border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:52, marginBottom:14 }}>🏢</div>
                <div style={{ fontSize:17, fontWeight:700, color:t.text, marginBottom:8 }}>Nenhum departamento cadastrado</div>
                <button onClick={()=>setModal({mode:"add",type:"dept"})} style={{ marginTop:8, padding:"10px 24px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>+ Criar primeiro departamento</button>
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
                    <button onClick={()=>setModal({mode:"edit",type:"dept",dept})} style={{ background:t.btnSecBg, border:`1px solid ${t.border}`, borderRadius:8, padding:"5px 9px", cursor:"pointer", fontSize:13, flexShrink:0 }}>✏️</button>
                    <button onClick={()=>{setConfirmId(dept.id);setConfirmType("dept");}} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"5px 9px", cursor:"pointer", fontSize:13, flexShrink:0 }}>🗑️</button>
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
  const inp = { width:"100%", padding:"9px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:9, fontSize:14, color:t.inputText, outline:"none", boxSizing:"border-box", background:t.inputBg, ...FF };
  const sel = { ...inp, cursor:"pointer" };
  const bS  = { flex:1, padding:12, background:t.btnSecBg, border:"none", borderRadius:10, color:t.btnSecText, fontWeight:600, fontSize:14, cursor:"pointer", ...FF };

  const isNew = !record?.id;
  const defaultAtendente = isNew ? (currentUser?.id || employees[0]?.id || "") : (record?.atendenteId || "");
  const tiposFiltrados = (() => {
    const especificos = tipos.filter(tp => tp.department === pageDepartment);
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
      footer={<div style={{ display:"flex", gap:12 }}><button onClick={onClose} style={bS}>Cancelar</button><button onClick={handleSave} style={btnP(!ok)}>{record?.id?"Salvar Alterações":"Registrar Atendimento"}</button></div>}
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
        <Field label="Via">
          <select value={f.via} onChange={e=>setF(p=>({...p, via:e.target.value, contato:""}))} style={sel}>
            {["Ticket","WhatsApp","Telefone","Telegram"].map(o=><option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
        <Field label="Tipo">
          <select value={f.tipo} onChange={e=>set("tipo")(e.target.value)} style={sel}>
            {tiposFiltrados.length > 0
              ? tiposFiltrados.map(tp=><option key={tp.id} value={tp.label}>{tp.label}</option>)
              : <option value="Outro">Outro</option>
            }
          </select>
        </Field>
        <Field label={f.via === "Ticket" ? "Link / URL" : f.via === "Telegram" ? "Nome no Telegram" : "Telefone"}>
          {f.via === "Ticket" ? (
            <input value={f.contato} onChange={e=>set("contato")(e.target.value)} style={inp} placeholder="https://..." />
          ) : f.via === "Telegram" ? (
            <input value={f.contato} onChange={e=>set("contato")(e.target.value)} style={inp} placeholder="Nome da pessoa no Telegram" />
          ) : (
            <input
              value={f.contato}
              onChange={e=>set("contato")(maskPhone(e.target.value))}
              onPaste={e=>{ e.preventDefault(); set("contato")(maskPhone(e.clipboardData.getData("text"))); }}
              style={inp} placeholder="(00) 00000-0000" type="tel"
            />
          )}
        </Field>
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

function AgendaModal({ record, onSave, onClose }) {
  const { t } = useTheme();
  const inp = { width:"100%", padding:"9px 12px", border:`1.5px solid ${t.inputBorder}`, borderRadius:9, fontSize:14, color:t.inputText, outline:"none", boxSizing:"border-box", background:t.inputBg, ...FF };
  const bS  = { padding:"11px 20px", background:t.btnSecBg, border:"none", borderRadius:10, color:t.btnSecText, fontWeight:600, fontSize:14, cursor:"pointer", ...FF };
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
          {!ag.concluido && <button onClick={complete} style={{ padding:"11px 20px", background:"linear-gradient(135deg,#16a34a,#15803d)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", ...FF }}>✅ Concluir</button>}
          <button onClick={save} style={btnP(false)}>Salvar</button>
        </div>
      }
    >
      <div style={{ background:t.pageBg, borderRadius:12, padding:"12px 16px", marginBottom:16, fontSize:13 }}>
        <div style={{ fontWeight:700, color:t.text, marginBottom:3 }}>{record.cliente}</div>
        <div style={{ color:t.textMuted }}>Via {record.via} · {record.tipo} · {record.data}</div>
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

// ── Home Screen ───────────────────────────────────────────────────────

function HomeScreen({ user, onOpenPage, onLogout, onGestao }) {
  const { t } = useTheme();
  const [employees, setEmployees] = useState([]);
  const [pages,     setPages]     = useState([]);
  const [counts,    setCounts]    = useState({});
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      const [emps, pgs] = await Promise.all([loadEmployees(), loadPages()]);
      const sorted = [...pgs]
        .filter(p => p.responsibleId === user.id)
        .sort((a,b)=>b.year!==a.year?b.year-a.year:b.month-a.month);
      setEmployees(emps); setPages(sorted);
      const cnts = {};
      await Promise.all(sorted.map(async p => {
        const recs = await loadRecords(p.id);
        cnts[p.id] = { total:recs.length, resolved:recs.filter(r=>r.status==="Resolvido").length, inProgress:recs.filter(r=>r.status==="Em atendimento").length };
      }));
      setCounts(cnts); setLoading(false);
    })();
  }, []);

  const cur = nowMY();

  return (
    <div style={{ minHeight:"100vh", background:t.pageBg, ...FF }}>

      <div style={{ background:t.header, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 12px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>📋</span>
          <span style={{ color:"#f8fafc", fontWeight:800, fontSize:16 }}>Central de Atendimentos</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <DarkToggle />
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Avatar name={user.name} color={user.color||"#6366f1"} size={30} />
            <span style={{ color:"#cbd5e1", fontWeight:500, fontSize:13 }}>{user.name}</span>
          </div>
          {user.id === "admin" && (
            <button onClick={onGestao} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(96,165,250,0.4)", color:"#93c5fd", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:600, ...FF }}>📊 Gestão</button>
          )}
          <button onClick={onLogout} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", color:"#94a3b8", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, ...FF }}>Sair</button>
        </div>
      </div>

      <div style={{ padding:"24px 24px 48px" }}>
        <PresenceBar employees={employees} />
        <div style={{ marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:t.text }}>Planilhas de Atendimento</h2>
          <p style={{ margin:"5px 0 0", fontSize:13, color:t.textMuted }}>
            {loading ? "Carregando..." : pages.length === 0 ? "Nenhuma planilha atribuída ao seu usuário ainda." : `${pages.length} planilha${pages.length!==1?"s":""} disponíve${pages.length!==1?"is":"l"} — clique para abrir`}
          </p>
        </div>

        {loading ? (
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
              <PageCard key={pg.id} pg={pg} employees={employees} cnt={counts[pg.id]||{total:0,resolved:0,inProgress:0}} isCurrentMonth={pg.month===cur.month&&pg.year===cur.year} onClick={()=>onOpenPage(pg, employees)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page Detail ───────────────────────────────────────────────────────

function PageDetail({ page, initEmployees, user, onBack, onLogout }) {
  const { t } = useTheme();
  const [employees, setEmployees] = useState(initEmployees || []);
  const [records,   setRecords]   = useState([]);
  const [tipos,     setTipos]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,       setModal]       = useState(null);
  const [confirmId,   setConfirmId]   = useState(null);
  const [satPopup,    setSatPopup]    = useState(false);
  const [agendaModal, setAgendaModal] = useState(null);
  const [alertRecord, setAlertRecord] = useState(null);
  const [tipoEdit,    setTipoEdit]    = useState(null);
  const alertedIds = useRef(new Set());
  const [filters,   setFilters]   = useState({ search:"", status:"Todos", tipo:"Todos", via:"Todos", atendente:"Todos" });

  useEffect(() => {
    let unsub;
    (async () => {
      const [emps, tps] = await Promise.all([loadEmployees(), loadTipos()]);
      setEmployees(emps); setTipos(tps);
      const q = query(collection(db, "records"), where("pageId", "==", page.id));
      unsub = onSnapshot(q, snap => {
        setRecords(snap.docs.map(d => d.data()).sort((a, b) => a.id - b.id));
        setLoading(false);
      });
    })();
    return () => unsub?.();
  }, [page.id]);

  const addRecord  = async f => { const id = records.length ? Math.max(...records.map(r=>r.id))+1 : 1; await setDoc(doc(db,"records",`${page.id}-${id}`), {...f, id, pageId:page.id}); setModal(null); };
  const editRecord = async f => { await setDoc(doc(db,"records",`${page.id}-${f.id}`), {...f, pageId:page.id}); setModal(null); };
  const delRecord  = async () => { await deleteDoc(doc(db,"records",`${page.id}-${confirmId}`)); setConfirmId(null); };
  const togglePrio = async id => { const r = records.find(x=>x.id===id); if(r) await setDoc(doc(db,"records",`${page.id}-${id}`), {...r, prioridade:!r.prioridade}); };
  const resolveRecord = async r => { await setDoc(doc(db,"records",`${page.id}-${r.id}`), {...r, status:"Resolvido", pageId:page.id}); setSatPopup(true); };
  const saveAgenda    = async updated => { await setDoc(doc(db,"records",`${page.id}-${updated.id}`), {...updated, pageId:page.id}); setAgendaModal(null); };
  const saveTipoColor = async tp => { await setDoc(doc(db,"tipos",tp.id), tp); setTipos(prev=>prev.map(x=>x.id===tp.id?tp:x)); };
  const setF = k => v => setFilters(p=>({...p,[k]:v}));

  useEffect(() => {
    const check = () => {
      const now = new Date();
      records.forEach(r => {
        if (!r.agendamento || r.agendamento.concluido || alertedIds.current.has(r.id)) return;
        const diff = (new Date(r.agendamento.dataHora) - now) / 60000;
        if (diff >= 0 && diff <= 5) { alertedIds.current.add(r.id); setAlertRecord(r); playBeep(); }
      });
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [records]);

  const filtered = records.filter(r => {
    if (filters.search && ![r.cliente,r.descricao,r.contato].some(s=>s.toLowerCase().includes(filters.search.toLowerCase()))) return false;
    if (filters.status    !== "Todos" && r.status      !== filters.status)    return false;
    if (filters.tipo      !== "Todos" && r.tipo        !== filters.tipo)      return false;
    if (filters.via       !== "Todos" && r.via         !== filters.via)       return false;
    if (filters.atendente !== "Todos" && r.atendenteId !== filters.atendente) return false;
    return true;
  });

  const responsible = employees.find(e=>e.id===page.responsibleId);
  const tiposMap = Object.fromEntries(tipos.map(tp => [tp.label, tp]));
  const stats = [
    ["Total",          records.length,                                        t.text],
    ["Resolvidos",     records.filter(r=>r.status==="Resolvido").length,      "#16a34a"],
    ["Em Atendimento", records.filter(r=>r.status==="Em atendimento").length, "#d97706"],
    ["Pendentes",      records.filter(r=>r.status==="Pendente").length,       "#dc2626"],
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
          <select value={filters.status}    onChange={e=>setF("status")(e.target.value)}    style={selSt}><option>Todos</option><option>Em atendimento</option><option>Resolvido</option><option>Pendente</option></select>
          <select value={filters.tipo} onChange={e=>setF("tipo")(e.target.value)} style={selSt}>
            <option value="Todos">Todos os tipos</option>
            {tipos.filter(tp=>tp.department===page.department||tp.department==="Geral").map(tp=><option key={tp.id} value={tp.label}>{tp.label}</option>)}
          </select>
          <select value={filters.via}       onChange={e=>setF("via")(e.target.value)}       style={selSt}><option>Todos</option><option>Ticket</option><option>WhatsApp</option><option>Telefone</option></select>
          <select value={filters.atendente} onChange={e=>setF("atendente")(e.target.value)} style={selSt}>
            <option value="Todos">Todos atendentes</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button onClick={()=>setModal({mode:"add"})} style={{ padding:"9px 18px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", whiteSpace:"nowrap", ...FF }}>
            + Novo Atendimento
          </button>
        </div>

        <div style={{ background:t.card, borderRadius:14, border:`1px solid ${t.border}`, overflow:"hidden" }}>
          {loading ? (
            <div style={{ padding:60, textAlign:"center", color:t.textMuted }}>Carregando registros...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:60, textAlign:"center" }}>
              <div style={{ fontSize:44, marginBottom:12 }}>😕</div>
              <div style={{ fontSize:15, fontWeight:600, color:t.text, marginBottom:4 }}>Nenhum registro encontrado</div>
              <div style={{ fontSize:13, color:t.textMuted }}>Ajuste os filtros ou adicione um novo atendimento.</div>
            </div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:t.thead, borderBottom:`2px solid ${t.theadBorder}` }}>
                    {[["P","36px"],["Status","130px"],["Data","72px"],["Atendente","110px"],["Cliente",""],["Via","90px"],["Contato","140px"],["Tipo","115px"],["Descrição",""],["","90px"]].map(([h,w])=>(
                      <th key={h} style={{ padding:"11px 12px", textAlign:"left", color:t.textMuted, fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:0.5, whiteSpace:"nowrap", width:w||undefined }}>{h}</th>
                    ))}
                    <th style={{ padding:"11px 12px", textAlign:"center", color:t.textMuted, width:"44px" }}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/>
                          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                          <circle cx="18" cy="18" r="4"/><polyline points="18 16 18 18 20 18"/>
                        </svg>
                        {records.filter(r=>r.agendamento&&!r.agendamento.concluido).length > 0 && (
                          <span style={{ background:"#f59e0b", color:"#fff", borderRadius:10, padding:"1px 5px", fontSize:10, fontWeight:700 }}>
                            {records.filter(r=>r.agendamento&&!r.agendamento.concluido).length}
                          </span>
                        )}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r,i)=>{
                    const atend = employees.find(e=>e.id===r.atendenteId);
                    return (
                      <tr key={r.id}
                        style={{ borderBottom:`1px solid ${t.border}`, background:r.prioridade?t.rowPrio:(i%2===0?t.rowEven:t.rowOdd) }}
                        onMouseEnter={e=>e.currentTarget.style.background=t.rowHover}
                        onMouseLeave={e=>e.currentTarget.style.background=r.prioridade?t.rowPrio:(i%2===0?t.rowEven:t.rowOdd)}
                      >
                        <td style={{ padding:"9px 12px", textAlign:"center" }}><input type="checkbox" checked={r.prioridade} onChange={()=>togglePrio(r.id)} style={{ width:15, height:15, cursor:"pointer", accentColor:"#6366f1" }} /></td>
                        <td style={{ padding:"9px 12px" }}><StatusBadge status={r.status} /></td>
                        <td style={{ padding:"9px 12px", color:t.textSub, whiteSpace:"nowrap", fontSize:12 }}>{r.data}</td>
                        <td style={{ padding:"9px 12px" }}>
                          {atend
                            ? <div style={{ display:"flex", alignItems:"center", gap:6 }}><Avatar name={atend.name} color={atend.color} size={24} /><span style={{ fontSize:12, fontWeight:500, color:t.textSub }}>{atend.name}</span></div>
                            : <span style={{ color:t.textMuted, fontSize:12 }}>—</span>}
                        </td>
                        <td style={{ padding:"9px 12px", fontWeight:600, color:t.text, maxWidth:200 }}><div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.cliente}</div></td>
                        <td style={{ padding:"9px 12px" }}><ViaBadge via={r.via} /></td>
                        <td style={{ padding:"9px 12px", maxWidth:140 }}>
                          {r.via === "Ticket" && r.contato
                            ? <a href={/^https?:\/\//i.test(r.contato) ? r.contato : `https://${r.contato}`} target="_blank" rel="noreferrer" style={{ color:"#6366f1", fontSize:12, fontWeight:500, textDecoration:"none", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={r.contato}>🔗 {r.contato}</a>
                            : <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:t.textSub, fontSize:12 }}>{r.contato}</div>
                          }
                        </td>
                        <td style={{ padding:"9px 12px" }}><TipoBadge tipo={r.tipo} tipoObj={tiposMap[r.tipo]} onClick={()=>tiposMap[r.tipo]&&setTipoEdit({...tiposMap[r.tipo]})} /></td>
                        <td style={{ padding:"9px 12px", maxWidth:240 }}><div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:t.textSub }}>{r.descricao}</div></td>
                        <td style={{ padding:"9px 8px", whiteSpace:"nowrap" }}>
                          <button onClick={()=>setModal({mode:"edit",record:r})} title="Editar" style={{ background:"none", border:`1px solid ${t.border}`, cursor:"pointer", borderRadius:7, padding:"4px 8px", fontSize:12, marginRight:4 }}>✏️</button>
                          <button
                            onClick={()=>r.status!=="Resolvido"&&resolveRecord(r)}
                            disabled={r.status==="Resolvido"}
                            title={r.status==="Resolvido"?"Já resolvido":"Marcar como resolvido"}
                            style={{ background:"none", border:r.status==="Resolvido"?`1px solid ${t.border}`:"1px solid #bbf7d0", cursor:r.status==="Resolvido"?"default":"pointer", borderRadius:7, padding:"4px 8px", fontSize:12, marginRight:4, opacity:r.status==="Resolvido"?0.35:1 }}>✅</button>
                          <button onClick={()=>setConfirmId(r.id)} title="Excluir" style={{ background:"none", border:"1px solid #fecaca", cursor:"pointer", borderRadius:7, padding:"4px 8px", fontSize:12 }}>🗑️</button>
                        </td>
                        <td style={{ padding:"9px 8px", textAlign:"center", width:"44px" }}>
                          {r.agendamento&&!r.agendamento.concluido && (
                            <button onClick={()=>setAgendaModal(r)} title={r.agendamento.titulo} style={{ background:"none", border:"none", cursor:"pointer", fontSize:15, padding:"2px 4px", borderRadius:6 }}>❗</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
      {alertRecord && (
        <Overlay z={1200}>
          <div style={{ background:"#fff", borderRadius:20, padding:"28px 32px", maxWidth:400, width:"90%", boxShadow:"0 20px 50px rgba(0,0,0,0.3)", ...FF }}>
            <div style={{ fontSize:38, textAlign:"center", marginBottom:10 }}>⏰</div>
            <h3 style={{ margin:"0 0 4px", fontSize:17, fontWeight:700, color:"#1e293b", textAlign:"center" }}>Compromisso em 5 minutos!</h3>
            <p style={{ margin:"0 0 16px", fontSize:13, color:"#64748b", textAlign:"center" }}>Verifique os detalhes abaixo</p>
            <div style={{ background:"#fefce8", border:"1px solid #fde68a", borderRadius:10, padding:"12px 14px", marginBottom:12, fontSize:13 }}>
              <div style={{ fontWeight:700, color:"#92400e", marginBottom:4 }}>📅 {alertRecord.agendamento.titulo}</div>
              {alertRecord.agendamento.dataHora && <div style={{ color:"#78350f", marginBottom:4 }}>🕐 {new Date(alertRecord.agendamento.dataHora).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>}
              {alertRecord.agendamento.descricao && <div style={{ color:"#92400e" }}>📝 {alertRecord.agendamento.descricao}</div>}
            </div>
            <div style={{ background:"#f1f5f9", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#475569", marginBottom:20 }}>
              <div style={{ fontWeight:600, marginBottom:2 }}>{alertRecord.cliente}</div>
              <div>Via {alertRecord.via} · {alertRecord.tipo} · {alertRecord.data}</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setAlertRecord(null)} style={{ flex:1, padding:"10px 0", background:"#f1f5f9", border:"none", borderRadius:10, color:"#475569", fontWeight:600, cursor:"pointer", ...FF }}>Dispensar</button>
              <button onClick={()=>{ setAgendaModal(alertRecord); setAlertRecord(null); }} style={{ flex:2, padding:"10px 0", background:"linear-gradient(135deg,#f59e0b,#d97706)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", ...FF }}>Ver compromisso</button>
            </div>
          </div>
        </Overlay>
      )}
      {satPopup && (
        <Overlay z={1100}>
          <div style={{ background:"#fff", borderRadius:20, padding:"32px 36px", maxWidth:360, width:"90%", textAlign:"center", boxShadow:"0 20px 50px rgba(0,0,0,0.25)", ...FF }}>
            <div style={{ fontSize:42, marginBottom:14 }}>📋</div>
            <p style={{ fontSize:16, fontWeight:600, color:"#1e293b", margin:"0 0 24px", lineHeight:1.5 }}>Você já enviou a pesquisa de satisfação?</p>
            <button onClick={()=>setSatPopup(false)} style={{ padding:"11px 40px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", ...FF }}>OK</button>
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

  useEffect(() => { loadEmployees().then(e=>{setEmployees(e);setLoading(false);}).catch(()=>setLoading(false)); }, []);

  const attempt = () => {
    if (!selected) return;
    if (pw === selected.password) onLogin(selected);
    else { setError("Senha incorreta. Tente novamente."); setPw(""); }
  };
  const attemptAdmin = () => {
    if (admPw === ADMIN_CRED.password) onAdmin();
    else { setAdmErr("Senha de administrador incorreta."); setAdmPw(""); }
  };

  const dInp = { width:"100%", padding:"9px 12px", border:t.dInpBorder, borderRadius:9, fontSize:14, color:t.dInpText, outline:"none", boxSizing:"border-box", background:t.dInpBg, ...FF };

  return (
    <div style={{ minHeight:"100vh", background:t.loginBg, display:"flex", alignItems:"center", justifyContent:"center", padding:20, ...FF, position:"relative" }}>

      <div style={{ position:"absolute", top:18, right:24 }}>
        <DarkToggle />
      </div>

      <div style={{ width:"100%", maxWidth:520 }}>
        <div style={{ textAlign:"center", marginBottom:38 }}>
          <div style={{ width:66, height:66, borderRadius:20, background:"linear-gradient(135deg,#0ea5e9,#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:32 }}>📋</div>
          <h1 style={{ color:t.loginText, fontSize:24, fontWeight:800, margin:0, letterSpacing:-0.5 }}>Central de Atendimentos</h1>
          <p style={{ color:t.loginSub, margin:"8px 0 0", fontSize:14 }}>Selecione seu perfil para entrar</p>
        </div>

        {loading ? <div style={{ textAlign:"center", color:t.loginSub, padding:40 }}>Carregando...</div>

        : !selected && !showAdmForm ? (
          <>
            {employees.length === 0
              ? <div style={{ textAlign:"center", color:t.loginSub, padding:40, background:t.loginCardBg, borderRadius:16, border:t.loginCardBorder }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
                  <p style={{ margin:0, fontSize:14, lineHeight:1.7, color:t.loginText }}>Nenhum atendente cadastrado.<br />Acesse como administrador para criar.</p>
                </div>
              : <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
                  {employees.map(emp=>(
                    <button key={emp.id} onClick={()=>{setSelected(emp);setError("");setPw("");}}
                      style={{ background:t.loginEmpBg, border:t.loginEmpBorder, borderRadius:14, padding:"18px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, color:t.loginEmpText, ...FF, transition:"background 0.15s" }}
                      onMouseEnter={e=>e.currentTarget.style.background=t.loginEmpBgHover}
                      onMouseLeave={e=>e.currentTarget.style.background=t.loginEmpBg}
                    >
                      <Avatar name={emp.name} color={emp.color} size={42} />
                      <span style={{ fontWeight:600, fontSize:15 }}>{emp.name}</span>
                    </button>
                  ))}
                </div>
            }
            <div style={{ textAlign:"center", marginTop:28 }}>
              <button onClick={()=>{setShowAdmForm(true);setAdmErr("");setAdmPw("");}}
                style={{ background:t.loginAdmBg, border:t.loginAdmBorder, color:t.loginAdmText, cursor:"pointer", fontSize:13, ...FF, padding:"8px 18px", borderRadius:10, display:"inline-flex", alignItems:"center", gap:7 }}>
                ⚙️ Área do Administrador
              </button>
            </div>
          </>

        ) : showAdmForm ? (
          <div style={{ background:t.loginCardBg, border:t.loginCardBorder, borderRadius:20, padding:32 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:26 }}>
              <div style={{ width:46, height:46, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#ef4444)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>⚙️</div>
              <div>
                <div style={{ color:t.loginText, fontWeight:700, fontSize:17 }}>Administrador</div>
                <button onClick={()=>{setShowAdmForm(false);setAdmErr("");}} style={{ background:"none", border:"none", color:t.loginSub, cursor:"pointer", fontSize:13, padding:0, ...FF }}>← Voltar</button>
              </div>
            </div>
            <Field label="Senha de administrador">
              <input type="password" value={admPw} onChange={e=>{setAdmPw(e.target.value);setAdmErr("");}} onKeyDown={e=>e.key==="Enter"&&attemptAdmin()} placeholder="Digite a senha..." autoFocus style={dInp} />
            </Field>
            {admErr && <p style={{ color:"#f87171", fontSize:13, margin:"-8px 0 16px", fontWeight:500 }}>{admErr}</p>}
            <button onClick={attemptAdmin} style={{ width:"100%", padding:13, background:"linear-gradient(135deg,#f59e0b,#ef4444)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", ...FF }}>Entrar como Administrador →</button>
          </div>

        ) : (
          <div style={{ background:t.loginCardBg, border:t.loginCardBorder, borderRadius:20, padding:32 }}>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:26 }}>
              <Avatar name={selected.name} color={selected.color} size={50} />
              <div>
                <div style={{ color:t.loginText, fontWeight:700, fontSize:18 }}>{selected.name}</div>
                <button onClick={()=>{setSelected(null);setPw("");setError("");}} style={{ background:"none", border:"none", color:t.loginSub, cursor:"pointer", fontSize:13, padding:0, ...FF }}>← Trocar funcionário</button>
              </div>
            </div>
            <Field label="Senha">
              <div style={{ position:"relative" }}>
                <input type={showPw?"text":"password"} value={pw} onChange={e=>{setPw(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&attempt()} placeholder="Digite sua senha..." autoFocus style={{ ...dInp, paddingRight:44 }} />
                <button onClick={()=>setShowPw(v=>!v)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:t.loginSub, cursor:"pointer", fontSize:17, padding:4 }}>{showPw?"👁":"👁️"}</button>
              </div>
            </Field>
            {error && <p style={{ color:"#f87171", fontSize:13, margin:"-8px 0 16px", fontWeight:500 }}>{error}</p>}
            <button onClick={attempt} style={{ width:"100%", padding:13, background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", ...FF }}>Entrar →</button>
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
  const thead = first => {
    const cols=ms.map(m=>`<th ${ths("text-align:center;white-space:nowrap")}>${m.label.toUpperCase()}</th>`).join("");
    return `<thead><tr><th ${ths("min-width:200px")}>${first.toUpperCase()}</th>${cols}</tr></thead>`;
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
  const compRow = (label, getFn, inv=false, bold=false, noD=false) => {
    const vals=ms.map((m,i) => {
      const v=getFn(m.mx); const s=(v!=null&&v!=="") ? String(v) : "";
      const d=(!noD&&ms.length>1&&s)?(i===0?`<br><span style="font-size:10px;color:#cbd5e1">-</span>`:dPct(getFn(ms[0].mx),v,inv)):"";
      return `<td ${tds("text-align:center;"+(bold?"font-weight:700;":""))}>${s}${d}</td>`;
    }).join("");
    return `<tr><td ${tds("color:#64748b;font-size:12px")}>${label}</td>${vals}</tr>`;
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
    return `<thead><tr><th ${ths("width:36px;padding:4px")}></th><th ${ths("min-width:180px")}>INDICADOR</th>${cols}</tr></thead>`;
  };

  const css = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;font-size:13px;line-height:1.5}.hdr{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;padding:28px 36px 22px}.hdr h1{font-size:28px;font-weight:900;letter-spacing:-.5px}.hdr .sub{font-size:12px;color:#94a3b8;margin-top:5px}.body{max-width:1100px;margin:0 auto;padding:8px 28px 48px}h2{font-size:13px;font-weight:800;color:#0f172a;padding:10px 16px;background:#f8fafc;border-left:4px solid #6366f1;margin:24px 0 0;text-transform:uppercase;letter-spacing:.6px}table{width:100%;border-collapse:collapse;margin-bottom:0}th{padding:7px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0}.tblwrap{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:16px;margin-top:1px}.vcard{border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;margin-top:1px}.vcard-hdr{background:#1e293b;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px}.vcard-hdr strong{font-size:14px;font-weight:800}.vcard-hdr .code{font-size:11px;color:#94a3b8}.vlbl{writing-mode:vertical-lr;transform:rotate(180deg);text-align:center;font-size:9px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#94a3b8;background:#f8fafc;padding:8px 4px;border-right:1px solid #e2e8f0;white-space:nowrap}@media print{body{font-size:11px}.hdr{-webkit-print-color-adjust:exact;print-color-adjust:exact}.vcard{break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tblwrap{break-inside:avoid}h2{break-after:avoid}}`;

  // 1. INDICADORES DO SETOR
  let indSec = "";
  if (sections.metas) {
    indSec = `<h2>Indicadores do Setor</h2><div class="tblwrap"><table>${thead("Indicadores")}<tbody>${[
      compRow("Novas assinaturas",      mx => mx.novasAss||""),
      compRow("Taxa de Renovação",      mx => mx.renovReal!=null?mx.renovReal+"%":""),
      compRow("Taxa de Churn",          mx => mx.churnReal!=null?mx.churnReal+"%":"", true),
      compRow("Satisfação do Cliente",  mx => mx.satReal?mx.satReal+"%":""),
    ].join("")}</tbody></table></div>`;
  }

  // 2–5. COMERCIAL / LEADS / RENOVAÇÃO / INADIMPLENTES
  let comSec = "";
  if (sections.comercial) {
    const comRows = [
      compRow("Novas assinaturas",               mx => mx.novasAss||""),
      compRow("Novas assinaturas Canceladas",     mx => mx.novasAssCanceladas||"", true),
      compRow("Valor total em novas assinaturas", mx => mx.valorTotalNovas>0?fmtBRL(mx.valorTotalNovas):""),
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
        return `<div class="vcard"><div class="vcard-hdr"><strong>${fname}</strong></div><table>${colabThead()}<tbody>${pres}</tbody></table><div style="height:6px"></div><table>${colabThead()}<tbody>${atend}</tbody></table></div>`;
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
          <div style={{ background:t.card, borderRadius:16, padding:28, width:"100%", maxWidth:430, boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
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

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShowReportModal(false)}
                style={{ flex:1, padding:"10px", background:t.btnSecBg, border:"none", borderRadius:9, color:t.btnSecText, fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                Cancelar
              </button>
              <button onClick={generateReport}
                style={{ flex:2, padding:"10px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", border:"none", borderRadius:9, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                🖨️ Emitir Relatório
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

export default function App() {
  const [view,     setView]     = useState("login");
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
  const goHome    = () => { setOpenPage(null); setView("home"); };
  const goPage    = (pg, emps) => { setOpenPage(pg); setOpenEmps(emps||[]); setView("page"); };
  const goGestao  = () => setView("gestao");

  return (
    <ThemeCtx.Provider value={{ t, dark, toggle }}>
      {view === "admin"   && <AdminPanel onBack={() => setView("login")} onGestao={goGestao} />}
      {view === "login"   && <LoginScreen onLogin={u=>{setUser(u);setView("home");}} onAdmin={()=>setView("admin")} />}
      {view === "page"    && openPage && <PageDetail page={openPage} initEmployees={openEmps} user={user} onBack={goHome} onLogout={logout} />}
      {view === "gestao"  && <GestaoComercial onBack={() => setView("admin")} onLogout={logout} />}
      {view === "home"    && user && <HomeScreen user={user} onOpenPage={goPage} onLogout={logout} onGestao={goGestao} />}
    </ThemeCtx.Provider>
  );
}
