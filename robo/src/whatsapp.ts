// Conexão com o WhatsApp (Baileys, não-oficial). Tudo que fala com o
// WhatsApp passa por aqui: QR Code, reconexão, receber e enviar mensagens.

import { rm } from "node:fs/promises";
import path from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getContentType,
  isJidGroup,
  isJidStatusBroadcast,
  isLidUser,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "baileys";
import pino from "pino";
import QRCode from "qrcode";
import { config } from "./config";
import { log } from "./log";
import { numeroPermitido, variantesCelular } from "./regras";

export type Situacao = "desligado" | "conectando" | "aguardando_qr" | "conectado";

type Estado = {
  situacao: Situacao;
  qr: string | null; // imagem do QR (data URL)
  numero: string | null; // número do robô
  desde: string; // desde quando está nessa situação
  caiuEm: string | null; // quando a conexão caiu pela última vez
};

export type MensagemRecebida = {
  id: string;
  digitos: string; // número de quem mandou (só dígitos)
  jidResposta: string;
  tipo: "texto" | "audio" | "imagem" | "documento" | "outro";
  texto: string;
  /** Tamanho anunciado do arquivo (antes de baixar), em bytes; 0 se não souber. */
  tamanho: number;
  baixarMidia: () => Promise<{ dados: Buffer; mime: string; nome: string | null }>;
};

const estado: Estado = { situacao: "desligado", qr: null, numero: null, desde: new Date().toISOString(), caiuEm: null };
let sock: WASocket | null = null;
let aoReceber: ((m: MensagemRecebida) => Promise<void>) | null = null;
let tentativasReconexao = 0;
let reconexaoAgendada: NodeJS.Timeout | null = null;
const cacheJid = new Map<string, string>();
const logger = pino({ level: "warn" });

function mudar(situacao: Situacao) {
  if (estado.situacao !== situacao) {
    estado.situacao = situacao;
    estado.desde = new Date().toISOString();
  }
}

const pastaSessao = () => path.join(config.pastaDados, "whatsapp-sessao");

export function estadoWhatsApp() {
  return { ...estado };
}

export function conectado(): boolean {
  return estado.situacao === "conectado" && sock !== null;
}

function digitosDoJid(jid: string): string {
  return jidNormalizedUser(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
}

/** Liga a conexão (e religa sozinha quando cair). */
export async function iniciarWhatsApp(receber: (m: MensagemRecebida) => Promise<void>) {
  aoReceber = receber;
  await conectar();
}

async function conectar() {
  if (reconexaoAgendada) {
    clearTimeout(reconexaoAgendada);
    reconexaoAgendada = null;
  }
  mudar("conectando");
  const { state, saveCreds } = await useMultiFileAuthState(pastaSessao());
  const versao = await fetchLatestBaileysVersion().then((v) => v.version).catch(() => undefined);

  const s = makeWASocket({
    auth: state,
    version: versao,
    logger,
    browser: Browsers.ubuntu("Assistente Pessoal"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });
  sock = s;

  s.ev.on("creds.update", saveCreds);

  s.ev.on("connection.update", async (u) => {
    if (u.qr) {
      estado.qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 300 });
      mudar("aguardando_qr");
    }
    if (u.connection === "open") {
      tentativasReconexao = 0;
      estado.qr = null;
      estado.numero = s.user?.id ? digitosDoJid(s.user.id) : null;
      mudar("conectado");
      log.info("WhatsApp conectado");
    }
    if (u.connection === "close") {
      if (sock !== s) return; // conexão antiga
      sock = null;
      const codigo = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (estado.situacao === "conectado") estado.caiuEm = new Date().toISOString();
      if (codigo === DisconnectReason.loggedOut) {
        log.aviso("WhatsApp desconectado pelo celular. Apagando sessão; um QR Code novo vai aparecer no site.");
        await rm(pastaSessao(), { recursive: true, force: true });
        estado.numero = null;
        agendarReconexao(1000);
      } else {
        tentativasReconexao++;
        const espera = Math.min(60_000, [2000, 5000, 10_000, 30_000][tentativasReconexao - 1] ?? 60_000);
        log.aviso(`WhatsApp caiu (código ${codigo ?? "?"}). Tentando de novo em ${espera / 1000}s.`);
        agendarReconexao(espera);
      }
      mudar("conectando");
    }
  });

  s.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      try {
        const recebida = await interpretar(s, m);
        if (recebida && aoReceber) await aoReceber(recebida);
      } catch (e) {
        log.erro("erro ao tratar mensagem:", (e as Error).message);
      }
    }
  });
}

function agendarReconexao(ms: number) {
  if (reconexaoAgendada) clearTimeout(reconexaoAgendada);
  reconexaoAgendada = setTimeout(() => {
    conectar().catch((e) => {
      log.erro("falha ao reconectar:", (e as Error).message);
      agendarReconexao(30_000);
    });
  }, ms);
}

