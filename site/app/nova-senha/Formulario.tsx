"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso, Campo } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { SENHA_MINIMO } from "@/lib/validacao";
import { definirNovaSenha } from "../esqueci-senha/acoes";

export function FormularioNovaSenha() {
  const [estado, acao] = useActionState(definirNovaSenha, ESTADO_INICIAL);
  return (
    <form action={acao} className="space-y-4">
      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      <Campo
        rotulo="Nova senha"
        name="senha"
        type="password"
        autoComplete="new-password"
        required
        minLength={SENHA_MINIMO}
        dica={`Pelo menos ${SENHA_MINIMO} caracteres.`}
      />
      <Campo rotulo="Repita a nova senha" name="confirmacao" type="password" autoComplete="new-password" required minLength={SENHA_MINIMO} />
      <BotaoEnviar enviando="Salvando…">Salvar nova senha</BotaoEnviar>
    </form>
  );
}
