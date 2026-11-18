import type { Metadata } from "next";
import Link from "next/link";
import { Cabecalho } from "@/components/Cabecalho";
import { Secao } from "@/components/ui";
import { exigirAdmin } from "@/lib/auth/sessao";
import { cotacaoDolar, emReais, formatarDolar, formatarTokens, NOMES_TIPO, resumirUso, type LinhaUso } from "@/lib/consumo";
import { lerMes, limitesDoMes, nomeDoMes, somarMes } from "@/lib/contas";
import { formatarDataCurta, hojeISO } from "@/lib/datas";
import { classeLargura } from "@/lib/orcamento";

export const metadata: Metadata = { title: "Consumo da IA" };

function Valor({ usd, cotacao, grande }: { usd: number; cotacao: number | null; grande?: boolean }) {
  return (
    <>
      <span className={grande ? "text-2xl font-semibold text-zinc-900" : "font-medium text-zinc-900"}>{formatarDolar(usd)}</span>
      {cotacao ? <span className="ml-1 text-xs text-zinc-500">{emReais(usd, cotacao)}</span> : null}
    </>
  );
}

export default async function ConsumoIa({ searchParams }: PageProps<"/admin/consumo">) {
  const { supabase, perfil } = await exigirAdmin();
  const hoje = hojeISO();
  const parametros = await searchParams;
  const mes = lerMes(typeof parametros.mes === "string" ? parametros.mes : null, hoje);
  const { inicio, fim } = limitesDoMes(mes);

  const [{ data, error }, { data: pessoas }, cotacao] = await Promise.all([
    supabase.rpc("resumo_uso_ia", { p_de: inicio, p_ate: fim }),
    supabase.from("perfis").select("id, nome"),
    cotacaoDolar(),
  ]);
  const linhas = (data ?? []) as LinhaUso[];
  const r = resumirUso(linhas, hoje, mes);
  const nome = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));
  const maiorDia = Math.max(0, ...r.porDia.values());
  const dias = [...r.porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const mesAtual = mes === hoje.slice(0, 7);

  return (
    <>
      <Cabecalho nome={perfil.nome} admin />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Consumo da IA</h1>
            <p className="mt-1 text-sm text-zinc-600">Estimativa calculada pelo sistema com o preço de tabela do Gemini.</p>
          </div>
          <nav className="flex items-center gap-2 text-sm" aria-label="Mês">
            <Link href={`/admin/consumo?mes=${somarMes(mes, -1)}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
              ←
            </Link>
            <span className="min-w-36 text-center font-medium capitalize text-zinc-900">{nomeDoMes(mes)}</span>
            <Link href={`/admin/consumo?mes=${somarMes(mes, 1)}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
              →
            </Link>
          </nav>
        </div>

        {error ? <p className="text-red-700">Não consegui carregar o consumo agora.</p> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-600">{mesAtual ? "Este mês até agora" : "Total do mês"}</p>
            <Valor usd={r.total.custo} cotacao={cotacao} grande />
            <p className="text-xs text-zinc-500">{r.total.chamadas} chamadas à IA</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-600">Hoje</p>
            <Valor usd={mesAtual ? r.hoje.custo : 0} cotacao={cotacao} grande />
            <p className="text-xs text-zinc-500">{mesAtual ? `${r.hoje.chamadas} chamadas` : "—"}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-600">{mesAtual ? "Previsão para o mês" : "Média por dia"}</p>
            <Valor usd={mesAtual ? r.previsao : r.total.custo / Math.max(1, dias.length)} cotacao={cotacao} grande />
            <p className="text-xs text-zinc-500">{mesAtual ? "no ritmo atual" : ""}</p>
          </div>
        </div>

        <Secao titulo="Por tipo de uso">
          <ul className="divide-y divide-zinc-100 text-sm">
            {r.porTipo.length === 0 ? <li className="py-2 text-zinc-500">Nenhum uso registrado neste mês.</li> : null}
            {r.porTipo.map(([tipo, t]) => (
              <li key={tipo} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-zinc-800">{NOMES_TIPO[tipo] ?? tipo}</span>
                <span className="text-right">
                  <Valor usd={t.custo} cotacao={cotacao} />
                  <span className="ml-2 text-xs text-zinc-500">
                    {t.chamadas} chamadas · {formatarTokens(t.entrada)} tokens lidos · {formatarTokens(t.saida)} escritos
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao titulo="Por pessoa">
          <ul className="divide-y divide-zinc-100 text-sm">
            {r.porPessoa.map(([quem, t]) => (
              <li key={quem} className="flex items-baseline justify-between gap-2 py-2">
                <span className="text-zinc-800">{quem === "sistema" ? "Sistema (autoteste)" : (nome.get(quem) ?? "Conta apagada")}</span>
                <Valor usd={t.custo} cotacao={cotacao} />
              </li>
            ))}
          </ul>
        </Secao>

        <Secao titulo="Por dia">
          <ul className="space-y-1 text-sm">
            {dias.map(([dia, custo]) => (
              <li key={dia} className="grid grid-cols-[3.5rem_1fr_7rem] items-center gap-3">
                <span className="text-zinc-600">{formatarDataCurta(dia)}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
                  <div className={`h-full rounded-full bg-emerald-500 ${classeLargura(maiorDia ? (custo / maiorDia) * 100 : 0)}`} />
                </div>
                <span className="text-right text-zinc-800">{formatarDolar(custo)}</span>
              </li>
            ))}
          </ul>
        </Secao>

        <p className="text-xs text-zinc-500">
          Preço de tabela usado: Gemini 3.1 Flash-Lite US$ 0,25 por milhão de tokens lidos (áudio US$ 0,50) e US$ 1,50 por milhão escritos; Gemini
          Embedding 2 US$ 0,20 por milhão. O valor cobrado de verdade aparece no Google AI Studio (aba de faturamento), onde fica também o teto de
          gastos.{cotacao ? ` Dólar a R$ ${cotacao.toFixed(2).replace(".", ",")} (AwesomeAPI).` : ""}
        </p>
      </main>
    </>
  );
}
