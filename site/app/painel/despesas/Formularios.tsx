"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso, Campo, Selecao } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { criarDespesa } from "./acoes";

type Opcao = { valor: string; rotulo: string };

export function FormularioNovaDespesa({ categorias, hoje }: { categorias: Opcao[]; hoje: string }) {
  const [estado, acao] = useActionState(criarDespesa, ESTADO_INICIAL);
  const v = estado.valores ?? {};
  return (
    <form action={acao} className="space-y-3">
      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      {estado.sucesso ? <Aviso tipo="sucesso">{estado.sucesso}</Aviso> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Valor (R$)" name="valor" inputMode="decimal" placeholder="50,00" required defaultValue={v.valor} />
        <Selecao rotulo="Categoria" name="categoria" opcoes={categorias} vazia="Escolha…" required defaultValue={v.categoria ?? ""} />
        <Campo rotulo="Descrição" name="descricao" maxLength={200} placeholder="Ex.: mercado do mês" defaultValue={v.descricao} />
        <Campo rotulo="Data" name="data" type="date" required defaultValue={v.data || hoje} max="2100-12-31" />
      </div>
      <BotaoEnviar enviando="Lançando…">Lançar despesa</BotaoEnviar>
    </form>
  );
}
