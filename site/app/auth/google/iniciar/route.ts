import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { exigirAprovado } from "@/lib/auth/sessao";
import { urlDoSite } from "@/lib/config";
import { COOKIE_ESTADO, enderecoDeAutorizacao, googleConfigurado } from "@/lib/google";

/** Botão "Conectar com Google": manda a pessoa para a tela de autorização do Google. */
export async function GET() {
  await exigirAprovado();
  if (!googleConfigurado()) return NextResponse.redirect(urlDoSite("/painel/conta?google=erro#agenda"));
  const estado = randomBytes(32).toString("hex");
  const resposta = NextResponse.redirect(enderecoDeAutorizacao(estado));
  resposta.cookies.set(COOKIE_ESTADO, estado, { httpOnly: true, secure: true, sameSite: "lax", path: "/auth/google", maxAge: 600 });
  return resposta;
}
