// Configuração da integração Vindi — lida SOMENTE das variáveis de ambiente do servidor (Vercel).
// Nada daqui é enviado ao navegador, exceto o resumo de configuracaoPublica().

// Endereços oficiais (developers.vindi.com.br → Segurança e autenticação / Sandbox).
export const VINDI_URLS = {
  sandbox:  "https://sandbox-app.vindi.com.br/api/v1",
  producao: "https://app.vindi.com.br/api/v1",
};

export function lerConfigVindi(env = process.env) {
  const ambiente = env.VINDI_AMBIENTE === "producao" ? "producao" : env.VINDI_AMBIENTE === "sandbox" ? "sandbox" : null;
  const apiKey = (env.VINDI_API_KEY || "").trim();
  return {
    ambiente,
    apiKey,
    baseUrl: ambiente ? VINDI_URLS[ambiente] : null,
    webhookUsuario: (env.VINDI_WEBHOOK_USUARIO || "").trim(),
    webhookSenha: (env.VINDI_WEBHOOK_SENHA || "").trim(),
    apiConfigurada: !!(ambiente && apiKey),
    webhookConfigurado: !!(env.VINDI_WEBHOOK_USUARIO && env.VINDI_WEBHOOK_SENHA),
  };
}

// Projeto do Firebase da conta de serviço (o ID do projeto não é segredo). null se ausente/inválida.
export function projetoDaContaDeServico(env = process.env) {
  try { return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || "").project_id || null; } catch { return env.FIREBASE_SERVICE_ACCOUNT ? "invalido" : null; }
}

// O que pode ser mostrado no painel do Admin: nunca a chave nem a senha do webhook.
export function configuracaoPublica(cfg, env = process.env) {
  return {
    ambiente: cfg.ambiente,
    apiConfigurada: cfg.apiConfigurada,
    webhookConfigurado: cfg.webhookConfigurado,
    chaveFinal: cfg.apiKey ? `••••${cfg.apiKey.slice(-4)}` : null,
    firebaseProjetoServidor: projetoDaContaDeServico(env),
    firebaseProjetoApp: env.VITE_FIREBASE_PROJECT_ID || null,
  };
}
