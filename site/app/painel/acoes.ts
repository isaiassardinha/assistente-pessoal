"use server";

import { revalidatePath } from "next/cache";
import { exigirAprovado } from "@/lib/auth/sessao";
import { ehUuid } from "@/lib/despesas";
import { lerValor } from "@/lib/dinheiro";
import { campo, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";

/** Define (ou remove, se vazio) o limite mensal de uma categoria. */
export async function definirLimite(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const categoria = campo(formulario, "categoria");
  if (!ehUuid(categoria)) return { erro: ERRO_GENERICO };
  const texto = campo(formulario, "limite");

  if (!texto) {
    await supabase.from("orcamentos").delete().eq("categoria_id", categoria);
    revalidatePath("/painel", "layout");
    return { sucesso: "Limite removido." };
  }

  const limite = lerValor(texto);
  if (!limite) return { erro: "Digite um valor válido. Ex.: 500 ou 1.200,00. Deixe vazio para remover o limite." };
  const { error } = await supabase
    .from("orcamentos")
    .upsert({ usuario_id: usuarioId, categoria_id: categoria, limite_mensal: limite }, { onConflict: "usuario_id,categoria_id" });
  if (error) {
    console.error("definir limite:", error.code, error.message);
    return { erro: ERRO_GENERICO };
  }
  revalidatePath("/painel", "layout");
  return { sucesso: "Limite salvo." };
}
