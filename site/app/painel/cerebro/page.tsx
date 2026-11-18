import type { Metadata } from "next";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Abrir, Secao } from "@/components/ui";
import { tamanhoLegivel } from "@/lib/arquivos";
import { exigirAprovado } from "@/lib/auth/sessao";
import { formatarDataHora } from "@/lib/datas";
import { apagarAnotacao, criarAnotacao, editarAnotacao } from "./acoes";
import { EnviarArquivos } from "./EnviarArquivos";
import { AcoesDocumento } from "./AcoesDocumento";
import { AtualizarSozinho } from "./AtualizarSozinho";
import { Pergunta } from "./Pergunta";

export const metadata: Metadata = { title: "Cérebro" };

const SITUACAO: Record<string, { texto: string; cor: string }> = {
  pendente: { texto: "Na fila para ler", cor: "bg-amber-100 text-amber-900" },
  processando: { texto: "Lendo…", cor: "bg-amber-100 text-amber-900" },
  pronto: { texto: "Pronto", cor: "bg-emerald-100 text-emerald-800" },
  erro: { texto: "Não consegui ler (arquivo guardado)", cor: "bg-red-100 text-red-800" },
};

const CAIXA_TEXTO =
  "block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

export default async function Cerebro() {
  const { supabase } = await exigirAprovado();
  const [{ data: documentos }, { data: anotacoes }] = await Promise.all([
    supabase
      .from("documentos")
      .select("id, nome_arquivo, descricao, tamanho_bytes, status, resumo, erro, origem, criado_em")
      .order("criado_em", { ascending: false })
      .limit(1000),
    supabase.from("memorias").select("id, texto, origem, criado_em").order("criado_em", { ascending: false }).limit(200),
  ]);
  const lendo = (documentos ?? []).some((d) => d.status === "pendente" || d.status === "processando");
  const docs = documentos ?? [];
  const contagem = {
    site: docs.filter((d) => d.origem === "site").length,
    whatsapp: docs.filter((d) => d.origem === "whatsapp").length,
    lidos: docs.filter((d) => d.status === "pronto").length,
    lendo: docs.filter((d) => d.status === "pendente" || d.status === "processando").length,
    erro: docs.filter((d) => d.status === "erro").length,
  };

  return (
    <div className="space-y-6">
      <AtualizarSozinho ativo={lendo} />
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Cérebro</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Tudo o que você guarda aqui (ou manda pelo WhatsApp) fica pesquisável: é só perguntar, aqui ou no WhatsApp.
        </p>
      </div>

      <Secao titulo="Pergunte aos seus documentos e anotações">
        <Pergunta />
      </Secao>

      <Secao titulo="Enviar documentos">
        <EnviarArquivos />
      </Secao>

      <Secao
        titulo={`Documentos (${documentos?.length ?? 0})`}
        descricao={`${contagem.site} pelo site · ${contagem.whatsapp} pelo WhatsApp · ${contagem.lidos} lidos${contagem.lendo ? ` · ${contagem.lendo} na fila` : ""}${contagem.erro ? ` · ${contagem.erro} não lidos` : ""}. Espaço usado: ${tamanhoLegivel((documentos ?? []).reduce((t, d) => t + d.tamanho_bytes, 0))} de 1 GB do plano gratuito.`}
      >
        <ul className="divide-y divide-zinc-200">
          {(documentos ?? []).length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhum documento ainda.</li> : null}
          {(documentos ?? []).map((d) => {
            const s = SITUACAO[d.status] ?? SITUACAO.pendente;
            return (
              <li key={d.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <a href={`/painel/cerebro/baixar/${d.id}`} className="break-all font-medium text-zinc-900 hover:underline" target="_blank" rel="noopener">
                    {d.nome_arquivo}
                  </a>
                  <AcoesDocumento id={d.id} nome={d.nome_arquivo} descricao={d.descricao} comErro={d.status === "erro"} />
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cor}`}>{s.texto}</span>
                </div>
                <p className="text-xs text-zinc-500">
                  {formatarDataHora(d.criado_em)} · {tamanhoLegivel(d.tamanho_bytes)} · {d.origem === "whatsapp" ? "veio pelo WhatsApp" : "enviado pelo site"}
                </p>
                {d.descricao ? <p className="mt-1 text-sm text-zinc-700">{d.descricao}</p> : null}
                {d.resumo ? <p className="mt-1 text-sm text-zinc-600">{d.resumo}</p> : null}
                {d.status === "erro" && d.erro ? <p className="mt-1 text-sm text-red-700">{d.erro}</p> : null}
              </li>
            );
          })}
        </ul>
      </Secao>

      <section id="anotacoes">
        <Secao titulo={`Anotações (${anotacoes?.length ?? 0})`} descricao='Informações soltas para lembrar depois. Pelo WhatsApp: "guarda isso: ..."'>
          <FormularioAcao acao={criarAnotacao} rotulo="Guardar anotação">
            <label htmlFor="nova-anotacao" className="block text-sm font-medium text-zinc-800">
              Nova anotação
            </label>
            <textarea id="nova-anotacao" name="texto" rows={2} maxLength={1000} required placeholder="Ex.: a senha do wi-fi da casa da minha mãe é flor2024" className={CAIXA_TEXTO} />
          </FormularioAcao>
          <ul className="mt-4 divide-y divide-zinc-200">
            {(anotacoes ?? []).length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhuma anotação ainda.</li> : null}
            {(anotacoes ?? []).map((n) => (
              <li key={n.id} className="py-3">
                <p className="whitespace-pre-line text-zinc-900">{n.texto}</p>
                <p className="text-xs text-zinc-500">
                  {formatarDataHora(n.criado_em)} · {n.origem === "whatsapp" ? "pelo WhatsApp" : "pelo site"}
                </p>
                <div className="mt-1">
                  <Abrir rotulo="Editar ou apagar">
                    <FormularioAcao acao={editarAnotacao} rotulo="Salvar" variante="secundario">
                      <input type="hidden" name="id" value={n.id} />
                      <textarea name="texto" rows={3} maxLength={1000} required defaultValue={n.texto} aria-label="Anotação" className={CAIXA_TEXTO} />
                    </FormularioAcao>
                    <form action={apagarAnotacao} className="mt-3 border-t border-zinc-200 pt-3">
                      <input type="hidden" name="id" value={n.id} />
                      <BotaoEnviar variante="perigo" enviando="Apagando…">
                        Apagar anotação
                      </BotaoEnviar>
                    </form>
                  </Abrir>
                </div>
              </li>
            ))}
          </ul>
        </Secao>
      </section>
    </div>
  );
}
