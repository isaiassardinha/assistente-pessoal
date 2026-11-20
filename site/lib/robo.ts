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

// ------------------------------------------------------------- e-mail e agenda

export type ResultadoConexao = { ok: boolean; erro?: string };

/** O robô testa a conexão e, se der certo, guarda a senha criptografada. */
export async function conectarNoRobo(caminho: "/conexoes/gmail" | "/conexoes/agenda" | "/conexoes/google", corpo: Record<string, string>): Promise<ResultadoConexao> {
  try {
    const r = await chamar(caminho, "POST", corpo, 45_000);
    return (await r.json()) as ResultadoConexao;
  } catch {
    return { ok: false, erro: "O robô está fora do ar agora. Tente de novo em instantes." };
  }
}

export type CompromissoSite = { titulo: string; inicio: string; fim: string; diaInteiro: boolean; dia: string; local: string };

/** Compromissos da agenda (null = agenda não conectada ou robô fora do ar). */
export async function agendaDe(usuarioId: string, de: string, ate: string): Promise<CompromissoSite[] | null> {
  try {
    const r = await chamar(`/agenda?usuarioId=${usuarioId}&de=${de}&ate=${ate}`, "GET", undefined, 15_000);
    const dados = (await r.json()) as { ok: boolean; conectada?: boolean; compromissos?: CompromissoSite[] };
    return dados.ok && dados.conectada ? (dados.compromissos ?? []) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- espaços

type RotaEspaco = "/espacos/drive" | "/espacos/apagar" | "/espacos/apagar-documento" | "/espacos/reler-documento";

/** Pede ao robô uma ação no espaço (ele confere se a pessoa é membro/admin). */
export async function acaoNoEspaco(caminho: RotaEspaco, corpo: Record<string, string>): Promise<ResultadoConexao> {
  try {
    const r = await chamar(caminho, "POST", corpo, 45_000);
    return (await r.json()) as ResultadoConexao;
  } catch {
    return { ok: false, erro: "O robô está fora do ar agora. Tente de novo em instantes." };
  }
}

/** Pergunta à memória do espaço (documentos e mensagens do grupo). */
export async function perguntarAoEspaco(usuarioId: string, espacoId: string, pergunta: string): Promise<RespostaPergunta> {
  try {
    const r = await chamar("/espacos/perguntar", "POST", { usuarioId, espacoId, pergunta }, 60_000);
    return (await r.json()) as RespostaPergunta;
  } catch {
    return { ok: false, erro: "O robô está fora do ar agora. Tente de novo em instantes." };
  }
}

/** Arquivo original de um documento do espaço (o robô busca no Drive ou no cofre). */
export async function baixarDoEspaco(usuarioId: string, espacoId: string, documentoId: string): Promise<Response | null> {
  try {
    const q = new URLSearchParams({ usuarioId, espacoId, documentoId });
    return await chamar(`/espacos/arquivo?${q}`, "GET", undefined, 120_000);
  } catch {
    return null;
  }
}
