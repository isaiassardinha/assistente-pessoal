"use client";

import { useEffect, useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso } from "@/components/ui";
import type { EstadoRobo } from "@/lib/robo";
import { formatarCelular } from "@/lib/validacao";
import { desconectarWhatsApp } from "./acoes";

/** Mostra o estado do robô e o QR Code, atualizando a cada 3 segundos. */
export function Conexao({ inicial }: { inicial: EstadoRobo }) {
  const [estado, setEstado] = useState(inicial);

  useEffect(() => {
    let ativo = true;
    const atualizar = async () => {
      try {
        const r = await fetch("/admin/whatsapp/estado", { cache: "no-store" });
        if (r.ok && ativo) setEstado(await r.json());
      } catch {
        // tenta de novo no próximo ciclo
      }
    };
    const timer = setInterval(atualizar, 3000);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, []);

  if (estado.situacao === "fora_do_ar") {
    return <Aviso tipo="erro">O robô está fora do ar. Se continuar assim, veja o guia do servidor (docs/servidor.md).</Aviso>;
  }

  if (estado.faltando.length > 0) {
    return (
      <Aviso tipo="info">
        Faltam configurações no servidor: <strong>{estado.faltando.join(", ")}</strong>. No Console web da Hostinger, rode{" "}
        <code>assistente-configurar</code>.
      </Aviso>
    );
  }

  if (estado.situacao === "conectado") {
    return (
      <div className="space-y-4">
        <Aviso tipo="sucesso">
          Conectado ao número <strong>{formatarCelular(estado.numero)}</strong>.
        </Aviso>
        <form action={desconectarWhatsApp}>
          <BotaoEnviar variante="perigo" enviando="Desconectando…">
            Desconectar este número
          </BotaoEnviar>
        </form>
        <p className="text-xs text-zinc-500">Desconectar só se for trocar o chip do robô. Um QR Code novo vai aparecer aqui.</p>
      </div>
    );
  }

  if (estado.situacao === "aguardando_qr" && estado.qr) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>No celular do robô, abra o WhatsApp (Business).</li>
          <li>
            Toque em <strong>⋮ (ou Configurações) → Dispositivos conectados → Conectar dispositivo</strong>.
          </li>
          <li>Aponte a câmera para o QR Code abaixo. Ele muda sozinho a cada pouco; tudo bem.</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={estado.qr} alt="QR Code para conectar o WhatsApp" className="mx-auto h-64 w-64 rounded-lg border border-zinc-200 bg-white p-2" />
      </div>
    );
  }

  return <Aviso tipo="info">Conectando ao WhatsApp… aguarde alguns segundos.</Aviso>;
}