/** Transforma a mensagem do WhatsApp no formato que o resto do robô entende. */
async function interpretar(s: WASocket, m: WAMessage): Promise<MensagemRecebida | null> {
  const jid = m.key.remoteJid;
  if (!jid || m.key.fromMe || !m.message || !m.key.id) return null;
  if (isJidGroup(jid) || isJidStatusBroadcast(jid) || jid.endsWith("@newsletter") || jid.endsWith("@broadcast")) return null;

  // O WhatsApp às vezes identifica a pessoa por um código (LID) em vez do número.
  let jidNumero: string | null = jid;
  if (isLidUser(jid)) {
    jidNumero = m.key.remoteJidAlt ?? (await s.signalRepository.lidMapping.getPNForLID(jid).catch(() => null));
  }
  if (!jidNumero) return null;
  const digitos = digitosDoJid(jidNumero);

  const conteudo = normalizeMessageContent(m.message);
  const tipoBruto = getContentType(conteudo);
  let tipo: MensagemRecebida["tipo"] = "outro";
  let texto = "";
  let nome: string | null = null;

  if (tipoBruto === "conversation") {
    tipo = "texto";
    texto = conteudo?.conversation ?? "";
  } else if (tipoBruto === "extendedTextMessage") {
    tipo = "texto";
    texto = conteudo?.extendedTextMessage?.text ?? "";
  } else if (tipoBruto === "audioMessage") {
    tipo = "audio";
  } else if (tipoBruto === "imageMessage") {
    tipo = "imagem";
    texto = conteudo?.imageMessage?.caption ?? "";
  } else if (tipoBruto === "documentMessage") {
    tipo = "documento";
    texto = conteudo?.documentMessage?.caption ?? "";
    nome = conteudo?.documentMessage?.fileName ?? null;
  }
  // vídeos, figurinhas, localização etc. ficam como "outro" (ignorados)

  return {
    id: m.key.id,
    digitos,
    jidResposta: jid,
    tipo,
    texto: texto.trim(),
    tamanho: Number(conteudo?.imageMessage?.fileLength ?? conteudo?.documentMessage?.fileLength ?? conteudo?.audioMessage?.fileLength ?? 0) || 0,
    baixarMidia: async () => {
      const dados = await downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: s.updateMediaMessage });
      const midia = conteudo?.audioMessage ?? conteudo?.imageMessage ?? conteudo?.documentMessage;
      return { dados, mime: midia?.mimetype ?? "application/octet-stream", nome };
    },
  };
}

/** Descobre o endereço de WhatsApp de um número (com ou sem o 9). */
async function jidDoNumero(digitos: string): Promise<string | null> {
  const emCache = cacheJid.get(digitos);
  if (emCache) return emCache;
  if (!sock) return null;
  for (const variante of variantesCelular(digitos)) {
    const [r] = (await sock.onWhatsApp(variante)) ?? [];
    if (r?.exists) {
      cacheJid.set(digitos, r.jid);
      return r.jid;
    }
  }
  return null;
}

export class NumeroSemWhatsApp extends Error {}

/**
 * Envia texto. "destino" é um número (só dígitos) ou o endereço de quem
 * mandou a mensagem. Respeita o modo "só números liberados".
 */
export async function enviarTexto(destino: string, texto: string, digitosDoDestino?: string): Promise<void> {
  if (!sock || !conectado()) throw new Error("WhatsApp não está conectado");
  const digitos = digitosDoDestino ?? (destino.includes("@") ? digitosDoJid(destino) : destino);
  if (!numeroPermitido(digitos, config.numerosPermitidos)) throw new Error("número fora da lista de números liberados");
  const jid = destino.includes("@") ? destino : await jidDoNumero(destino);
  if (!jid) throw new NumeroSemWhatsApp(`o número ${digitos} não tem WhatsApp`);
  await sock.sendMessage(jid, { text: texto });
}

export async function enviarDocumento(destino: string, digitosDoDestino: string, arquivo: Buffer, nome: string, mime: string, legenda?: string) {
  if (!sock || !conectado()) throw new Error("WhatsApp não está conectado");
  if (!numeroPermitido(digitosDoDestino, config.numerosPermitidos)) throw new Error("número fora da lista de números liberados");
  await sock.sendMessage(destino, { document: arquivo, fileName: nome, mimetype: mime, caption: legenda });
}

/** Mostra "digitando…" para a pessoa enquanto o robô pensa. */
export async function digitando(jid: string, ligado: boolean) {
  try {
    await sock?.sendPresenceUpdate(ligado ? "composing" : "paused", jid);
  } catch {
    // não é importante
  }
}

export async function marcarComoLida(jid: string, id: string) {
  try {
    await sock?.readMessages([{ remoteJid: jid, id, fromMe: false }]);
  } catch {
    // não é importante
  }
}

/** Desconecta o número atual e gera um QR Code novo. */
export async function desconectar() {
  const atual = sock;
  sock = null;
  try {
    await atual?.logout();
  } catch {
    // já estava desconectado
  }
  await rm(pastaSessao(), { recursive: true, force: true });
  estado.numero = null;
  cacheJid.clear();
  agendarReconexao(1000);
}
