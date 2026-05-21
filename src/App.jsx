import { useState, useEffect, useRef, createContext, useContext } from "react";
import { collection, doc, getDocs, setDoc, deleteDoc, writeBatch, query, where, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

// ── Constants ─────────────────────────────────────────────────────────

const ADMIN_CRED = { id:"admin", password:"admin123" };

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
function TipoBadge({ tipo, tipoObj }) {
  const c = tipoObj || TIPO_CFG[tipo] || { bg:"#f1f5f9", text:"#475569" };
  return <span style={{ background:c.bg, color:c.text, padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:"nowrap", display:"inline-block" }}>{tipo}</span>;
}
function ViaBadge({ via }) {
  const map = { Ticket:["🎫","#6366f1"], WhatsApp:["💬","#22c55e"], Telefone:["📞","#0ea5e9"] };
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
  const initColorIdx = tipo ? Math.max(0, TIPO_COLORS.findIndex(c => c.bg === tipo.bg)) : 0;
  const [label,      setLabel]      = useState(tipo?.label      || "");
  const [department, setDepartment] = useState(tipo?.department || departments[0]?.name || "Geral");
  const [colorIdx,   setColorIdx]   = useState(initColorIdx);
  const [error,      setError]      = useState("");

  const cur = TIPO_COLORS[colorIdx];

  const submit = () => {
    if (!label.trim()) return setError("O nome do tipo é obrigatório.");
    onSave({ id: tipo?.id || genId(), label: label.trim(), department, bg: cur.bg, text: cur.text });
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
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
          {TIPO_COLORS.map((c,i)=>(
            <button key={i} onClick={()=>setColorIdx(i)} style={{ padding:"4px 14px", borderRadius:20, background:c.bg, color:c.text, border:colorIdx===i?`2px solid ${t.text}`:"2px solid transparent", cursor:"pointer", fontSize:12, fontWeight:700 }}>
              Aa
            </button>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:12, color:t.textMuted }}>Prévia:</span>
          <span style={{ background:cur.bg, color:cur.text, padding:"3px 12px", borderRadius:20, fontSize:12, fontWeight:600 }}>
            {label || "Tipo"}
          </span>
        </div>
      </Field>
      {error && <p style={{ color:"#dc2626", fontSize:13, margin:"-4px 0 0", fontWeight:500 }}>{error}</p>}
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

function AdminPanel({ onBack }) {
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
  const [f, setF] = useState(record ? {...record} : { status:"Em atendimento", data:todayStr(), cliente:"", via:"Ticket", contato:"", tipo:defaultTipo, atendenteId:defaultAtendente, prioridade:false, descricao:"" });
  const set = k => v => setF(p=>({...p,[k]:v}));
  const ok = f.cliente.trim().length > 0;

  return (
    <ModalShell
      title={record?.id ? "✏️  Editar Atendimento" : "➕  Novo Atendimento"}
      onClose={onClose}
      footer={<div style={{ display:"flex", gap:12 }}><button onClick={onClose} style={bS}>Cancelar</button><button onClick={()=>ok&&onSave(f)} style={btnP(!ok)}>{record?.id?"Salvar Alterações":"Registrar Atendimento"}</button></div>}
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
            {["Ticket","WhatsApp","Telefone"].map(o=><option key={o}>{o}</option>)}
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
        <Field label={f.via === "Ticket" ? "Link / URL" : "Telefone"}>
          {f.via === "Ticket" ? (
            <input value={f.contato} onChange={e=>set("contato")(e.target.value)} style={inp} placeholder="https://..." />
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

function HomeScreen({ user, onOpenPage, onLogout }) {
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
  const [modal,     setModal]     = useState(null);
  const [confirmId,  setConfirmId]  = useState(null);
  const [satPopup,   setSatPopup]   = useState(false);
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
  const setF = k => v => setFilters(p=>({...p,[k]:v}));

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

        <div style={{ background:t.card, borderRadius:14, border:`1px solid ${t.border}`, padding:"13px 18px", marginBottom:14, display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
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
                    {[["P","36px"],["Status","130px"],["Data","72px"],["Atendente","110px"],["Cliente",""],["Via","90px"],["Contato","140px"],["Tipo","115px"],["Descrição",""],["","80px"]].map(([h,w])=>(
                      <th key={h} style={{ padding:"11px 12px", textAlign:"left", color:t.textMuted, fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:0.5, whiteSpace:"nowrap", width:w||undefined }}>{h}</th>
                    ))}
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
                        <td style={{ padding:"9px 12px" }}><TipoBadge tipo={r.tipo} tipoObj={tiposMap[r.tipo]} /></td>
                        <td style={{ padding:"9px 12px", maxWidth:240 }}><div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:t.textSub }}>{r.descricao}</div></td>
                        <td style={{ padding:"9px 8px", whiteSpace:"nowrap" }}>
                          <button onClick={()=>setModal({mode:"edit",record:r})} style={{ background:"none", border:`1px solid ${t.border}`, cursor:"pointer", borderRadius:7, padding:"4px 8px", fontSize:12, marginRight:4 }}>✏️</button>
                          <button
                            onClick={()=>r.status!=="Resolvido"&&resolveRecord(r)}
                            disabled={r.status==="Resolvido"}
                            title={r.status==="Resolvido"?"Já resolvido":"Marcar como resolvido"}
                            style={{ background:r.status==="Resolvido"?"none":"none", border:r.status==="Resolvido"?`1px solid ${t.border}`:"1px solid #bbf7d0", cursor:r.status==="Resolvido"?"default":"pointer", borderRadius:7, padding:"4px 8px", fontSize:12, marginRight:4, opacity:r.status==="Resolvido"?0.35:1 }}>✅</button>
                          <button onClick={()=>setConfirmId(r.id)} style={{ background:"none", border:"1px solid #fecaca", cursor:"pointer", borderRadius:7, padding:"4px 8px", fontSize:12 }}>🗑️</button>
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
            <p style={{ color:t.senhaHint, fontSize:12, textAlign:"center", marginTop:14 }}>Senha padrão: <code style={{ background:t.codeSnippetBg, padding:"1px 6px", borderRadius:4, color:t.codeSnippetText }}>{ADMIN_CRED.password}</code></p>
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
  const goHome = () => { setOpenPage(null); setView("home"); };
  const goPage = (pg, emps) => { setOpenPage(pg); setOpenEmps(emps||[]); setView("page"); };

  return (
    <ThemeCtx.Provider value={{ t, dark, toggle }}>
      {view === "admin" && <AdminPanel onBack={() => setView("login")} />}
      {view === "login" && <LoginScreen onLogin={u=>{setUser(u);setView("home");}} onAdmin={()=>setView("admin")} />}
      {view === "page" && openPage && <PageDetail page={openPage} initEmployees={openEmps} user={user} onBack={goHome} onLogout={logout} />}
      {view === "home" && user && <HomeScreen user={user} onOpenPage={goPage} onLogout={logout} />}
    </ThemeCtx.Provider>
  );
}
