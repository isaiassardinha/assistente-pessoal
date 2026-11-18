import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { exigirAprovado } from "@/lib/auth/sessao";
import { urlDoSite } from "@/lib/config";
import { COOKIE_ESTADO, enderecoDeRetorno, estadoConfere, type ResultadoGoogle } from "@/lib/google";
import { conectarNoRobo } from "@/lib/robo";

/** O Google devolve a pessoa para cá depois da autorização. */
export async function GET(request: NextRequest) {
  const { usuarioId } = await exigirAprovado();
  const p = request.nextUrl.searchParams;
  const guardado = request.cookies.get(COOKIE_ESTADO)?.value;

  let resultado: ResultadoGoogle;
  if (p.get("error")) resultado = "recusado";
  else if (!estadoConfere(p.get("state"), guardado)) resultado = "expirou";
  else {
    const codigo = p.get("code") ?? "";
    const r = codigo ? await conectarNoRobo("/conexoes/google", { usuarioId, codigo, redirectUri: enderecoDeRetorno() }) : { ok: false };
    resultado = r.ok ? "ok" : "erro" in r && typeof r.erro === "string" && r.erro.includes("caixinha") ? "permissao" : "erro";
    if (r.ok) revalidatePath("/painel", "layout");
  }

  const resposta = NextResponse.redirect(urlDoSite(`/painel/conta?google=${resultado}#agenda`));
  resposta.cookies.set(COOKIE_ESTADO, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/auth/google", maxAge: 0 });
  return resposta;
}
