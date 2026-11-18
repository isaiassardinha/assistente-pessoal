// Gmail pessoal, só leitura (IMAP com "senha de app").
// O robô nunca apaga, move, responde nem marca como lido.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { semAcento } from "./regras";

export type EmailBruto = {
  uid: number;
  messageId: string;
  recebidoEm: Date;
  remetenteNome: string;
  remetenteEmail: string;
  assunto: string;
  texto: string;
  automatico: boolean;
};

export type EstadoCaixa = { uidValidity?: string; ultimoUid?: number; falhas?: number };

/** Erro de senha/permissão: não adianta tentar de novo até a pessoa reconectar. */
export class AcessoNegado extends Error {}

const LIMITE_POR_LEITURA = 40;
const BYTES_POR_EMAIL = 120_000;

// ---------------------------------------------------------------- regras puras

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Senha de app do Google: 16 letras (o Google mostra em 4 blocos com espaços). */
export function limparSenhaDeApp(senha: string): string {
  return senha.replace(/\s+/g, "");
}

export function senhaDeAppValida(senha: string): boolean {
  return /^[a-z]{16}$/i.test(limparSenhaDeApp(senha));
}

/** Newsletter, aviso automático, lista de e-mails? */
export function ehAutomatico(cabecalhos: string, remetente: string): boolean {
  const h = cabecalhos.toLowerCase();
  if (/^list-unsubscribe:|\nlist-unsubscribe:|^list-id:|\nlist-id:/m.test(h)) return true;
  if (/\nprecedence:\s*(bulk|list|junk)/.test(`\n${h}`)) return true;
  if (/\nauto-submitted:\s*(?!no)\S+/.test(`\n${h}`)) return true;
  return /^(no-?reply|nao-?responda|naoresponda|notifica(c|ç)(o|õ)es|mailer-daemon)@/i.test(remetente);
}

/**
 * Regra que a pessoa criou: "@dominio.com" vale para o domínio todo,
 * "fulano@x.com" para o endereço, e qualquer outra coisa é uma palavra
 * procurada no remetente e no assunto.
 */
export function regraCasa(padrao: string, e: { remetenteEmail: string; remetenteNome: string; assunto: string }): boolean {
  const p = semAcento(padrao.trim().toLowerCase());
  const email = e.remetenteEmail.toLowerCase();
  if (!p) return false;
  if (p.startsWith("@")) return email.endsWith(p);
  if (p.includes("@")) return email === p;
  const onde = semAcento(`${e.remetenteNome} ${email} ${e.assunto}`.toLowerCase());
  return new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(onde);
}

export function aplicarRegras(
  regras: { tipo: "importante" | "ignorar"; padrao: string }[],
  e: { remetenteEmail: string; remetenteNome: string; assunto: string },
): "importante" | "ignorar" | null {
  // "sempre importante" ganha de "ignorar" se as duas casarem
  if (regras.some((r) => r.tipo === "importante" && regraCasa(r.padrao, e))) return "importante";
  if (regras.some((r) => r.tipo === "ignorar" && regraCasa(r.padrao, e))) return "ignorar";
  return null;
}

/** Texto limpo e curto do e-mail (para a IA ler). */
export function textoParaIa(texto: string | undefined, html: string | false | undefined, limite = 2500): string {
  let t = texto?.trim() ?? "";
  if (!t && html) {
    t = html
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  return t
    .replace(/[\u0000-\u0008\u000B\u000E-\u001F]/g, " ")
    .replace(/^>.*$/gm, "") // trechos citados de respostas anteriores
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, limite);
}

/** Dentro do horário de silêncio (ex.: das 22h às 7h)? */
export function emSilencio(hora: number, inicio: number, fim: number): boolean {
  return inicio > fim ? hora >= inicio || hora < fim : hora >= inicio && hora < fim;
}

// ---------------------------------------------------------------- IMAP

function cliente(email: string, senha: string) {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: email.trim(), pass: limparSenhaDeApp(senha) },
    logger: false,
    socketTimeout: 60_000,
    connectionTimeout: 20_000,
  });
}

