import type { Metadata } from "next";
import Link from "next/link";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Campo, Secao, Selecao } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { formatarDataHora, horasAtras } from "@/lib/datas";
import { apagarRegra, criarRegra } from "../conta/conexoes";

export const metadata: Metadata = { title: "E-mails" };

const ROTULO = {
  urgente: { texto: "Urgente", cor: "bg-red-100 text-red-800" },
  importante: { texto: "Importante", cor: "bg-amber-100 text-amber-900" },
  normal: { texto: "Normal", cor: "bg-zinc-100 text-zinc-700" },
  ignorar: { texto: "Ignorado", cor: "bg-zinc-100 text-zinc-500" },
} as const;

export default async function Emails({ searchParams }: PageProps<"/painel/emails">) {
  const { supabase } = await exigirAprovado();
  const parametros = await searchParams;
  const todos = parametros.ver === "todos";
  let consulta = supabase
    .from("emails")
    .select("id, recebido_em, remetente_nome, remetente_email, assunto, resumo, importancia, motivo")
    .gte("recebido_em", horasAtras(7 * 24))
    .order("recebido_em", { ascending: false })
    .limit(300);
  if (!todos) consulta = consulta.in("importancia", ["urgente", "importante"]);
  const [{ data: emails }, { data: regras }, { data: conexao }] = await Promise.all([
    consulta,
    supabase.from("regras_email").select("id, tipo, padrao").order("criado_em"),
    supabase.from("conexoes").select("conta, situacao").eq("tipo", "gmail").maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">E-mails</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {conexao ? (
            <>
              Lendo <strong>{conexao.conta}</strong>. Aqui ficam só remetente, assunto e um resumo; o e-mail completo continua no Gmail.
            </>
          ) : (
            <>
              E-mail não conectado.{" "}
              <Link href="/painel/conta#gmail" className="font-medium text-emerald-700 hover:underline">
                Conectar em Minha conta
              </Link>
            </>
          )}
        </p>
      </div>

      <Secao titulo={todos ? "Todos os e-mails (7 dias)" : "Importantes e urgentes (7 dias)"}>
        <p className="mb-3 text-sm">
          <Link href={todos ? "/painel/emails" : "/painel/emails?ver=todos"} className="font-medium text-emerald-700 hover:underline">
            {todos ? "Ver só os importantes" : "Ver todos, inclusive os ignorados"}
          </Link>
        </p>
        <ul className="divide-y divide-zinc-100">
          {(emails ?? []).length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhum e-mail aqui.</li> : null}
          {(emails ?? []).map((e) => (
            <li key={e.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROTULO[e.importancia].cor}`}>{ROTULO[e.importancia].texto}</span>
                <strong className="text-zinc-900">{e.remetente_nome || e.remetente_email}</strong>
                <span className="text-zinc-500">{formatarDataHora(e.recebido_em)}</span>
              </div>
              <p className="mt-0.5 text-zinc-900">{e.assunto}</p>
              {e.resumo ? <p className="text-zinc-600">{e.resumo}</p> : null}
              {e.motivo ? <p className="text-xs text-zinc-400">Por quê: {e.motivo}</p> : null}
            </li>
          ))}
        </ul>
      </Secao>

      <Secao
        titulo="Regras"
        descricao='Ensine o que é importante. Também dá pelo WhatsApp: "e-mails do @meubanco.com.br são sempre importantes", "ignora e-mails da loja X".'
      >
        <ul className="mb-4 divide-y divide-zinc-100 text-sm">
          {(regras ?? []).length === 0 ? <li className="py-2 text-zinc-500">Nenhuma regra ainda.</li> : null}
          {(regras ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className={r.tipo === "importante" ? "font-medium text-red-700" : "text-zinc-500"}>
                  {r.tipo === "importante" ? "Sempre avisar na hora" : "Ignorar"}
                </span>
                : <strong>{r.padrao}</strong>
              </span>
              <form action={apagarRegra}>
                <input type="hidden" name="id" value={r.id} />
                <BotaoEnviar variante="secundario" enviando="…">
                  Apagar
                </BotaoEnviar>
              </form>
            </li>
          ))}
        </ul>
        <FormularioAcao acao={criarRegra} rotulo="Criar regra" variante="secundario">
          <div className="grid gap-3 sm:grid-cols-2">
            <Selecao
              rotulo="Quando o e-mail for de / tiver"
              name="tipo"
              opcoes={[
                { valor: "importante", rotulo: "Sempre avisar na hora" },
                { valor: "ignorar", rotulo: "Ignorar" },
              ]}
            />
            <Campo rotulo="E-mail, @domínio ou palavra" name="padrao" required maxLength={200} placeholder="@meubanco.com.br" />
          </div>
        </FormularioAcao>
      </Secao>
    </div>
  );
}
