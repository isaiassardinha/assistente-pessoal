// Conversa do site com o robô do WhatsApp (API interna, só dentro do servidor).

export type EstadoRobo = {
  situacao: "desligado" | "conectando" | "aguardando_qr" | "conectado" | "fora_do_ar";
  qr: string | null;
  numero: string | null;
  desde: string | null;
  faltando: string[];
};

const ENDERECO = () => process.env.ROBO_URL || "http://127.0.0.1:3001";

async function chamar(caminho: string, metodo: "GET" | "POST", corpo?: unknown): Promise<Response> {
  const token = process.env.INTERNO_TOKEN ?? "";
  return fetch(`${ENDERECO()}${caminho}`, {
    method: metodo,
    headers: { "x-interno-token": token, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
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
