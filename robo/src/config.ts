// Configurações do robô, lidas do ambiente (/etc/assistente/site.env).
// Nada de chave escrita no código.

import { readFileSync } from "node:fs";
import path from "node:path";

function opcional(nome: string): string {
  return (process.env[nome] ?? "").trim();
}

export const config = {
  supabaseUrl: opcional("SUPABASE_URL"),
  supabaseChaveSecreta: opcional("SUPABASE_SECRET_KEY"),
  geminiChave: opcional("GEMINI_API_KEY"),
  geminiModelo: opcional("GEMINI_MODELO") || "gemini-3.1-flash-lite",
  siteUrl: opcional("SITE_URL").replace(/\/+$/, ""),
  /** Senha interna entre o site e o robô (gerada no servidor). */
  tokenInterno: opcional("INTERNO_TOKEN"),
  /** Chave que criptografa as senhas das conexões (gerada no servidor). */
  chaveConexoes: opcional("CONEXOES_CHAVE"),
  /** Login do Google para a agenda (criado pela pessoa no Google Cloud). */
  googleClientId: opcional("GOOGLE_CLIENT_ID"),
  googleClientSecret: opcional("GOOGLE_CLIENT_SECRET"),
  /** Busca de passagens (Google Flights pelo SerpApi). Opcional. */
  serpapiChave: opcional("SERPAPI_KEY"),
  portaInterna: Number(opcional("ROBO_PORTA") || 3001),
  /** Pasta que guarda a sessão do WhatsApp (fica entre as versões). */
  pastaDados: opcional("PASTA_DADOS") || path.resolve("dados"),
  /** Se preenchido, só estes números conversam com o robô. */
  numerosPermitidos: opcional("NUMEROS_PERMITIDOS")
    .split(/[,;\s]+/)
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean),
};

export function versao(): string {
  try {
    return readFileSync(path.resolve(".versao"), "utf8").trim();
  } catch {
    return "desconhecida";
  }
}

/** O que falta para o robô funcionar (mostrado no site e no log). */
export function configuracoesFaltando(): string[] {
  const faltando: string[] = [];
  if (!config.supabaseUrl) faltando.push("SUPABASE_URL");
  if (!config.supabaseChaveSecreta) faltando.push("SUPABASE_SECRET_KEY");
  if (!config.geminiChave) faltando.push("GEMINI_API_KEY");
  if (!config.tokenInterno) faltando.push("INTERNO_TOKEN");
  return faltando;
}
