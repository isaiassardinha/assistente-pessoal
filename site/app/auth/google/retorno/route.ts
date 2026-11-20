import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { exigirAprovado } from "@/lib/auth/sessao";
import { urlDoSite } from "@/lib/config";
import { COOKIE_DESTINO, COOKIE_ESTADO, enderecoDeRetorno, espacoDoDestino, estadoConfere, type ResultadoGoogle } from "@/lib/google";
import { acaoNoEspaco, conectarNoRobo } from "@/lib/robo";

/** O Google devolve a pessoa para cá depois da autorização (agenda ou Drive de um espaço). */
export async function GET(request: NextRequest) {
  const { usuarioId } = await exigirAprovado();
  const p = request.nextUrl.searchParams;
  const guardado = request.cookies.get(COOKIE_ESTADO)?.value;
  const espacoId = espacoDoDestino(request.cookies.get(COOKIE_DESTINO)?.value);

  let resultado: ResultadoGoogle;
  if (p.get("error")) resultado = "recusado";
  else if (!estadoConfere(p.get("state"), guardado)) resultado = "expirou";
  else {
    const codigo = p.get("code") ?? "";
    const r = !codigo
      ? { ok: false as const }
      : espacoId
        ? await acaoNoEspaco("/espacos/drive", { usuarioId, espacoId, codigo, redirectUri: enderecoDeRetorno() })
        : await conectarNoRobo("/conexoes/google", { usuarioId, codigo, redirectUri: enderecoDeRetorno() });
    resultado = r.ok ? "ok" : "erro" in r && typeof r.erro === "string" && r.erro.includes("caixinha") ? "permissao" : "erro";
    if (r.ok) revalidatePath("/painel", "layout");
  }

  const destino = espacoId ? `/painel/espacos/${espacoId}?drive=${resultado}#drive` : `/painel/conta?google=${resultado}#agenda`;
  const resposta = NextResponse.redirect(urlDoSite(destino));
  const apagar = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/auth/google", maxAge: 0 };
  resposta.cookies.set(COOKIE_ESTADO, "", apagar);
  resposta.cookies.set(COOKIE_DESTINO, "", apagar);
  return resposta;
}
