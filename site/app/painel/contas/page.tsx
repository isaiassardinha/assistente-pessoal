import type { Metadata } from "next";
import Link from "next/link";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Abrir, Campo, Secao, Selecao } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { lerMes, limitesDoMes, nomeDoMes, resumirContas, situacaoDaConta, somarMes, type Situacao } from "@/lib/contas";
import { formatarData, hojeISO } from "@/lib/datas";
import { formatarReais, valorParaCampo } from "@/lib/dinheiro";
import type { Conta } from "@/lib/supabase/tipos";
import {
  alternarFixa,
  apagarFixa,
  criarConta,
  criarFixa,
  desfazerPagamento,
  editarConta,
  editarFixa,
  pagarConta,
  salvarAvisos,
  tirarConta,
  voltarParaAPagar,
} from "./acoes";

export const metadata: Metadata = { title: "Contas" };

const CORES: Record<Situacao, string> = {
  atrasada: "bg-red-100 text-red-800",
  hoje: "bg-amber-100 text-amber-900",
  proxima: "bg-amber-50 text-amber-800",
  a_pagar: "bg-zinc-100 text-zinc-700",
  paga: "bg-emerald-100 text-emerald-800",
  ignorada: "bg-zinc-100 text-zinc-500",
};

const opcoesNumero = (de: number, ate: number, rotulo: (n: number) => string) =>
  Array.from({ length: ate - de + 1 }, (_, i) => ({
    valor: String(de + i),
    rotulo: rotulo(de + i),
  }));

type Linha = Pick<Conta, "id" | "descricao" | "valor" | "categoria_id" | "vencimento" | "status" | "paga_em" | "despesa_fixa_id">;

