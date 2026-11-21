"use server";

import { revalidatePath } from "next/cache";
import { exigirAprovado } from "@/lib/auth/sessao";
import { campo, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";
import { conectarNoRobo } from "@/lib/robo";

function atualizar() {
  revalidatePath("/painel", "layout");
}

export async function conectarGmail(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { usuarioId } = await exigirAprovado();
  const email = campo(f, "email");
  const senha = String(f.get("senha") ?? "");
  if (!email || !senha) return { erro: "Preencha o e-mail e a senha de app.", valores: { email } };
  const r = await conectarNoRobo("/conexoes/gmail", { usuarioId, email, senha });
  if (!r.ok) return { erro: r.erro ?? ERRO_GENERICO, valores: { email } };
  atualizar();
  return { sucesso: "E-mail conectado! Em instantes os e-mails das últimas 24 horas aparecem no Painel." };
}

export async function conectarAgenda(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { usuarioId } = await exigirAprovado();
  const url = String(f.get("url") ?? "").trim();
  if (!url) return { erro: "Cole o endereço secreto da agenda." };
  const r = await conectarNoRobo("/conexoes/agenda", { usuarioId, url });
  if (!r.ok) return { erro: r.erro ?? ERRO_GENERICO };
  atualizar();
  return { sucesso: "Agenda conectada! Os compromissos de hoje já aparecem no Painel." };
}

export async function desconectar(f: FormData) {
  const { supabase } = await exigirAprovado();
  const tipo = campo(f, "tipo");
  if (tipo !== "gmail" && tipo !== "agenda_ics" && tipo !== "google_calendar") return;
  await supabase.from("conexoes").delete().eq("tipo", tipo);
  atualizar();
}

export async function salvarAvisosPessoais(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const n = (nome: string) => Number(campo(f, nome));
  const minutos = n("minutos");
  const hora = n("hora");
  const silencioInicio = n("silencio_inicio");
  const silencioFim = n("silencio_fim");
  const resumo = campo(f, "resumo") === "sim";
  const audio = campo(f, "audio") || "quando_audio";
  if (audio !== "nunca" && audio !== "quando_audio" && audio !== "sempre") return { erro: ERRO_GENERICO };
  const ok =
    [minutos, hora, silencioInicio, silencioFim].every(Number.isInteger) &&
    minutos >= 0 && minutos <= 120 && hora >= 5 && hora <= 11 &&
    silencioInicio >= 18 && silencioInicio <= 23 && silencioFim >= 5 && silencioFim <= 10;
  if (!ok) return { erro: ERRO_GENERICO };
  const { error } = await supabase
    .from("perfis")
    .update({
      agenda_aviso_minutos: minutos,
      resumo_manha: resumo,
      resumo_manha_hora: hora,
      silencio_inicio: silencioInicio,
      silencio_fim: silencioFim,
      respostas_em_audio: audio,
    })
    .eq("id", usuarioId);
  if (error) return { erro: ERRO_GENERICO };
  atualizar();
  return { sucesso: "Preferências salvas." };
}

// ------------------------------------------------------------- regras de e-mail

export async function criarRegra(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const tipo = campo(f, "tipo");
  const padrao = campo(f, "padrao").toLowerCase().slice(0, 200);
  if (tipo !== "importante" && tipo !== "ignorar") return { erro: ERRO_GENERICO };
  if (padrao.length < 2) return { erro: "Digite um e-mail, um @domínio ou uma palavra.", valores: { padrao } };
  const { error } = await supabase.from("regras_email").insert({ usuario_id: usuarioId, tipo, padrao });
  if (error) return { erro: error.code === "23505" ? "Essa regra já existe." : ERRO_GENERICO, valores: { padrao } };
  atualizar();
  return { sucesso: "Regra criada. Vale para os próximos e-mails." };
}

export async function apagarRegra(f: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(f, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await supabase.from("regras_email").delete().eq("id", id);
  atualizar();
}
