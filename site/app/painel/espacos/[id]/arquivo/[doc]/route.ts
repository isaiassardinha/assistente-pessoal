import { NextResponse, type NextRequest } from "next/server";
import { exigirAprovado } from "@/lib/auth/sessao";
import { urlDoSite } from "@/lib/config";
import { ehUuid } from "@/lib/despesas";
import { baixarDoEspaco } from "@/lib/robo";

/**
 * Baixar o original de um documento do espaço. O robô confere se a pessoa
 * é membro e busca o arquivo no Google Drive ou no cofre.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/painel/espacos/[id]/arquivo/[doc]">) {
  const { id, doc } = await ctx.params;
  const { usuarioId } = await exigirAprovado();
  if (!ehUuid(id) || !ehUuid(doc)) return NextResponse.redirect(urlDoSite("/painel/espacos"));

  const r = await baixarDoEspaco(usuarioId, id, doc);
  if (!r?.ok || !r.body) return NextResponse.redirect(urlDoSite(`/painel/espacos/${id}?arquivo=erro`));

  const nome = decodeURIComponent(r.headers.get("x-nome-arquivo") ?? "arquivo");
  const simples = nome.replace(/[^\w.\- ]/g, "_");
  return new NextResponse(r.body, {
    headers: {
      "Content-Type": r.headers.get("content-type") ?? "application/octet-stream",
      ...(r.headers.get("content-length") ? { "Content-Length": r.headers.get("content-length")! } : {}),
      "Content-Disposition": `attachment; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
