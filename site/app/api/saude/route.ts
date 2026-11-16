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

  return Response.json(
    { ok: true, versao, agora: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
