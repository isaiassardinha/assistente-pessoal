import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";

// Usada pelo script de publicação e pelo vigia para saber se o site está no ar
// e qual versão está rodando. Não mostra nenhum dado pessoal.
export async function GET() {
  await connection();

  let versao = "desconhecida";
  try {
    versao = (await readFile(path.join(process.cwd(), ".versao"), "utf8")).trim();
  } catch {
    // arquivo só existe no servidor (criado pela publicação)
  }

  // Situação do robô do WhatsApp (sem nenhum dado pessoal)
  let robo: { versao?: string; whatsapp?: string } = {};
  try {
    const r = await fetch(`${process.env.ROBO_URL || "http://127.0.0.1:3001"}/saude`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    const dados = (await r.json()) as { versao?: string; whatsapp?: string; faltando?: string[] };
    robo = { versao: dados.versao, whatsapp: dados.faltando?.length ? "falta configurar" : dados.whatsapp };
  } catch {
    robo = { whatsapp: "robô fora do ar" };
  }

  return Response.json(
    { ok: true, versao, robo, agora: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
