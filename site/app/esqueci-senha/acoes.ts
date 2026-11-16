"use server";

import { redirect } from "next/navigation";
import { urlDoSite } from "@/lib/config";
import { campo, campoSenha, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";
import { criarClienteSupabase } from "@/lib/supabase/servidor";
import { problemaNaSenha, validarEmail } from "@/lib/validacao";

export async function pedirNovaSenha(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const email = campo(formulario, "email").toLowerCase();
  if (!validarEmail(email)) return { erro: "Digite um e-mail válido.", valores: { email } };

  const supabase = await criarClienteSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: urlDoSite("/auth/confirmar?next=/nova-senha"),
  });
  if (error) {
    console.error("esqueci a senha:", error.code, error.message);
    if (error.status === 429) {
      return { erro: "Muitos pedidos seguidos. Espere alguns minutos e tente de novo.", valores: { email } };
    }
  }
  // Mesma resposta para qualquer e-mail (não revela quem tem conta).
  return {
    sucesso: "Se existir uma conta com esse e-mail, enviamos um link para criar uma senha nova. Confira sua caixa de entrada.",
  };
}

export async function definirNovaSenha(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const senha = campoSenha(formulario, "senha");
  const confirmacao = campoSenha(formulario, "confirmacao");
  const problema = problemaNaSenha(senha, confirmacao);
  if (problema) return { erro: problema };

  const supabase = await criarClienteSupabase();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    if (error.code === "same_password") return { erro: "A nova senha precisa ser diferente da atual." };
    if (error.code === "weak_password") return { erro: "Essa senha é fácil demais de adivinhar. Escolha outra." };
    if (error.code === "insufficient_aal") redirect("/entrar/codigo?proximo=/nova-senha");
    console.error("nova senha:", error.code, error.message);
    return { erro: ERRO_GENERICO };
  }

  await supabase.auth.signOut({ scope: "others" });
  redirect("/painel?aviso=senha-alterada");
}
