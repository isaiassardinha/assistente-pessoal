import type { Metadata } from "next";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Abrir, Campo, Secao } from "@/components/ui";
import { DESCRICAO_TIPOS, EXTENSOES_ACEITAS, tamanhoLegivel } from "@/lib/arquivos";
import { exigirAprovado } from "@/lib/auth/sessao";
import { formatarDataHora } from "@/lib/datas";
import { apagarAnotacao, apagarDocumento, criarAnotacao, editarAnotacao, editarDescricao, enviarDocumento } from "./acoes";
import { AtualizarSozinho } from "./AtualizarSozinho";
import { Pergunta } from "./Pergunta";

export const metadata: Metadata = { title: "Cérebro" };

const SITUACAO: Record<string, { texto: string; cor: string }> = {
  pendente: { texto: "Na fila para ler", cor: "bg-amber-100 text-amber-900" },
  processando: { texto: "Lendo…", cor: "bg-amber-100 text-amber-900" },
  pronto: { texto: "Pronto", cor: "bg-emerald-100 text-emerald-800" },
  erro: { texto: "Não consegui ler", cor: "bg-red-100 text-red-800" },
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
      .limit(200),
    supabase.from("memorias").select("id, texto, origem, criado_em").order("criado_em", { ascending: false }).limit(200),
  ]);
  const lendo = (documentos ?? []).some((d) => d.status === "pendente" || d.status === "processando");

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

      <Secao titulo="Enviar documento" descricao={`${DESCRICAO_TIPOS}. Até 20 MB por arquivo.`}>
        <FormularioAcao acao={enviarDocumento} rotulo="Enviar" enviando="Enviando…">
          <div className="space-y-1">
            <label htmlFor="arquivo" className="block text-sm font-medium text-zinc-800">
              Arquivo
            </label>
            <input
              id="arquivo"
              name="arquivo"
              type="file"
              required
              accept={EXTENSOES_ACEITAS.map((e) => `.${e}`).join(",")}
              className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:bg-zinc-200"
            />
          </div>
          <Campo rotulo="Descrição (opcional)" name="descricao" maxLength={1000} placeholder="Ex.: contrato do apartamento da Rua X" />
        </FormularioAcao>
      </Secao>

      <Secao titulo={`Documentos (${documentos?.length ?? 0})`}>
        <ul className="divide-y divide-zinc-200">
          {(documentos ?? []).length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhum documento ainda.</li> : null}
          {(documentos ?? []).map((d) => {
            const s = SITUACAO[d.status] ?? SITUACAO.pendente;
            return (
              <li key={d.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`/painel/cerebro/baixar/${d.id}`} className="break-all font-medium text-zinc-900 hover:underline" target="_blank" rel="noopener">
                    {d.nome_arquivo}
                  </a>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cor}`}>{s.texto}</span>
                </div>
                <p className="text-xs text-zinc-500">
                  {formatarDataHora(d.criado_em)} · {tamanhoLegivel(d.tamanho_bytes)} · {d.origem === "whatsapp" ? "veio pelo WhatsApp" : "enviado pelo site"}
                </p>
                {d.descricao ? <p className="mt-1 text-sm text-zinc-700">{d.descricao}</p> : null}
                {d.resumo ? <p className="mt-1 text-sm text-zinc-600">{d.resumo}</p> : null}
                {d.status === "erro" && d.erro ? <p className="mt-1 text-sm text-red-700">{d.erro}</p> : null}
                <div className="mt-1">
                  <Abrir rotulo="Editar ou apagar">
                    <FormularioAcao acao={editarDescricao} rotulo="Salvar descrição" variante="secundario">
                      <input type="hidden" name="id" value={d.id} />
                      <Campo rotulo="Descrição" name="descricao" maxLength={1000} defaultValue={d.descricao} />
                    </FormularioAcao>
                    <form action={apagarDocumento} className="mt-3 border-t border-zinc-200 pt-3">
                      <input type="hidden" name="id" value={d.id} />
                      <BotaoEnviar variante="perigo" enviando="Apagando…">
                        Apagar documento
                      </BotaoEnviar>
                    </form>
                  </Abrir>
                </div>
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
