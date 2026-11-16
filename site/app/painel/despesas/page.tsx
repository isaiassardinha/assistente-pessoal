import type { Metadata } from "next";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Abrir, Campo, Secao, Selecao } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { formatarData, hojeISO, PERIODOS } from "@/lib/datas";
import { buscarDespesas, descreverPeriodo, filtrosParaQuery, lerFiltros, somar, totalPorCategoria } from "@/lib/despesas";
import { formatarReais, valorParaCampo } from "@/lib/dinheiro";
import {
  alternarFixa,
  apagarCategoria,
  apagarDespesa,
  apagarFixa,
  criarCategoria,
  editarDespesa,
  renomearCategoria,
} from "./acoes";
import { FormularioNovaDespesa, FormularioNovaFixa } from "./Formularios";

export const metadata: Metadata = { title: "Despesas" };

const MOSTRAR_NA_LISTA = 300;

export default async function Despesas({ searchParams }: PageProps<"/painel/despesas">) {
  const { supabase } = await exigirAprovado();
  const hoje = hojeISO();
  const filtros = lerFiltros(await searchParams, hoje);

  const [{ data: categoriasBrutas }, { data: fixasBrutas }, resultado] = await Promise.all([
    supabase.from("categorias").select("id, nome").order("nome"),
    supabase.from("despesas_fixas").select("id, descricao, valor, categoria_id, dia_vencimento, ativa").order("dia_vencimento"),
    buscarDespesas(supabase, filtros),
  ]);

  const categorias = categoriasBrutas ?? [];
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
  const opcoesCategoria = categorias.map((c) => ({ valor: c.id, rotulo: c.nome }));
  const fixas = (fixasBrutas ?? []).map((f) => ({ ...f, valor: Number(f.valor) }));

  const { linhas, inicio, fim } = resultado;
  const total = somar(linhas);
  const porCategoria = [...totalPorCategoria(linhas).entries()].sort((a, b) => b[1] - a[1]);
  const query = filtrosParaQuery(filtros);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Despesas</h1>

      <Secao titulo="Lançar despesa">
        <FormularioNovaDespesa categorias={opcoesCategoria} hoje={hoje} />
      </Secao>

      <Secao titulo="Minhas despesas" descricao={descreverPeriodo(filtros, inicio, fim)}>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Selecao rotulo="Período" name="periodo" opcoes={PERIODOS} defaultValue={filtros.periodo} />
          <Campo rotulo="De" name="de" type="date" defaultValue={filtros.periodo === "personalizado" ? (filtros.de ?? "") : ""} />
          <Campo rotulo="Até" name="ate" type="date" defaultValue={filtros.periodo === "personalizado" ? (filtros.ate ?? "") : ""} />
          <Selecao rotulo="Categoria" name="categoria" opcoes={opcoesCategoria} vazia="Todas" defaultValue={filtros.categoria} />
          <Campo rotulo="Procurar" name="busca" placeholder="texto da descrição" defaultValue={filtros.busca} />
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
            <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700">
              Filtrar
            </button>
            <a href={`/painel/despesas/exportar?formato=pdf&${query}`} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50">
              Baixar PDF
            </a>
            <a href={`/painel/despesas/exportar?formato=csv&${query}`} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50">
              Baixar planilha
            </a>
          </div>
          <p className="text-xs text-zinc-500 sm:col-span-2 lg:col-span-5">As datas “De” e “Até” valem quando o período é “Escolher datas”.</p>
        </form>

        <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-2xl font-semibold text-zinc-900">{formatarReais(total)}</p>
          <p className="text-sm text-zinc-600">{linhas.length} despesa(s)</p>
        </div>
        {porCategoria.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {porCategoria.map(([id, valor]) => (
              <span key={id} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700">
                {nomeCategoria.get(id) ?? "?"}: <strong>{formatarReais(valor)}</strong>
              </span>
            ))}
          </div>
        ) : null}

        <ul className="mt-6 divide-y divide-zinc-200">
          {linhas.length === 0 ? <li className="py-6 text-center text-zinc-500">Nenhuma despesa encontrada.</li> : null}
          {linhas.slice(0, MOSTRAR_NA_LISTA).map((d) => (
            <li key={d.id} className="py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">{d.descricao || nomeCategoria.get(d.categoria_id)}</p>
                  <p className="text-sm text-zinc-500">
                    {formatarData(d.data)} · {nomeCategoria.get(d.categoria_id) ?? "?"}
                    {d.origem === "whatsapp" ? " · pelo WhatsApp" : d.origem === "fixa" ? " · despesa fixa" : ""}
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-zinc-900">{formatarReais(d.valor)}</p>
              </div>
              <div className="mt-1">
                <Abrir rotulo="Editar">
                  <FormularioAcao acao={editarDespesa} rotulo="Salvar alterações">
                    <input type="hidden" name="id" value={d.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo rotulo="Valor (R$)" name="valor" inputMode="decimal" required defaultValue={valorParaCampo(d.valor)} />
                      <Selecao rotulo="Categoria" name="categoria" opcoes={opcoesCategoria} required defaultValue={d.categoria_id} />
                      <Campo rotulo="Descrição" name="descricao" maxLength={200} defaultValue={d.descricao} />
                      <Campo rotulo="Data" name="data" type="date" required defaultValue={d.data} />
                    </div>
                  </FormularioAcao>
                  <form action={apagarDespesa} className="mt-3 border-t border-zinc-200 pt-3">
                    <input type="hidden" name="id" value={d.id} />
                    <BotaoEnviar variante="perigo" enviando="Apagando…">
                      Apagar esta despesa
                    </BotaoEnviar>
                  </form>
                </Abrir>
              </div>
            </li>
          ))}
        </ul>
        {linhas.length > MOSTRAR_NA_LISTA ? (
          <p className="mt-3 text-sm text-zinc-500">
            Mostrando as {MOSTRAR_NA_LISTA} mais recentes. O total e os arquivos para baixar incluem todas.
          </p>
        ) : null}
      </Secao>

      <Secao
        titulo="Despesas fixas"
        descricao="Contas que se repetem todo mês (aluguel, escola…). O lançamento automático no dia certo começa junto com o robô do WhatsApp."
      >
        <ul className="divide-y divide-zinc-200">
          {fixas.length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhuma despesa fixa cadastrada.</li> : null}
          {fixas.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-zinc-900">
                  {f.descricao} · {formatarReais(f.valor)}
                  {!f.ativa ? <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">Pausada</span> : null}
                </p>
                <p className="text-sm text-zinc-500">
                  Todo dia {f.dia_vencimento} · {nomeCategoria.get(f.categoria_id) ?? "?"}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={alternarFixa}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="ativa" value={f.ativa ? "nao" : "sim"} />
                  <BotaoEnviar variante="secundario" enviando="…">
                    {f.ativa ? "Pausar" : "Reativar"}
                  </BotaoEnviar>
                </form>
                <form action={apagarFixa}>
                  <input type="hidden" name="id" value={f.id} />
                  <BotaoEnviar variante="perigo" enviando="…">
                    Apagar
                  </BotaoEnviar>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-zinc-200 pt-4">
          <FormularioNovaFixa categorias={opcoesCategoria} />
        </div>
      </Secao>

      <Secao titulo="Categorias" descricao="O assistente só aceita estas categorias e nunca inventa outra.">
        <ul className="divide-y divide-zinc-200">
          {categorias.map((c) => (
            <li key={c.id} className="py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-900">{c.nome}</span>
              </div>
              <Abrir rotulo="Renomear ou apagar">
                <FormularioAcao acao={renomearCategoria} rotulo="Salvar nome" variante="secundario">
                  <input type="hidden" name="id" value={c.id} />
                  <Campo rotulo="Novo nome" name="nome" maxLength={40} required defaultValue={c.nome} />
                </FormularioAcao>
                <div className="mt-3 border-t border-zinc-200 pt-3">
                  <FormularioAcao acao={apagarCategoria} rotulo="Apagar categoria" variante="perigo" enviando="Apagando…">
                    <input type="hidden" name="id" value={c.id} />
                  </FormularioAcao>
                </div>
              </Abrir>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-zinc-200 pt-4">
          <FormularioAcao acao={criarCategoria} rotulo="Adicionar categoria" variante="secundario">
            <Campo rotulo="Nova categoria" name="nome" maxLength={40} placeholder="Ex.: Pets" required />
          </FormularioAcao>
        </div>
      </Secao>
    </div>
  );
}
