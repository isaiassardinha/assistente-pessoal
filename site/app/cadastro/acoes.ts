"use server";

import { redirect } from "next/navigation";
import { urlDoSite } from "@/lib/config";
import { campo, campoSenha, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";
import { criarClienteSupabase } from "@/lib/supabase/servidor";
import { normalizarCelular, problemaNaSenha, validarEmail, validarNome } from "@/lib/validacao";

export async function cadastrar(_anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const nome = campo(formulario, "nome");
  const email = campo(formulario, "email").toLowerCase();
  const celularDigitado = campo(formulario, "celular");
  const senha = campoSenha(formulario, "senha");
  const confirmacao = campoSenha(formulario, "confirmacao");
  const valores = { nome, email, celular: celularDigitado };

  if (!validarNome(nome)) return { erro: "Digite seu nome.", valores };
  if (!validarEmail(email)) return { erro: "Digite um e-mail válido.", valores };
  const celular = normalizarCelular(celularDigitado);
  if (!celular) return { erro: "Digite um celular válido, com DDD. Ex.: (11) 91234-5678.", valores };
  const problema = problemaNaSenha(senha, confirmacao);
  if (problema) return { erro: problema, valores };

  const supabase = await criarClienteSupabase();
  const { error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: {
      emailRedirectTo: urlDoSite("/auth/confirmar"),
      data: { nome, celular },
    },
  });

  if (error) {
    console.error("cadastro:", error.code, error.message);
    if (error.code === "weak_password") {
      return { erro: "Essa senha é fácil demais de adivinhar. Escolha outra.", valores };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { erro: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.", valores };
    }
    if (error.code === "signup_disabled") {
      return { erro: "Os cadastros estão fechados no momento.", valores };
    }
    return { erro: ERRO_GENERICO, valores };
  }

  // Mesmo se o e-mail já existir, a resposta é a mesma (não revela quem tem conta).
  redirect("/cadastro/verifique-email");
}
