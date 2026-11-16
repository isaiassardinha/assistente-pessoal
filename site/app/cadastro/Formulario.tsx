"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso, Campo } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { SENHA_MINIMO } from "@/lib/validacao";
import { cadastrar } from "./acoes";

export function FormularioCadastro() {
  const [estado, acao] = useActionState(cadastrar, ESTADO_INICIAL);
  const v = estado.valores ?? {};

  return (
    <form action={acao} className="space-y-4">
      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      <Campo rotulo="Nome" name="nome" autoComplete="name" required maxLength={100} defaultValue={v.nome} />
      <Campo rotulo="E-mail" name="email" type="email" autoComplete="email" required defaultValue={v.email} />
      <Campo
        rotulo="Celular (WhatsApp)"
        name="celular"
        type="tel"
        autoComplete="tel"
        required
        placeholder="(11) 91234-5678"
        dica="É por este número que você vai falar com o assistente."
        defaultValue={v.celular}
      />
      <Campo
        rotulo="Senha"
        name="senha"
        type="password"
        autoComplete="new-password"
        required
        minLength={SENHA_MINIMO}
        dica={`Pelo menos ${SENHA_MINIMO} caracteres.`}
      />
      <Campo rotulo="Repita a senha" name="confirmacao" type="password" autoComplete="new-password" required minLength={SENHA_MINIMO} />
      <BotaoEnviar enviando="Criando conta…">Criar conta</BotaoEnviar>
      <p className="text-center text-sm text-zinc-600">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-emerald-700 hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
