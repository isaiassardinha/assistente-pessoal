import type { Metadata } from "next";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Cabecalho } from "@/components/Cabecalho";
import { exigirAdmin } from "@/lib/auth/sessao";
import type { Perfil, StatusCadastro } from "@/lib/supabase/tipos";
import { formatarCelular } from "@/lib/validacao";
import { definirStatus } from "./acoes";

export const metadata: Metadata = { title: "Administração" };

const ROTULO: Record<StatusCadastro, { texto: string; cor: string }> = {
  pendente: { texto: "Aguardando", cor: "bg-amber-100 text-amber-900" },
  aprovado: { texto: "Aprovado", cor: "bg-emerald-100 text-emerald-800" },
  recusado: { texto: "Recusado", cor: "bg-zinc-200 text-zinc-700" },
};

const ORDEM: Record<StatusCadastro, number> = { pendente: 0, aprovado: 1, recusado: 2 };

function data(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

function BotaoStatus({ usuario, status, rotulo, perigo }: { usuario: string; status: StatusCadastro; rotulo: string; perigo?: boolean }) {
  return (
    <form action={definirStatus}>
      <input type="hidden" name="usuario" value={usuario} />
      <input type="hidden" name="status" value={status} />
      <BotaoEnviar variante={perigo ? "perigo" : "secundario"} enviando="…">
        {rotulo}
      </BotaoEnviar>
    </form>
  );
}

export default async function Admin() {
  const { supabase, perfil, usuarioId } = await exigirAdmin();
  const { data: cadastros, error } = await supabase
    .from("perfis")
    .select("id, nome, email, celular, celular_verificado, status, is_admin, criado_em")
    .order("criado_em", { ascending: false });

  const lista = ((cadastros ?? []) as Pick<Perfil, "id" | "nome" | "email" | "celular" | "celular_verificado" | "status" | "is_admin" | "criado_em">[])
    .sort((a, b) => ORDEM[a.status] - ORDEM[b.status]);
  const pendentes = lista.filter((c) => c.status === "pendente").length;

  return (
    <>
      <Cabecalho nome={perfil.nome} admin />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Cadastros</h1>
          <p className="mt-1 text-zinc-600">
            {pendentes === 0 ? "Nenhum cadastro esperando aprovação." : `${pendentes} cadastro(s) esperando aprovação.`}
          </p>
        </div>

        {error ? <p className="text-red-700">Não consegui carregar a lista agora.</p> : null}

        <ul className="space-y-3">
          {lista.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-900">{c.nome}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROTULO[c.status].cor}`}>{ROTULO[c.status].texto}</span>
                  {c.is_admin ? <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">Admin</span> : null}
                </div>
                <p className="truncate text-sm text-zinc-600">{c.email}</p>
                <p className="text-sm text-zinc-500">
                  {formatarCelular(c.celular) || "sem celular"}
                  {c.celular ? (c.celular_verificado ? " · verificado" : " · não verificado") : ""} · desde {data(c.criado_em)}
                </p>
              </div>
              {c.id !== usuarioId ? (
                <div className="flex gap-2">
                  {c.status !== "aprovado" ? <BotaoStatus usuario={c.id} status="aprovado" rotulo="Aprovar" /> : null}
                  {c.status !== "recusado" ? <BotaoStatus usuario={c.id} status="recusado" rotulo="Recusar" perigo /> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
