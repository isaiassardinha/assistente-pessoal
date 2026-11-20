import type { Metadata } from "next";
import Link from "next/link";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Campo, Secao } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { criarEspaco } from "./acoes";

export const metadata: Metadata = { title: "Espaços" };

export default async function Espacos() {
  const { supabase, usuarioId } = await exigirAprovado();
  const [{ data: espacos }, { data: papeis }] = await Promise.all([
    supabase.from("espacos").select("id, nome, grupo_nome, grupo_jid, drive_conta, criado_em").order("criado_em", { ascending: false }),
    supabase.from("espaco_membros").select("espaco_id, papel").eq("usuario_id", usuarioId),
  ]);
  const papel = new Map((papeis ?? []).map((p) => [p.espaco_id, p.papel]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Espaços</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Um espaço é a memória compartilhada de um grupo do WhatsApp. O assistente guarda o que os membros mandam no grupo (mensagens,
          áudios, documentos e fotos) e responde quando alguém o marca com @. Nada do espaço aparece no seu Cérebro pessoal, e nada pessoal
          aparece no espaço.
        </p>
      </div>

      <Secao titulo={`Seus espaços (${espacos?.length ?? 0})`}>
        <ul className="divide-y divide-zinc-200">
          {(espacos ?? []).length === 0 ? <li className="py-3 text-sm text-zinc-500">Você ainda não participa de nenhum espaço.</li> : null}
          {(espacos ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <Link href={`/painel/espacos/${e.id}`} className="font-medium text-zinc-900 hover:underline">
                  {e.nome}
                </Link>
                <p className="text-xs text-zinc-500">
                  {papel.get(e.id) === "admin" ? "Você é administrador" : "Você é membro"} ·{" "}
                  {e.grupo_jid ? `ligado ao grupo ${e.grupo_nome ? `"${e.grupo_nome}"` : "do WhatsApp"}` : "ainda sem grupo ligado"}
                  {e.drive_conta ? " · arquivos no Google Drive" : ""}
                </p>
              </div>
              <Link href={`/painel/espacos/${e.id}`} className="text-sm font-medium text-emerald-700 hover:underline">
                Abrir
              </Link>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao titulo="Criar um espaço" descricao="Você vira administrador: liga o grupo, convida as pessoas e escolhe onde ficam os arquivos.">
        <FormularioAcao acao={criarEspaco} rotulo="Criar espaço" enviando="Criando…">
          <Campo rotulo="Nome do espaço" name="nome" maxLength={60} required placeholder="Ex.: Obra da casa, Família, Sócios" />
        </FormularioAcao>
      </Secao>
    </div>
  );
}
