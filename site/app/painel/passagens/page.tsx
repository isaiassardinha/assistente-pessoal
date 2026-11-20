import type { Metadata } from "next";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Abrir, Campo, Secao, Selecao } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { formatarDataHora, hojeISO, somarDias } from "@/lib/datas";
import { formatarReais, valorParaCampo } from "@/lib/dinheiro";
import { datasLegiveis, rotaLegivel } from "@/lib/passagens";
import type { VigiaPassagem } from "@/lib/supabase/tipos";
import { alternarVigia, apagarVigia, criarVigia, mudarAlvo } from "./acoes";

export const metadata: Metadata = { title: "Passagens" };

function linkDa(v: VigiaPassagem): string | null {
  const link = v.ultimo_detalhe?.link;
  return typeof link === "string" && link.startsWith("https://") ? link : null;
}

function Situacao({ v }: { v: VigiaPassagem }) {
  if (!v.ativa)
    return <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">{v.encerrada_motivo ? "Encerrada" : "Pausada"}</span>;
  if (v.ultimo_preco != null && v.ultimo_preco <= v.preco_alvo)
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Abaixo do alvo</span>;
  return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Vigiando</span>;
}

export default async function Passagens() {
  const { supabase } = await exigirAprovado();
  const hoje = hojeISO();
  const [{ data: vigias }, { data: precos }] = await Promise.all([
    supabase.from("vigias_passagem").select("*").order("ativa", { ascending: false }).order("ida"),
    supabase.from("precos_passagem").select("vigia_id, preco, buscado_em").order("buscado_em", { ascending: false }).limit(500),
  ]);
  const historico = new Map<string, { preco: number | null; buscado_em: string }[]>();
  for (const p of precos ?? []) historico.set(p.vigia_id, [...(historico.get(p.vigia_id) ?? []), p]);
  const lista = (vigias ?? []) as VigiaPassagem[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Passagens</h1>
        <p className="mt-1 text-sm text-zinc-600">
          O robô consulta o Google Flights algumas vezes por dia (entre 7h e 22h) e avisa no WhatsApp quando o preço fica abaixo do seu alvo.
          Também dá para pedir pelo WhatsApp: &quot;me avisa quando São Paulo–Miami de 10 a 20 de março ficar abaixo de 3 mil&quot;.
        </p>
      </div>

      <Secao titulo="Suas vigias">
        <ul className="divide-y divide-zinc-100">
          {lista.length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhuma vigia ainda.</li> : null}
          {lista.map((v) => {
            const link = linkDa(v);
            const consultas = historico.get(v.id) ?? [];
            return (
              <li key={v.id} className="space-y-2 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Situacao v={v} />
                  <strong className="text-zinc-900">{rotaLegivel(v)}</strong>
                  <span className="text-zinc-500">
                    {datasLegiveis(v)}
                    {v.adultos > 1 ? ` · ${v.adultos} adultos` : ""}
                    {v.so_direto ? " · só voo direto" : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-zinc-700">
                  <span>
                    Alvo: <strong>{formatarReais(v.preco_alvo)}</strong>
                  </span>
                  <span>
                    Último preço:{" "}
                    <strong>{v.ultimo_preco != null ? formatarReais(v.ultimo_preco) : v.ultima_busca ? "nenhum voo encontrado" : "ainda não consultado"}</strong>
                    {v.ultima_busca ? <span className="text-zinc-500"> ({formatarDataHora(v.ultima_busca)})</span> : null}
                  </span>
                  {v.menor_preco != null ? <span>Menor já visto: {formatarReais(v.menor_preco)}</span> : null}
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 hover:underline">
                      Ver no Google Flights
                    </a>
                  ) : null}
                </div>
                {v.ativa && v.erro ? <p className="text-xs text-amber-700">A última consulta não deu certo; o robô tenta de novo.</p> : null}
                {v.encerrada_motivo ? <p className="text-xs text-zinc-500">Encerrada: {v.encerrada_motivo}.</p> : null}
                <div className="flex flex-wrap items-start gap-4">
                  <Abrir rotulo="Mudar alvo">
                    <FormularioAcao acao={mudarAlvo} rotulo="Salvar" variante="secundario">
                      <input type="hidden" name="id" value={v.id} />
                      <Campo rotulo="Novo preço-alvo (R$)" name="preco_alvo" inputMode="decimal" required defaultValue={valorParaCampo(v.preco_alvo)} />
                    </FormularioAcao>
                  </Abrir>
                  {consultas.length > 0 ? (
                    <Abrir rotulo={`Histórico (${consultas.length})`}>
                      <ul className="max-h-60 space-y-0.5 overflow-y-auto text-xs text-zinc-700">
                        {consultas.slice(0, 60).map((p) => (
                          <li key={p.buscado_em}>
                            {formatarDataHora(p.buscado_em)}: {p.preco != null ? formatarReais(p.preco) : "nenhum voo"}
                          </li>
                        ))}
                      </ul>
                    </Abrir>
                  ) : null}
                  {v.ativa || !v.encerrada_motivo ? (
                    <form action={alternarVigia}>
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="ativa" value={v.ativa ? "nao" : "sim"} />
                      <BotaoEnviar variante="secundario" enviando="…">
                        {v.ativa ? "Pausar" : "Reativar"}
                      </BotaoEnviar>
                    </form>
                  ) : null}
                  <form action={apagarVigia}>
                    <input type="hidden" name="id" value={v.id} />
                    <BotaoEnviar variante="secundario" enviando="…">
                      Apagar
                    </BotaoEnviar>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      </Secao>

      <Secao
        titulo="Nova vigia"
        descricao="Use o código do aeroporto (GRU, MIA, LIS...). Cidade com vários aeroportos: separe por vírgula (São Paulo = GRU,CGH,VCP). Pelo WhatsApp não precisa saber os códigos."
      >
        <FormularioAcao acao={criarVigia} rotulo="Criar vigia">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Origem" name="origem" required maxLength={40} placeholder="GRU,CGH,VCP" />
            <Campo rotulo="Destino" name="destino" required maxLength={40} placeholder="MIA" />
            <Campo rotulo="Nome (opcional)" name="descricao" maxLength={120} placeholder="São Paulo → Miami" />
            <Selecao
              rotulo="Tipo"
              name="tipo"
              opcoes={[
                { valor: "volta", rotulo: "Ida e volta (datas fixas)" },
                { valor: "ida", rotulo: "Só ida" },
                { valor: "flexivel", rotulo: "Datas flexíveis (melhor dia numa janela)" },
              ]}
            />
            <Campo rotulo="Ida (ou início da janela)" name="ida" type="date" required min={hoje} max={somarDias(hoje, 330)} />
            <Campo rotulo="Volta (ida e volta)" name="volta" type="date" min={hoje} max={somarDias(hoje, 330)} />
            <Campo rotulo="Fim da janela (datas flexíveis)" name="ida_ate" type="date" min={hoje} max={somarDias(hoje, 330)} />
            <Campo rotulo="Dias de viagem (flexível; vazio = só ida)" name="dias_viagem" type="number" min={1} max={60} />
            <Campo rotulo="Adultos" name="adultos" type="number" min={1} max={9} defaultValue="1" />
            <Campo rotulo="Avisar abaixo de (R$)" name="preco_alvo" inputMode="decimal" required placeholder="3.000" />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input type="checkbox" name="so_direto" className="h-4 w-4 rounded border-zinc-300" /> Só voos diretos
          </label>
        </FormularioAcao>
      </Secao>
    </div>
  );
}
