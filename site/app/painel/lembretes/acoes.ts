"use server";

import { revalidatePath } from "next/cache";
import { exigirAprovado } from "@/lib/auth/sessao";
import { localParaInstante } from "@/lib/datas";
import { ehUuid } from "@/lib/despesas";
import { campo, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";

function atualizar() {
  revalidatePath("/painel", "layout");
}

function lerLembrete(formulario: FormData): { texto?: string; quando?: string; erro?: string } {
  const texto = campo(formulario, "texto").slice(0, 500);
  if (!texto) return { erro: "Escreva do que é o lembrete." };
  const quando = localParaInstante(campo(formulario, "quando"));
  if (!quando) return { erro: "Escolha a data e a hora." };
  if (new Date(quando).getTime() < Date.now() - 60_000) return { erro: "Esse horário já passou. Escolha um horário no futuro." };
  return { texto, quando };
}

export async function criarLembrete(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const { texto, quando, erro } = lerLembrete(formulario);
  if (erro || !texto || !quando) {
    return { erro, valores: { texto: campo(formulario, "texto"), quando: campo(formulario, "quando") } };
  }
  const { error } = await supabase.from("lembretes").insert({ usuario_id: usuarioId, texto, quando });
  if (error) return { erro: ERRO_GENERICO };
  atualizar();
  return { sucesso: "Lembrete criado." };
}

/** Editar texto/horário. Se o lembrete já tinha sido enviado ou cancelado, volta a ficar agendado. */
export async function editarLembrete(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return { erro: ERRO_GENERICO };
  const { texto, quando, erro } = lerLembrete(formulario);
  if (erro || !texto || !quando) return { erro };

  const { data, error } = await supabase
    .from("lembretes")
    .update({ texto, quando, status: "pendente", tentativas: 0, reservado_em: null, enviado_em: null, ultimo_erro: null })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { erro: ERRO_GENERICO };
  atualizar();
  return { sucesso: "Lembrete atualizado." };
}

export async function cancelarLembrete(formulario: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return;
  await supabase.from("lembretes").update({ status: "cancelado" }).eq("id", id).in("status", ["pendente", "falhou"]);
  atualizar();
}

export async function apagarLembrete(formulario: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return;
  await supabase.from("lembretes").delete().eq("id", id);
  atualizar();
}
