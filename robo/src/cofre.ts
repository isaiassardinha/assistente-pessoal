// Criptografia das senhas das conexões (AES-256-GCM).
// A chave fica só no servidor (CONEXOES_CHAVE); no banco vai só o texto cifrado.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./config";

function chave(hex = config.chaveConexoes): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("CONEXOES_CHAVE ausente ou inválida");
  return Buffer.from(hex, "hex");
}

export function cifrar(texto: string, hex?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(hex), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `v1.${Buffer.concat([iv, c.getAuthTag(), dados]).toString("base64url")}`;
}

export function decifrar(cifrado: string, hex?: string): string {
  const [versao, corpo] = cifrado.split(".");
  if (versao !== "v1" || !corpo) throw new Error("segredo em formato desconhecido");
  const bruto = Buffer.from(corpo, "base64url");
  const d = createDecipheriv("aes-256-gcm", chave(hex), bruto.subarray(0, 12));
  d.setAuthTag(bruto.subarray(12, 28));
  return Buffer.concat([d.update(bruto.subarray(28)), d.final()]).toString("utf8");
}
