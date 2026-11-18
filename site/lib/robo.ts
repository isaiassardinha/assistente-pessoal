// Conversa do site com o robô do WhatsApp (API interna, só dentro do servidor).

export type EstadoRobo = {
  situacao: "desligado" | "conectando" | "aguardando_qr" | "conectado" | "fora_do_ar";
  qr: string | null;
  numero: string | null;
  desde: string | null;
  faltando: string[];
};

const ENDERECO = () => process.env.ROBO_URL || "http://127.0.0.1:3001";

async function chamar(caminho: string, metodo: "GET" | "POST", corpo?: unknown, espera = 20_000): Promise<Response> {
  const token = process.env.INTERNO_TOKEN ?? "";
  return fetch(`${ENDERECO()}${caminho}`, {
    method: metodo,
    headers: { "x-interno-token": token, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(espera),
  });
}

export async function estadoDoRobo(): Promise<EstadoRobo> {
  try {
    const r = await chamar("/estado", "GET");
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as EstadoRobo;
  } catch {
    return { situacao: "fora_do_ar", qr: null, numero: null, desde: null, faltando: [] };
  }
}

export async function desconectarRobo(): Promise<boolean> {
  try {
    return (await chamar("/desconectar", "POST")).ok;
  } catch {
    return false;
  }
}

export type RespostaVerificacao = { ok: boolean; erro?: string; jaVerificado?: boolean };

export async function pedirCodigo(usuarioId: string): Promise<RespostaVerificacao> {
  try {
    return (await (await chamar("/verificacao/enviar", "POST", { usuarioId })).json()) as RespostaVerificacao;
  } catch {
    return { ok: false, erro: "O robô do WhatsApp está fora do ar agora. Tente mais tarde." };
  }
}

export async function confirmarCodigo(usuarioId: string, codigo: string): Promise<RespostaVerificacao> {
  try {
    return (await (await chamar("/verificacao/confirmar", "POST", { usuarioId, codigo })).json()) as RespostaVerificacao;
  } catch {
    return { ok: false, erro: "O robô do WhatsApp está fora do ar agora. Tente mais tarde." };
  }
}

// ------------------------------------------------------------- cérebro

export type Fonte = { tipo: "documento" | "anotacao"; id: string; nome: string };
export type RespostaPergunta = { ok: boolean; erro?: string; resposta?: string; fontes?: Fonte[] };

/** Pergunta aos documentos e anotações da pessoa (a IA fica no robô). */
export async function perguntarAoCerebro(usuarioId: string, pergunta: string): Promise<RespostaPergunta> {
  try {
    const r = await chamar("/cerebro/perguntar", "POST", { usuarioId, pergunta }, 60_000);
    return (await r.json()) as RespostaPergunta;
  } catch {
    return { ok: false, erro: "O robô está fora do ar agora. Tente de novo em instantes." };
  }
}

/** Avisa o robô que chegou arquivo novo (para ler logo, sem esperar o próximo minuto). */
export async function acordarCerebro(): Promise<void> {
  try {
    await chamar("/cerebro/acordar", "POST", {}, 5_000);
  } catch {
    // sem problema: a rotina do robô pega no próximo minuto
  }
}
