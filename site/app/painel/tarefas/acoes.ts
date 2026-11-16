"use server";

import { revalidatePath } from "next/cache";
import { exigirAprovado } from "@/lib/auth/sessao";
import { ehUuid } from "@/lib/despesas";
import { campo, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";

function atualizar() {
  revalidatePath("/painel", "layout");
}

export async function criarTarefa(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const titulo = campo(formulario, "titulo").slice(0, 300);
  if (!titulo) return { erro: "Escreva a tarefa." };
  const { error } = await supabase.from("tarefas").insert({ usuario_id: usuarioId, titulo });
  if (error) return { erro: ERRO_GENERICO };
  atualizar();
  return { sucesso: "Tarefa criada." };
}

export async function editarTarefa(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  const titulo = campo(formulario, "titulo").slice(0, 300);
  if (!ehUuid(id) || !titulo) return { erro: "Escreva a tarefa." };
  const { data, error } = await supabase.from("tarefas").update({ titulo }).eq("id", id).select("id");
  if (error || !data?.length) return { erro: ERRO_GENERICO };
  atualizar();
  return { sucesso: "Salvo." };
}

/** Concluir ou reabrir. */
export async function alternarTarefa(formulario: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return;
  const concluida = campo(formulario, "concluida") === "sim";
  await supabase
    .from("tarefas")
    .update({ concluida, concluida_em: concluida ? new Date().toISOString() : null })
    .eq("id", id);
  atualizar();
}

export async function apagarTarefa(formulario: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return;
  await supabase.from("tarefas").delete().eq("id", id);
  atualizar();
}
