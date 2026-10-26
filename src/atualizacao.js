// Atualização automática do app depois de um deploy.
// • Cada build publica /version.json com o número da versão (ver vite.config.js); o app aberto
//   confere esse arquivo de tempos em tempos (não usa o Firebase — não gasta leituras).
// • Versão nova: recarrega sozinho só quando é SEGURO (nenhuma janela de edição aberta, nada sendo
//   digitado e a pessoa ausente/aba em segundo plano). Senão, mostra uma faixa "Atualizar".
// • Recarregar normalmente desloga (o login fica só na memória). Para a atualização não tirar
//   ninguém da tela, o estado (quem está logado e em que tela) é guardado na aba por 2 minutos e
//   restaurado uma única vez depois do recarregamento.

export const VERSAO_APP = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
export const INTERVALO_CONFERENCIA_MS = 5 * 60 * 1000;
const CHAVE_RETORNO = "retorno_atualizacao";
const VALIDADE_RETORNO_MS = 2 * 60 * 1000;
const PAUSA_DIGITACAO_MS = 2 * 60 * 1000;
const AUSENCIA_MS = 3 * 60 * 1000;

// Consulta a versão publicada. null se não deu para saber (offline, ambiente local etc.).
export async function versaoPublicada(fetchImpl = globalThis.fetch) {
  try {
    const r = await fetchImpl(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.versao === "string" ? j.versao : null;
  } catch { return null; }
}

const editavel = el => !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

// Só recarrega sozinho se ninguém pode perder nada: sem janela de edição aberta ([data-modal]),
// sem campo em foco, sem digitação nos últimos 2 min — e a pessoa fora da aba ou parada há 3 min.
export function seguroRecarregar({ documento, agora, ultimaAtividade, ultimaDigitacao }) {
  if (documento.querySelector("[data-modal]")) return false;
  if (editavel(documento.activeElement)) return false;
  if (agora - ultimaDigitacao < PAUSA_DIGITACAO_MS) return false;
  return documento.hidden || agora - ultimaAtividade >= AUSENCIA_MS;
}

export function guardarRetorno(estado, armazenamento = globalThis.sessionStorage, agora = Date.now()) {
  try { armazenamento.setItem(CHAVE_RETORNO, JSON.stringify({ em: agora, ...estado })); } catch {}
}

// Lê e APAGA o estado guardado (vale uma vez, por 2 minutos).
export function lerRetorno(armazenamento = globalThis.sessionStorage, agora = Date.now()) {
  try {
    const bruto = armazenamento.getItem(CHAVE_RETORNO);
    armazenamento.removeItem(CHAVE_RETORNO);
    if (!bruto) return null;
    const r = JSON.parse(bruto);
    return r && typeof r.em === "number" && agora - r.em >= 0 && agora - r.em <= VALIDADE_RETORNO_MS ? r : null;
  } catch { return null; }
}
