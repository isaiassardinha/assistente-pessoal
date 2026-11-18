import type { Metadata } from "next";
import Link from "next/link";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Aviso, Campo, Secao } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { formatarCelular } from "@/lib/validacao";
import { salvarDados } from "./acoes";
import { Verificacao } from "./Verificacao";

export const metadata: Metadata = { title: "Minha conta" };

export default async function MinhaConta() {
  const { perfil } = await exigirAprovado();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Minha conta</h1>

      <Secao
        titulo="Celular (WhatsApp)"
        descricao={
          <>
            Número cadastrado: <strong>{formatarCelular(perfil.celular) || "nenhum"}</strong>
          </>
        }
      >
        {perfil.celular_verificado ? (
          <Aviso tipo="sucesso">Verificado. O assistente conversa com você por este número.</Aviso>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">
              Para o assistente atender este número, confirme que ele é seu: enviamos um código de 6 números no WhatsApp.
            </p>
            <Verificacao />
          </div>
        )}
      </Secao>

      <Secao titulo="Meus dados">
        <FormularioAcao acao={salvarDados} rotulo="Salvar">
          <Campo rotulo="Nome" name="nome" maxLength={100} required defaultValue={perfil.nome} />
          <Campo
            rotulo="Celular (WhatsApp)"
            name="celular"
            type="tel"
            required
            defaultValue={formatarCelular(perfil.celular)}
            dica="Se trocar o número, vai precisar verificar de novo."
          />
          <Campo
            rotulo="Nome do assistente"
            name="nome_assistente"
            maxLength={30}
            required
            defaultValue={perfil.nome_assistente}
            dica="Como ele se apresenta. Só letras, sem espaço (ex.: Júnior)."
          />
        </FormularioAcao>
      </Secao>

      <Secao titulo="Senha">
        <Link href="/nova-senha" className="text-sm font-medium text-emerald-700 hover:underline">
          Trocar minha senha →
        </Link>
      </Secao>
    </div>
  );
}
