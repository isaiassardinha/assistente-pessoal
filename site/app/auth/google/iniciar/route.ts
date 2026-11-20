import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { exigirAprovado } from "@/lib/auth/sessao";
import { urlDoSite } from "@/lib/config";
import { COOKIE_DESTINO, COOKIE_ESTADO, enderecoDeAutorizacao, googleConfigurado } from "@/lib/google";
import { ehUuid } from "@/lib/despesas";

/**
 * Botão "Conectar com Google": manda a pessoa para a tela de autorização.
 * Sem parâmetro = agenda pessoal. Com ?espaco=<id> = Google Drive do espaço
 * (só administradores; o robô confere de novo na volta).
 */
export async function GET(request: NextRequest) {
  const { supabase } = await exigirAprovado();
  const espaco = request.nextUrl.searchParams.get("espaco");
  const paraDrive = !!espaco && ehUuid(espaco);
  const voltar = paraDrive ? `/painel/espacos/${espaco}` : "/painel/conta";

  if (!googleConfigurado()) return NextResponse.redirect(urlDoSite(`${voltar}?${paraDrive ? "drive" : "google"}=erro${paraDrive ? "#drive" : "#agenda"}`));
  if (paraDrive) {
    const { data: membros } = await supabase.rpc("membros_do_espaco", { p_espaco: espaco });
    if (!membros) return NextResponse.redirect(urlDoSite("/painel/espacos"));
  }

  const estado = randomBytes(32).toString("hex");
  const resposta = NextResponse.redirect(enderecoDeAutorizacao(estado, paraDrive ? "drive" : "agenda"));
  const opcoes = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/auth/google", maxAge: 600 };
  resposta.cookies.set(COOKIE_ESTADO, estado, opcoes);
  resposta.cookies.set(COOKIE_DESTINO, paraDrive ? `drive:${espaco}` : "agenda", opcoes);
  return resposta;
}