function ehErroDeAcesso(e: unknown): boolean {
  const x = e as { authenticationFailed?: boolean; responseText?: string; message?: string };
  return !!x?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|Application-specific password required|Web login required/i.test(`${x?.responseText ?? ""} ${x?.message ?? ""}`);
}

async function conectar(email: string, senha: string) {
  const c = cliente(email, senha);
  c.on("error", () => {}); // erros de conexão chegam pelas promessas
  try {
    await c.connect();
  } catch (e) {
    if (ehErroDeAcesso(e)) throw new AcessoNegado("O Google recusou o e-mail ou a senha de app.");
    throw e;
  }
  return c;
}

/** Confere se o e-mail e a senha de app funcionam. */
export async function testarGmail(email: string, senha: string): Promise<void> {
  const c = await conectar(email, senha);
  try {
    await c.mailboxOpen("INBOX", { readOnly: true });
  } finally {
    await c.logout().catch(() => {});
  }
}

/**
 * Busca os e-mails novos da caixa de entrada desde a última leitura.
 * Na primeira vez, traz só os das últimas 24 horas (para mostrar no site,
 * sem disparar avisos) e passa a acompanhar dali em diante.
 */
export async function buscarNovos(email: string, senha: string, estado: EstadoCaixa): Promise<{ emails: EmailBruto[]; estado: EstadoCaixa; primeiraVez: boolean }> {
  const c = await conectar(email, senha);
  try {
    const caixa = await c.mailboxOpen("INBOX", { readOnly: true });
    const validade = String(caixa.uidValidity);
    const primeiraVez = estado.uidValidity !== validade || typeof estado.ultimoUid !== "number";
    let uids: number[];
    if (primeiraVez) {
      const achados = await c.search({ since: new Date(Date.now() - 86_400_000) }, { uid: true });
      uids = (achados || []).slice(-20);
    } else {
      if (caixa.uidNext - 1 <= estado.ultimoUid!) {
        return { emails: [], estado: { ...estado, falhas: 0 }, primeiraVez: false };
      }
      const achados = await c.search({ uid: `${estado.ultimoUid! + 1}:*` }, { uid: true });
      uids = (achados || []).filter((u) => u > estado.ultimoUid!).slice(-LIMITE_POR_LEITURA);
    }

    const emails: EmailBruto[] = [];
    if (uids.length > 0) {
      for await (const m of c.fetch(
        uids,
        { uid: true, envelope: true, internalDate: true, headers: ["list-unsubscribe", "list-id", "precedence", "auto-submitted"], source: { start: 0, maxLength: BYTES_POR_EMAIL } },
        { uid: true },
      )) {
        let texto = "";
        try {
          const p = await simpleParser(m.source ?? Buffer.alloc(0));
          texto = textoParaIa(p.text, p.html);
        } catch {
          // e-mail cortado/estranho: segue só com remetente e assunto
        }
        const de = m.envelope?.from?.[0];
        const remetenteEmail = (de?.address ?? "").toLowerCase();
        emails.push({
          uid: m.uid,
          messageId: (m.envelope?.messageId || `uid:${validade}:${m.uid}`).slice(0, 490),
          recebidoEm: m.internalDate ? new Date(m.internalDate) : new Date(),
          remetenteNome: (de?.name ?? "").slice(0, 200),
          remetenteEmail: remetenteEmail.slice(0, 320),
          assunto: (m.envelope?.subject ?? "(sem assunto)").slice(0, 500),
          texto,
          automatico: ehAutomatico(m.headers?.toString("utf8") ?? "", remetenteEmail),
        });
      }
    }
    const maior = Math.max(caixa.uidNext - 1, ...uids, primeiraVez ? 0 : estado.ultimoUid!);
    return { emails, estado: { uidValidity: validade, ultimoUid: maior, falhas: 0 }, primeiraVez };
  } catch (e) {
    if (ehErroDeAcesso(e)) throw new AcessoNegado("O Google recusou o acesso.");
    throw e;
  } finally {
    await c.logout().catch(() => {});
  }
}
