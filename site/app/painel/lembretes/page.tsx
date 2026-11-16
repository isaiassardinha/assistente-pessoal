import type { Metadata } from "next";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Abrir, Campo, Secao } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { formatarDataHora, instanteParaLocal } from "@/lib/datas";
import { apagarLembrete, cancelarLembrete, editarLembrete } from "./acoes";
import { FormularioNovoLembrete } from "./Formulario";

export const metadata: Metadata = { title: "Lembretes" };

type Lembrete = { id: string; texto: string; quando: string; status: string };

const SITUACAO: Record<string, { texto: string; cor: string }> = {
  pendente: { texto: "Agendado", cor: "bg-emerald-100 text-emerald-800" },
  enviando: { texto: "Enviando", cor: "bg-emerald-100 text-emerald-800" },
  enviado: { texto: "Enviado", cor: "bg-zinc-200 text-zinc-700" },
  cancelado: { texto: "Cancelado", cor: "bg-zinc-200 text-zinc-700" },
  falhou: { texto: "Não enviado", cor: "bg-red-100 text-red-800" },
};

function ItemLembrete({ l, agora }: { l: Lembrete; agora: string }) {
  const s = SITUACAO[l.status] ?? SITUACAO.pendente;
  const agendado = l.status === "pendente" || l.status === "falhou";
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-zinc-900">{l.texto}</p>
          <p className="text-sm text-zinc-500">{formatarDataHora(l.quando)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.cor}`}>{s.texto}</span>
      </div>
      <div className="mt-1">
        <Abrir rotulo={agendado ? "Editar, cancelar ou apagar" : "Reagendar ou apagar"}>
          <FormularioAcao acao={editarLembrete} rotulo={agendado ? "Salvar" : "Agendar de novo"} variante="secundario">
            <input type="hidden" name="id" value={l.id} />
            <Campo rotulo="Texto" name="texto" maxLength={500} required defaultValue={l.texto} />
            <Campo rotulo="Quando (horário de Brasília)" name="quando" type="datetime-local" min={agora} required defaultValue={instanteParaLocal(l.quando)} />
          </FormularioAcao>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-200 pt-3">
            {agendado ? (
              <form action={cancelarLembrete}>
                <input type="hidden" name="id" value={l.id} />
                <BotaoEnviar variante="secundario" enviando="…">
                  Cancelar lembrete
                </BotaoEnviar>
              </form>
            ) : null}
            <form action={apagarLembrete}>
              <input type="hidden" name="id" value={l.id} />
              <BotaoEnviar variante="perigo" enviando="Apagando…">
                Apagar
              </BotaoEnviar>
            </form>
          </div>
        </Abrir>
      </div>
    </li>
  );
}

export default async function Lembretes() {
  const { supabase } = await exigirAprovado();
  const agora = instanteParaLocal(new Date().toISOString());
  const [{ data: proximos }, { data: anteriores }] = await Promise.all([
    supabase.from("lembretes").select("id, texto, quando, status").in("status", ["pendente", "enviando"]).order("quando"),
    supabase
      .from("lembretes")
      .select("id, texto, quando, status")
      .in("status", ["enviado", "cancelado", "falhou"])
      .order("quando", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Lembretes</h1>

      <Secao titulo="Novo lembrete" descricao="Na hora marcada, o assistente manda uma mensagem no seu WhatsApp (começa a funcionar junto com o robô).">
        <FormularioNovoLembrete agora={agora} />
      </Secao>

      <Secao titulo={`Próximos (${proximos?.length ?? 0})`}>
        <ul className="divide-y divide-zinc-200">
          {(proximos ?? []).length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhum lembrete agendado.</li> : null}
          {(proximos ?? []).map((l) => (
            <ItemLembrete key={l.id} l={l} agora={agora} />
          ))}
        </ul>
      </Secao>

      <Secao titulo="Anteriores" descricao="Os 30 mais recentes já enviados, cancelados ou que não puderam ser enviados.">
        <ul className="divide-y divide-zinc-200">
          {(anteriores ?? []).length === 0 ? <li className="py-3 text-sm text-zinc-500">Nada por aqui ainda.</li> : null}
          {(anteriores ?? []).map((l) => (
            <ItemLembrete key={l.id} l={l} agora={agora} />
          ))}
        </ul>
      </Secao>
    </div>
  );
}
