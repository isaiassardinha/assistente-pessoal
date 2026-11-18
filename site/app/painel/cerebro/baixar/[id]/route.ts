import { NextResponse, type NextRequest } from "next/server";
import { exigirAprovado } from "@/lib/auth/sessao";
import { urlDoSite } from "@/lib/config";
import { ehUuid } from "@/lib/despesas";

/**
 * Baixar um documento do cofre. O banco (RLS) só acha documentos da própria
 * pessoa; o link gerado vale por 1 minuto.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/painel/cerebro/baixar/[id]">) {
  const { id } = await ctx.params;
  const { supabase } = await exigirAprovado();
  if (!ehUuid(id)) return NextResponse.redirect(urlDoSite("/painel/cerebro"));

  const { data: doc } = await supabase.from("documentos").select("caminho, nome_arquivo").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.redirect(urlDoSite("/painel/cerebro"));

  const { data } = await supabase.storage.from("documentos").createSignedUrl(doc.caminho, 60, { download: doc.nome_arquivo });
  if (!data?.signedUrl) return NextResponse.redirect(urlDoSite("/painel/cerebro"));
  return NextResponse.redirect(data.signedUrl);
}
