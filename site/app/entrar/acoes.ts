"use server";

import { redirect } from "next/navigation";
import { urlDoSite } from "@/lib/config";
import { campo, campoSenha, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";
import { criarClienteSupabase } from "@/lib/supabase/servidor";
import { caminhoSeguro, validarEmail } from "@/lib/validacao";

export async function entrar(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const email = campo(formulario, "email").toLowerCase();
  const senha = campoSenha(formulario, "senha");
  const proximo = caminhoSeguro(campo(formulario, "proximo"), "/painel");
  const valores = { email };

  if (!validarEmail(email) || !senha) return { erro: "Digite seu e-mail e sua senha.", valores };

  const supabase = await criarClienteSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        erro: "Você ainda não confirmou seu e-mail. Procure a mensagem que enviamos (veja também o spam) ou peça um e-mail novo abaixo.",
        valores,
        reenviar: true,
      };
    }
    if (error.code === "invalid_credentials") {
      return { erro: "E-mail ou senha incorretos.", valores };
    }
    if (error.status === 429) {
      return { erro: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.", valores };
    }
    console.error("entrar:", error.code, error.message);
    return { erro: ERRO_GENERICO, valores };
  }

  // Quem tem o app autenticador cadastrado (administrador) precisa do código.
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") {
    redirect(`/entrar/codigo?proximo=${encodeURIComponent(proximo)}`);
  }
  redirect(proximo);
}

export async function reenviarConfirmacao(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const email = campo(formulario, "email").toLowerCase();
  if (!validarEmail(email)) return { erro: "Digite seu e-mail no campo acima." };

  const supabase = await criarClienteSupabase();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: urlDoSite("/auth/confirmar") },
  });
  if (error) {
    console.error("reenviar confirmação:", error.code, error.status, error.message);
    if (error.status === 429) {
      return { erro: "Você acabou de pedir um e-mail. Espere um minuto e tente de novo." };
    }
    if (error.status === 504 || error.code === "request_timeout") {
      return { erro: "Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos." };
    }
  }
  return { sucesso: "Enviamos um e-mail novo. Use o link desse e-mail mais recente (os anteriores deixam de valer)." };
}

export async function confirmarCodigo(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const codigo = campo(formulario, "codigo").replace(/\s/g, "");
  const proximo = caminhoSeguro(campo(formulario, "proximo"), "/painel");
  if (!/^\d{6}$/.test(codigo)) return { erro: "Digite os 6 números que aparecem no app autenticador." };

  const supabase = await criarClienteSupabase();
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  const fator = (fatores?.totp ?? []).find((f) => f.status === "verified");
  if (!fator) redirect(proximo);

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
  if (error) {
    if (error.status === 429) return { erro: "Muitas tentativas. Espere um pouco e tente de novo." };
    return { erro: "Código incorreto ou vencido. Use o código que está aparecendo agora no app." };
  }
  redirect(proximo);
}

export async function sair() {
  const supabase = await criarClienteSupabase();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
