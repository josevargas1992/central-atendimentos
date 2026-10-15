// Garante que uma função serverless sempre responda: se o trabalho passar do limite,
// devolve 504 com mensagem clara (em vez de deixar a requisição pendurada).
export function comLimiteDeTempo(handler, ms = 20000, mensagem = "O servidor demorou demais para responder. Tente novamente.") {
  return async function protegido(req, res) {
    let timer;
    const tempo = new Promise(resolve => { timer = setTimeout(() => resolve("tempo"), ms); });
    const trabalho = Promise.resolve().then(() => handler(req, res)).then(() => "ok", e => { console.error("handler:", e?.message); return "erro"; });
    const r = await Promise.race([trabalho, tempo]);
    clearTimeout(timer);
    if (r === "ok" || res.headersSent || res.writableEnded) return;
    console.error(r === "tempo" ? `handler: tempo esgotado (${ms} ms)` : "handler: erro não tratado");
    res.status(r === "tempo" ? 504 : 500).setHeader("Cache-Control", "no-store");
    return res.json({ erro: r === "tempo" ? mensagem : "Erro interno no servidor." });
  };
}
