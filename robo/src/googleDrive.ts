// Google Drive dos espaços: guarda os arquivos originais numa pasta criada
// pelo próprio robô. A permissão pedida é "drive.file": o robô só enxerga
// os arquivos que ele mesmo criou, nunca o resto do Drive da pessoa.

import { randomBytes } from "node:crypto";
import { GoogleRecusou } from "./googleAgenda";

export const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.file";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/** Drive cheio ou limite de uso: não é problema de permissão. */
export class DriveSemEspaco extends Error {}

async function erroDoDrive(r: Response, contexto: string): Promise<Error> {
  const texto = (await r.text().catch(() => "")).slice(0, 300);
  if (/storageQuotaExceeded|quotaExceeded/i.test(texto)) return new DriveSemEspaco(`${contexto}: Drive sem espaço`);
  if (r.status === 401 || (r.status === 403 && !/rateLimit|userRateLimit/i.test(texto))) {
    return new GoogleRecusou(`${contexto}: Drive respondeu ${r.status}`);
  }
  return new Error(`${contexto}: Drive respondeu ${r.status} ${texto}`);
}

/** Cria a pasta do espaço e devolve o id dela. */
export async function criarPasta(token: string, nome: string): Promise<string> {
  const r = await fetch(`${API}/files?fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: nome.slice(0, 200), mimeType: "application/vnd.google-apps.folder" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw await erroDoDrive(r, "criar pasta");
  const d = (await r.json()) as { id?: string };
  if (!d.id) throw new Error("criar pasta: o Drive não devolveu o id");
  return d.id;
}

/** A pasta ainda existe e não está na lixeira? */
export async function pastaExiste(token: string, id: string): Promise<boolean> {
  const r = await fetch(`${API}/files/${encodeURIComponent(id)}?fields=id,trashed`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status === 404) return false;
  if (!r.ok) throw await erroDoDrive(r, "conferir pasta");
  const d = (await r.json()) as { trashed?: boolean };
  return !d.trashed;
}

/** Corpo "multipart/related" do envio: ficha do arquivo + conteúdo. */
export function corpoDoEnvio(nome: string, mime: string, pastaId: string, dados: Buffer, separador = randomBytes(16).toString("hex")) {
  const ficha = JSON.stringify({ name: nome.slice(0, 255), parents: [pastaId] });
  const corpo = Buffer.concat([
    Buffer.from(`--${separador}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${ficha}\r\n--${separador}\r\ncontent-type: ${mime}\r\n\r\n`),
    dados,
    Buffer.from(`\r\n--${separador}--`),
  ]);
  return { corpo, tipo: `multipart/related; boundary=${separador}` };
}

/** Envia o arquivo para a pasta e devolve o id dele no Drive. */
export async function enviarArquivoDrive(token: string, pastaId: string, nome: string, mime: string, dados: Buffer): Promise<string> {
  const { corpo, tipo } = corpoDoEnvio(nome, mime, pastaId, dados);
  const r = await fetch(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": tipo },
    body: corpo,
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw await erroDoDrive(r, "enviar arquivo");
  const d = (await r.json()) as { id?: string };
  if (!d.id) throw new Error("enviar arquivo: o Drive não devolveu o id");
  return d.id;
}

/** Baixa o arquivo (null se não existe mais no Drive). */
export async function baixarArquivoDrive(token: string, id: string): Promise<Buffer | null> {
  const r = await fetch(`${API}/files/${encodeURIComponent(id)}?alt=media`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120_000),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw await erroDoDrive(r, "baixar arquivo");
  return Buffer.from(await r.arrayBuffer());
}

/** Manda para a lixeira do Drive (dá para recuperar por 30 dias). */
export async function lixeiraDrive(token: string, id: string): Promise<boolean> {
  const r = await fetch(`${API}/files/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ trashed: true }),
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status === 404) return false;
  if (!r.ok) throw await erroDoDrive(r, "apagar arquivo");
  return true;
}

/** E-mail da conta do Drive (só para mostrar no site). */
export async function contaDoDrive(token: string): Promise<string> {
  const r = await fetch(`${API}/about?fields=user(emailAddress)`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!r?.ok) return "Google Drive";
  const d = (await r.json().catch(() => ({}))) as { user?: { emailAddress?: string } };
  return (d.user?.emailAddress || "Google Drive").slice(0, 200);
}

export function idDoDriveValido(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{10,200}$/.test(id);
}
