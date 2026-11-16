import { NextResponse, type NextRequest } from "next/server";
import { formatarDataHora, hojeISO } from "@/lib/datas";
import { buscarDespesas, descreverPeriodo, lerFiltros } from "@/lib/despesas";
import { gerarCsv, gerarPdf } from "@/lib/relatorio";
import { criarClienteSupabase } from "@/lib/supabase/servidor";
import { urlDoSite } from "@/lib/config";

/**
 * Baixar as despesas (PDF ou planilha) com o mesmo filtro da tela.
 * Exige login e cadastro aprovado; o banco (RLS) só devolve os dados da pessoa.
 */
export async function GET(request: NextRequest) {
  const supabase = await criarClienteSupabase();
  const { data: sessao } = await supabase.auth.getClaims();
  if (!sessao?.claims?.sub) return NextResponse.redirect(urlDoSite("/entrar"));
  const { data: perfil } = await supabase.from("perfis").select("status").eq("id", sessao.claims.sub).maybeSingle();
  if (perfil?.status !== "aprovado") return NextResponse.redirect(urlDoSite("/aguardando"));

  const parametros = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filtros = lerFiltros(parametros);
  const [{ linhas, inicio, fim }, { data: categorias }] = await Promise.all([
    buscarDespesas(supabase, filtros, 20000),
    supabase.from("categorias").select("id, nome"),
  ]);
  const nome = new Map((categorias ?? []).map((c) => [c.id, c.nome]));

  const dados = {
    titulo: "Despesas",
    periodo: descreverPeriodo(filtros, inicio, fim),
    geradoEm: formatarDataHora(new Date().toISOString()),
    linhas: [...linhas]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((l) => ({ data: l.data, descricao: l.descricao, categoria: nome.get(l.categoria_id) ?? "?", valor: l.valor })),
  };

  const arquivo = `despesas-${inicio ?? hojeISO()}-a-${fim}`;
  const cabecalhosComuns = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

  if (parametros.formato === "csv") {
    return new Response(gerarCsv(dados), {
      headers: {
        ...cabecalhosComuns,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${arquivo}.csv"`,
      },
    });
  }
  const pdf = await gerarPdf(dados);
  return new Response(Buffer.from(pdf), {
    headers: {
      ...cabecalhosComuns,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${arquivo}.pdf"`,
    },
  });
}
