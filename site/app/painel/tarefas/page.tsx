import type { Metadata } from "next";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Abrir, Campo, Secao } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { formatarDataHora } from "@/lib/datas";
import { alternarTarefa, apagarTarefa, criarTarefa, editarTarefa } from "./acoes";

export const metadata: Metadata = { title: "Tarefas" };

type Tarefa = { id: string; titulo: string; concluida: boolean; concluida_em: string | null; criado_em: string };

function ItemTarefa({ t }: { t: Tarefa }) {
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <form action={alternarTarefa} className="pt-0.5">
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="concluida" value={t.concluida ? "nao" : "sim"} />
          <button
            type="submit"
            aria-label={t.concluida ? "Reabrir tarefa" : "Concluir tarefa"}
            title={t.concluida ? "Reabrir" : "Concluir"}
            className={`flex h-6 w-6 items-center justify-center rounded-md border text-sm ${
              t.concluida ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-400 bg-white hover:border-emerald-600"
            }`}
          >
            {t.concluida ? "✓" : ""}
          </button>
        </form>
        <div className="min-w-0 flex-1">
          <p className={t.concluida ? "text-zinc-500 line-through" : "text-zinc-900"}>{t.titulo}</p>
          {t.concluida && t.concluida_em ? <p className="text-xs text-zinc-500">Concluída em {formatarDataHora(t.concluida_em)}</p> : null}
          <div className="mt-1">
            <Abrir rotulo="Editar ou apagar">
              <FormularioAcao acao={editarTarefa} rotulo="Salvar" variante="secundario">
                <input type="hidden" name="id" value={t.id} />
                <Campo rotulo="Tarefa" name="titulo" maxLength={300} required defaultValue={t.titulo} />
              </FormularioAcao>
              <form action={apagarTarefa} className="mt-3 border-t border-zinc-200 pt-3">
                <input type="hidden" name="id" value={t.id} />
                <BotaoEnviar variante="perigo" enviando="Apagando…">
                  Apagar tarefa
                </BotaoEnviar>
              </form>
            </Abrir>
          </div>
        </div>
      </div>
    </li>
  );
}

export default async function Tarefas() {
  const { supabase } = await exigirAprovado();
  const [{ data: pendentes }, { data: concluidas }] = await Promise.all([
    supabase.from("tarefas").select("id, titulo, concluida, concluida_em, criado_em").eq("concluida", false).order("criado_em"),
    supabase
      .from("tarefas")
      .select("id, titulo, concluida, concluida_em, criado_em")
      .eq("concluida", true)
      .order("concluida_em", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Tarefas</h1>

      <Secao titulo="Nova tarefa">
        <FormularioAcao acao={criarTarefa} rotulo="Adicionar tarefa">
          <Campo rotulo="O que precisa ser feito?" name="titulo" maxLength={300} placeholder="Ex.: renovar o seguro do carro" required />
        </FormularioAcao>
      </Secao>

      <Secao titulo={`Pendentes (${pendentes?.length ?? 0})`}>
        <ul className="divide-y divide-zinc-200">
          {(pendentes ?? []).length === 0 ? <li className="py-3 text-sm text-zinc-500">Nada pendente. 🎉</li> : null}
          {(pendentes ?? []).map((t) => (
            <ItemTarefa key={t.id} t={t} />
          ))}
        </ul>
      </Secao>

      <Secao titulo="Concluídas" descricao="As 30 mais recentes.">
        <ul className="divide-y divide-zinc-200">
          {(concluidas ?? []).length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhuma tarefa concluída ainda.</li> : null}
          {(concluidas ?? []).map((t) => (
            <ItemTarefa key={t.id} t={t} />
          ))}
        </ul>
      </Secao>
    </div>
  );
}
