// API interna do robô: só escuta dentro do servidor (127.0.0.1) e exige a
// senha interna (INTERNO_TOKEN). É por ela que o site mostra o QR Code e
// pede o código de verificação do celular.

import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as banco from "./banco";
import { config, configuracoesFaltando, versao } from "./config";
import { log } from "./log";
import { resultadoAutoteste } from "./autoteste";
import { buscar } from "./cerebro";
import { IaIndisponivel, responderComFontes } from "./ia";
import { gerarCodigo, hashCodigo, LimitadorPorMinuto, numeroPermitido } from "./regras";
import { acordarCerebro } from "./rotinas";
import { conectado, desconectar, enviarTexto, estadoWhatsApp, NumeroSemWhatsApp } from "./whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALIDADE_CODIGO = 10 * 60_000;
const ESPERA_REENVIO = 60_000;
const MAXIMO_TENTATIVAS = 5;

function json(res: ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(corpo));
}

function autorizado(req: IncomingMessage): boolean {
  const recebido = Buffer.from(String(req.headers["x-interno-token"] ?? ""));
  const esperado = Buffer.from(config.tokenInterno);
  return esperado.length > 0 && recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

async function lerCorpo(req: IncomingMessage): Promise<Record<string, unknown>> {
  let tamanho = 0;
  const partes: Buffer[] = [];
  for await (const parte of req) {
    tamanho += (parte as Buffer).length;
    if (tamanho > 10_000) throw new Error("corpo grande demais");
    partes.push(parte as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

async function enviarCodigo(usuarioId: string) {
  const perfil = await banco.perfilParaVerificacao(usuarioId);
  if (!perfil) return { ok: false, erro: "Cadastro não encontrado." };
  if (perfil.status !== "aprovado") return { ok: false, erro: "O celular só pode ser verificado depois que o cadastro for aprovado." };
  if (!perfil.celular) return { ok: false, erro: "Cadastre um celular primeiro." };
  if (perfil.celular_verificado) return { ok: true, jaVerificado: true };
  if (!conectado()) return { ok: false, erro: "O robô do WhatsApp está desconectado agora. Tente mais tarde." };
  if (!numeroPermitido(perfil.celular, config.numerosPermitidos)) return { ok: false, erro: "Este número não está na lista de números liberados." };

  const anterior = await banco.lerCodigo(usuarioId);
  if (anterior && Date.now() - new Date(anterior.criado_em).getTime() < ESPERA_REENVIO) {
    return { ok: false, erro: "Acabamos de enviar um código. Espere 1 minuto para pedir outro." };
  }

  const codigo = gerarCodigo();
  await banco.salvarCodigo(usuarioId, perfil.celular, hashCodigo(codigo, usuarioId), new Date(Date.now() + VALIDADE_CODIGO));
  try {
    await enviarTexto(perfil.celular, `Seu código de verificação do Assistente Pessoal é: *${codigo}*\n\nEle vale por 10 minutos. Se não foi você que pediu, ignore esta mensagem.`);
  } catch (e) {
    await banco.apagarCodigo(usuarioId);
    if (e instanceof NumeroSemWhatsApp) return { ok: false, erro: "Esse número não tem WhatsApp. Confira o celular cadastrado." };
    throw e;
  }
  return { ok: true };
}

async function confirmarCodigo(usuarioId: string, codigo: string) {
  const salvo = await banco.lerCodigo(usuarioId);
  if (!salvo) return { ok: false, erro: "Peça um código primeiro." };
  if (new Date(salvo.expira_em).getTime() < Date.now()) return { ok: false, erro: "O código venceu. Peça um novo." };
  if (salvo.tentativas >= MAXIMO_TENTATIVAS) return { ok: false, erro: "Muitas tentativas erradas. Peça um código novo." };
  if (hashCodigo(codigo, usuarioId) !== salvo.codigo_hash) {
    await banco.contarTentativaCodigo(usuarioId, salvo.tentativas + 1);
    return { ok: false, erro: "Código incorreto. Confira a mensagem no WhatsApp." };
  }
  const ok = await banco.marcarCelularVerificado(usuarioId, salvo.celular);
  await banco.apagarCodigo(usuarioId);
  if (!ok) return { ok: false, erro: "O celular do cadastro mudou ou já está verificado em outra conta. Peça um novo código." };
  return { ok: true };
}

const limitePerguntas = new LimitadorPorMinuto(10);

/** Pergunta feita na tela "Cérebro" do site. */
async function perguntar(usuarioId: string, pergunta: string) {
  const perfil = await banco.perfilParaVerificacao(usuarioId);
  if (!perfil || perfil.status !== "aprovado") return { ok: false, erro: "Cadastro não aprovado." };
  if (!limitePerguntas.permitir(usuarioId)) return { ok: false, erro: "Muitas perguntas seguidas. Espere um minuto." };
  try {
    const { trechos, fontes } = await buscar(usuarioId, pergunta, 8);
    if (trechos.length === 0) {
      return { ok: true, resposta: "Não encontrei nada sobre isso nas suas anotações e documentos.", fontes: [] };
    }
    const resposta = await responderComFontes(pergunta, trechos, perfil.nome.split(" ")[0]);
    return { ok: true, resposta: resposta || "Não consegui montar uma resposta agora.", fontes };
  } catch (e) {
    if (e instanceof IaIndisponivel) return { ok: false, erro: "A inteligência artificial está instável agora. Tente de novo em instantes." };
    throw e;
  }
}

export function iniciarApiInterna() {
  const servidor = createServer(async (req, res) => {
    try {
      const rota = `${req.method} ${(req.url ?? "").split("?")[0]}`;

      if (rota === "GET /saude") {
        const e = estadoWhatsApp();
        return json(res, 200, { ok: true, versao: versao(), whatsapp: e.situacao, faltando: configuracoesFaltando(), ia: resultadoAutoteste() });
      }
      if (!autorizado(req)) return json(res, 401, { ok: false, erro: "não autorizado" });

      if (rota === "GET /estado") {
        return json(res, 200, { ...estadoWhatsApp(), faltando: configuracoesFaltando() });
      }
      if (rota === "POST /desconectar") {
        await desconectar();
        return json(res, 200, { ok: true });
      }
      if (rota === "POST /verificacao/enviar" || rota === "POST /verificacao/confirmar") {
        const corpo = await lerCorpo(req);
        const usuarioId = String(corpo.usuarioId ?? "");
        if (!UUID.test(usuarioId)) return json(res, 400, { ok: false, erro: "pedido inválido" });
        if (rota === "POST /verificacao/enviar") return json(res, 200, await enviarCodigo(usuarioId));
        const codigo = String(corpo.codigo ?? "").replace(/\D/g, "");
        if (codigo.length !== 6) return json(res, 200, { ok: false, erro: "Digite os 6 números do código." });
        return json(res, 200, await confirmarCodigo(usuarioId, codigo));
      }
      if (rota === "POST /cerebro/acordar") {
        acordarCerebro();
        return json(res, 200, { ok: true });
      }
      if (rota === "POST /cerebro/perguntar") {
        const corpo = await lerCorpo(req);
        const usuarioId = String(corpo.usuarioId ?? "");
        const pergunta = String(corpo.pergunta ?? "").trim().slice(0, 500);
        if (!UUID.test(usuarioId) || pergunta.length < 2) return json(res, 400, { ok: false, erro: "Escreva a pergunta." });
        return json(res, 200, await perguntar(usuarioId, pergunta));
      }
      return json(res, 404, { ok: false, erro: "não encontrado" });
    } catch (e) {
      log.erro("api interna:", e);
      return json(res, 500, { ok: false, erro: "Falha no robô. Tente de novo em instantes." });
    }
  });
  servidor.listen(config.portaInterna, "127.0.0.1", () => log.info(`API interna em 127.0.0.1:${config.portaInterna}`));
}
