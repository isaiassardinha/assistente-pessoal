import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { urlDoSite } from "@/lib/config";
import { criarClienteSupabase } from "@/lib/supabase/servidor";
import { caminhoSeguro } from "@/lib/validacao";

const TIPOS_ACEITOS: EmailOtpType[] = ["email", "signup", "recovery", "email_change", "invite", "magiclink"];

/**
 * Destino dos links enviados por e-mail (confirmar cadastro, nova senha).
 * Sempre redireciona usando SITE_URL, nunca o endereço interno (localhost:3000).
 */
export async function GET(request: NextRequest) {
  const parametros = request.nextUrl.searchParams;
  const tokenHash = parametros.get("token_hash");
  const tipo = parametros.get("type") as EmailOtpType | null;
  const codigo = parametros.get("code");
  const proximo = caminhoSeguro(parametros.get("next"), "/painel");

  const supabase = await criarClienteSupabase();
  let deuCerto = false;

  if (tokenHash && tipo && TIPOS_ACEITOS.includes(tipo)) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    deuCerto = !error;
    if (error) console.error("confirmar link:", error.code, error.message);
  } else if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    deuCerto = !error;
    if (error) console.error("confirmar código:", error.code, error.message);
  }

  return NextResponse.redirect(urlDoSite(deuCerto ? proximo : "/entrar?aviso=link-invalido"));
}
