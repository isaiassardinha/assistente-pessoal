"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso, Campo } from "@/components/ui";
import { confirmarCadastro2fa, iniciarCadastro2fa, type EstadoCadastro2fa } from "../acoes";

export function Cadastro2fa() {
  const [gerado, gerar] = useActionState<EstadoCadastro2fa>(iniciarCadastro2fa, {});
  const [estado, confirmar] = useActionState(confirmarCadastro2fa, {} as EstadoCadastro2fa);

  if (!gerado.fatorId) {
    return (
      <form action={gerar} className="space-y-4">
        {gerado.erro ? <Aviso tipo="erro">{gerado.erro}</Aviso> : null}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>Instale no celular um app autenticador (Google Authenticator, Microsoft Authenticator ou 1Password).</li>
          <li>Clique no botão abaixo para gerar o QR Code.</li>
        </ol>
        <BotaoEnviar enviando="Gerando…">Gerar QR Code</BotaoEnviar>
      </form>
    );
  }

  return (
    <form action={confirmar} className="space-y-4">
      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      <p className="text-sm text-zinc-700">No app autenticador, toque em “adicionar” e leia este QR Code:</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={gerado.qr} alt="QR Code para o app autenticador" className="mx-auto h-48 w-48 rounded-lg border border-zinc-200 bg-white p-2" />
      <details className="text-sm text-zinc-600">
        <summary className="cursor-pointer">Não consegue ler o QR Code?</summary>
        <p className="mt-2">Digite esta chave no app:</p>
        <code className="mt-1 block break-all rounded bg-zinc-100 p-2 text-xs">{gerado.segredo}</code>
      </details>
      <input type="hidden" name="fatorId" value={gerado.fatorId} />
      <Campo rotulo="Código que apareceu no app" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      <BotaoEnviar enviando="Conferindo…">Ativar</BotaoEnviar>
    </form>
  );
}
