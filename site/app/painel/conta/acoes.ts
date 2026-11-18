"use server";

import { revalidatePath } from "next/cache";
import { exigirAprovado } from "@/lib/auth/sessao";
import { campo, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";
import { confirmarCodigo, pedirCodigo } from "@/lib/robo";
import { normalizarCelular, validarNome } from "@/lib/validacao";

const NOME_ASSISTENTE = /^[A-Za-zÀ-ÖØ-öø-ÿ]{1,30}$/;

export async function salvarDados(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId, perfil } = await exigirAprovado();
  const nome = campo(formulario, "nome");
  const nomeAssistente = campo(formulario, "nome_assistente");
  const celular = normalizarCelular(campo(formulario, "celular"));

  if (!validarNome(nome)) return { erro: "Digite seu nome." };
  if (!NOME_ASSISTENTE.test(nomeAssistente)) return { erro: "O nome do assistente pode ter só letras (sem espaço), até 30." };
  if (!celular) return { erro: "Digite um celular válido, com DDD." };

  const { error } = await supabase
    .from("perfis")
    .update({ nome, nome_assistente: nomeAssistente, celular })
    .eq("id", usuarioId);
  if (error) {
    console.error("salvar dados:", error.code, error.message);
    return { erro: ERRO_GENERICO };
  }
  revalidatePath("/painel", "layout");
  return {
    sucesso: celular !== perfil.celular ? "Dados salvos. Como o celular mudou, verifique o número novo abaixo." : "Dados salvos.",
  };
}

export async function enviarCodigo(): Promise<EstadoFormulario> {
  const { usuarioId } = await exigirAprovado();
  const r = await pedirCodigo(usuarioId);
  if (r.jaVerificado) {
    revalidatePath("/painel", "layout");
    return { sucesso: "Seu celular já está verificado." };
  }
  if (!r.ok) return { erro: r.erro ?? ERRO_GENERICO };
  return { sucesso: "Enviamos um código de 6 números no seu WhatsApp. Digite abaixo." };
}

export async function confirmarCodigoDigitado(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { usuarioId } = await exigirAprovado();
  const codigo = campo(formulario, "codigo").replace(/\D/g, "");
  if (codigo.length !== 6) return { erro: "Digite os 6 números do código." };
  const r = await confirmarCodigo(usuarioId, codigo);
  if (!r.ok) return { erro: r.erro ?? ERRO_GENERICO };
  revalidatePath("/painel", "layout");
  return { sucesso: "Celular verificado! Em instantes você recebe uma mensagem de boas-vindas no WhatsApp." };
}