export default async function Contas({ searchParams }: PageProps<"/painel/contas">) {
  const { supabase, perfil } = await exigirAprovado();
  const hoje = hojeISO();
  const parametros = await searchParams;
  const mes = lerMes(typeof parametros.mes === "string" ? parametros.mes : null, hoje);
  const { inicio, fim } = limitesDoMes(mes);
  const mesAtual = mes === hoje.slice(0, 7);

  const campos = "id, descricao, valor, categoria_id, vencimento, status, paga_em, despesa_fixa_id";
  const [{ data: categorias }, { data: doMes }, { data: anteriores }, { data: fixasBrutas }] = await Promise.all([
    supabase.from("categorias").select("id, nome").order("nome"),
    supabase.from("contas").select(campos).gte("vencimento", inicio).lte("vencimento", fim).order("vencimento").order("descricao"),
    // atrasadas de meses anteriores aparecem no mês atual
    mesAtual
      ? supabase.from("contas").select(campos).lt("vencimento", inicio).eq("status", "a_pagar").order("vencimento").limit(100)
      : Promise.resolve({ data: [] as Linha[] }),
    supabase.from("despesas_fixas").select("id, descricao, valor, categoria_id, dia_vencimento, ativa").order("dia_vencimento"),
  ]);

  const numerico = (c: Linha): Linha => ({
    ...c,
    valor: c.valor == null ? null : Number(c.valor),
  });
  const contas = (doMes ?? []).map(numerico);
  const atrasadasAntes = (anteriores ?? []).map(numerico);
  const fixas = (fixasBrutas ?? []).map((f) => ({
    ...f,
    valor: f.valor == null ? null : Number(f.valor),
  }));
  const resumo = resumirContas([...atrasadasAntes, ...contas], hoje);
  const nomeCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nome]));
  const opcoesCategoria = (categorias ?? []).map((c) => ({
    valor: c.id,
    rotulo: c.nome,
  }));
  const categoriaPadrao = (categorias ?? []).find((c) => c.nome.toLowerCase() === "contas")?.id ?? "";

  function ItemConta({ c }: { c: Linha }) {
    const s = situacaoDaConta(c, hoje);
    return (
      <li className="py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-medium ${c.status === "ignorada" ? "text-zinc-400 line-through" : "text-zinc-900"}`}>
                {c.descricao}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CORES[s.situacao]}`}>{s.texto}</span>
            </div>
            <p className="text-sm text-zinc-500">
              Vence {formatarData(c.vencimento)} · {nomeCategoria.get(c.categoria_id) ?? "?"}
              {c.despesa_fixa_id ? " · todo mês" : ""}
            </p>
          </div>
          <p className={`shrink-0 font-semibold ${c.valor == null ? "text-sm text-amber-700" : "text-zinc-900"}`}>
            {c.valor == null ? "valor a definir" : formatarReais(c.valor)}
          </p>
        </div>

        {c.status === "a_pagar" ? (
          <div className="mt-1 flex flex-wrap gap-x-4">
            <Abrir rotulo="Paguei">
              <FormularioAcao acao={pagarConta} rotulo="Marcar como paga" enviando="Salvando…">
                <input type="hidden" name="id" value={c.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo
                    rotulo="Valor pago (R$)"
                    name="valor"
                    inputMode="decimal"
                    required
                    placeholder="287,40"
                    defaultValue={c.valor == null ? "" : valorParaCampo(c.valor)}
                  />
                  <Campo rotulo="Pago em" name="data" type="date" required defaultValue={hoje} max={hoje} />
                </div>
                <p className="text-xs text-zinc-500">O gasto entra sozinho em Despesas.</p>
              </FormularioAcao>
            </Abrir>
            <Abrir rotulo="Editar">
              <FormularioAcao acao={editarConta} rotulo="Salvar" variante="secundario">
                <input type="hidden" name="id" value={c.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Descrição" name="descricao" maxLength={200} required defaultValue={c.descricao} />
                  <Campo
                    rotulo="Valor (R$)"
                    name="valor"
                    inputMode="decimal"
                    placeholder="em branco = a definir"
                    defaultValue={c.valor == null ? "" : valorParaCampo(c.valor)}
                  />
                  <Campo rotulo="Vencimento" name="vencimento" type="date" required defaultValue={c.vencimento} />
                  <Selecao rotulo="Categoria" name="categoria" opcoes={opcoesCategoria} required defaultValue={c.categoria_id} />
                </div>
              </FormularioAcao>
              <form action={tirarConta} className="mt-3 border-t border-zinc-200 pt-3">
                <input type="hidden" name="id" value={c.id} />
                <BotaoEnviar variante="perigo" enviando="…">
                  {c.despesa_fixa_id ? "Ignorar só este mês" : "Apagar esta conta"}
                </BotaoEnviar>
              </form>
            </Abrir>
          </div>
        ) : null}

        {c.status === "paga" ? (
          <form action={desfazerPagamento} className="mt-1">
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className="text-sm font-medium text-zinc-600 underline hover:text-zinc-900">
              Desfazer pagamento (apaga o gasto lançado)
            </button>
          </form>
        ) : null}

        {c.status === "ignorada" ? (
          <form action={voltarParaAPagar} className="mt-1">
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className="text-sm font-medium text-zinc-600 underline hover:text-zinc-900">
              Voltar para a pagar
            </button>
          </form>
        ) : null}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Contas a pagar</h1>
        <nav className="flex items-center gap-2 text-sm" aria-label="Mês">
          <Link href={`/painel/contas?mes=${somarMes(mes, -1)}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
            ←
          </Link>
          <span className="min-w-36 text-center font-medium capitalize text-zinc-900">{nomeDoMes(mes)}</span>
          <Link href={`/painel/contas?mes=${somarMes(mes, 1)}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
            →
          </Link>
        </nav>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-600">Falta pagar</p>
          <p className="text-2xl font-semibold text-zinc-900">{formatarReais(resumo.aPagar)}</p>
          <p className="text-xs text-zinc-500">
            {resumo.qtdAPagar} conta(s)
            {resumo.semValor ? ` · ${resumo.semValor} sem valor definido` : ""}
          </p>
        </div>
        <div className={`rounded-xl border p-4 ${resumo.atrasadas ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}>
          <p className="text-sm text-zinc-600">Atrasadas</p>
          <p className={`text-2xl font-semibold ${resumo.atrasadas ? "text-red-700" : "text-zinc-900"}`}>{resumo.atrasadas}</p>
          <p className="text-xs text-zinc-500">não marcadas como pagas</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-600">Já pago</p>
          <p className="text-2xl font-semibold text-emerald-700">{formatarReais(resumo.pagas)}</p>
          <p className="text-xs text-zinc-500">neste mês</p>
        </div>
      </div>

      {atrasadasAntes.length > 0 ? (
        <Secao titulo="Atrasadas de meses anteriores">
          <ul className="divide-y divide-zinc-200">
            {atrasadasAntes.map((c) => (
              <ItemConta key={c.id} c={c} />
            ))}
          </ul>
        </Secao>
      ) : null}

      <Secao titulo={`Contas de ${nomeDoMes(mes)}`}>
        <ul className="divide-y divide-zinc-200">
          {contas.length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhuma conta neste mês.</li> : null}
          {contas.map((c) => (
            <ItemConta key={c.id} c={c} />
          ))}
        </ul>
      </Secao>

      <Secao
        titulo="Nova conta avulsa"
        descricao="Para contas de uma vez só: boleto, IPVA, parcela… Pelo WhatsApp: “tenho um boleto de 450 que vence dia 25”."
      >
        <FormularioAcao acao={criarConta} rotulo="Cadastrar conta">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Descrição" name="descricao" maxLength={200} required placeholder="Ex.: IPVA 2027" />
            <Campo rotulo="Valor (R$)" name="valor" inputMode="decimal" placeholder="em branco = a definir" />
            <Campo rotulo="Vencimento" name="vencimento" type="date" required min={hoje.slice(0, 4) + "-01-01"} />
            <Selecao rotulo="Categoria" name="categoria" opcoes={opcoesCategoria} required defaultValue={categoriaPadrao} />
          </div>
        </FormularioAcao>
      </Secao>

      <Secao
        titulo="Contas fixas (todo mês)"
        descricao="Aluguel, condomínio, luz, internet… A conta de cada mês aparece sozinha na lista. Deixe o valor em branco nas que mudam todo mês."
      >
        <ul className="divide-y divide-zinc-200">
          {fixas.length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhuma conta fixa cadastrada.</li> : null}
          {fixas.map((f) => (
            <li key={f.id} className="py-3">
              <p className="font-medium text-zinc-900">
                {f.descricao} · {f.valor == null ? <span className="text-amber-700">muda todo mês</span> : formatarReais(f.valor)}
                {!f.ativa ? <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">Pausada</span> : null}
              </p>
              <p className="text-sm text-zinc-500">
                Todo dia {f.dia_vencimento} · {nomeCategoria.get(f.categoria_id) ?? "?"}
              </p>
              <div className="mt-1">
                <Abrir rotulo="Editar, pausar ou apagar">
                  <FormularioAcao acao={editarFixa} rotulo="Salvar" variante="secundario">
                    <input type="hidden" name="id" value={f.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo rotulo="Descrição" name="descricao" maxLength={200} required defaultValue={f.descricao} />
                      <Campo
                        rotulo="Valor (R$)"
                        name="valor"
                        inputMode="decimal"
                        placeholder="em branco = muda todo mês"
                        defaultValue={f.valor == null ? "" : valorParaCampo(f.valor)}
                      />
                      <Campo rotulo="Vence todo dia" name="dia" type="number" min={1} max={31} required defaultValue={f.dia_vencimento} />
                      <Selecao rotulo="Categoria" name="categoria" opcoes={opcoesCategoria} required defaultValue={f.categoria_id} />
                    </div>
                  </FormularioAcao>
                  <div className="mt-3 flex gap-2 border-t border-zinc-200 pt-3">
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
                  <p className="mt-2 text-xs text-zinc-500">
                    Pausar ou apagar tira só as contas futuras; as já pagas continuam no histórico.
                  </p>
                </Abrir>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-zinc-200 pt-4">
          <FormularioAcao acao={criarFixa} rotulo="Cadastrar conta fixa" variante="secundario">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Descrição" name="descricao" maxLength={200} required placeholder="Ex.: Aluguel" />
              <Campo rotulo="Valor (R$)" name="valor" inputMode="decimal" placeholder="em branco = muda todo mês" />
              <Campo rotulo="Vence todo dia" name="dia" type="number" min={1} max={31} required placeholder="5" />
              <Selecao rotulo="Categoria" name="categoria" opcoes={opcoesCategoria} required defaultValue={categoriaPadrao} />
            </div>
          </FormularioAcao>
        </div>
      </Secao>

      <Secao
        titulo="Avisos no WhatsApp"
        descricao="O assistente manda uma mensagem por dia com o que vence e o que ainda não foi marcado como pago."
      >
        <FormularioAcao acao={salvarAvisos} rotulo="Salvar avisos" variante="secundario">
          <div className="grid gap-3 sm:grid-cols-3">
            <Selecao
              rotulo="Avisar antes do vencimento"
              name="antes"
              opcoes={opcoesNumero(0, 10, (n) => (n === 0 ? "Não avisar antes" : n === 1 ? "1 dia antes" : `${n} dias antes`))}
              defaultValue={String(perfil.contas_aviso_dias_antes)}
            />
            <Selecao
              rotulo="Depois de vencida, repetir"
              name="cada"
              opcoes={opcoesNumero(1, 7, (n) => (n === 1 ? "Todo dia" : `A cada ${n} dias`))}
              defaultValue={String(perfil.contas_aviso_atraso_cada)}
            />
            <Selecao
              rotulo="Horário do aviso"
              name="hora"
              opcoes={opcoesNumero(6, 20, (n) => `${n}h`)}
              defaultValue={String(perfil.contas_aviso_hora)}
            />
          </div>
          <p className="text-xs text-zinc-500">
            No dia do vencimento ele sempre avisa. Os avisos só chegam se o seu celular estiver verificado.
          </p>
        </FormularioAcao>
      </Secao>
    </div>
  );
}
