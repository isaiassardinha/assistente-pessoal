"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { campo, type EstadoFormulario } from "@/lib/formularios";
import { criarClienteSupabase } from "@/lib/supabase/servidor";
import { caminhoSeguro } from "@/lib/validacao";

const TIPOS_ACEITOS: EmailOtpType[] = ["email", "signup", "recovery", "email_change", "invite", "magiclink"];

/**
 * Usa o link do e-mail (confirmar cadastro ou criar senha nova).
 * Só roda quando a PESSOA clica no botão: assim os "robôs de segurança" de
 * e-mail corporativo, que abrem os links antes, não gastam o link.
 */
export async function usarLink(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const tokenHash = campo(formulario, "token_hash");
  const tipo = campo(formulario, "type") as EmailOtpType;
  const codigo = campo(formulario, "code");
  const proximo = caminhoSeguro(campo(formulario, "next"), "/painel");

  const supabase = await criarClienteSupabase();
  let erro: { code?: string; message: string } | null = null;

  if (tokenHash && TIPOS_ACEITOS.includes(tipo)) {
    ({ error: erro } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash }));
  } else if (codigo) {
    ({ error: erro } = await supabase.auth.exchangeCodeForSession(codigo));
  } else {
    erro = { message: "link sem código" };
  }

  if (erro) {
    console.error("usar link:", erro.code, erro.message);
    return {
      erro: "Esse link já foi usado ou venceu. Se for confirmação de cadastro, entre com seu e-mail e senha e peça um e-mail novo.",
    };
  }
  redirect(proximo);
}
