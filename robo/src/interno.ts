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
import { emailValido, senhaDeAppValida } from "./email";
import { redirectUriValido } from "./googleAgenda";
import { compromissosDe, conectarAgenda, conectarGmail, conectarGoogleAgenda, ConexaoInvalida } from "./pessoal";
import { acordarCerebro } from "./rotinas";
import { apagarDocumentos, apagarEspaco, ArquivoIndisponivel, baixarDocumento, buscarNoEspaco, conectarDriveEspaco } from "./espacos";
import { situacaoPassagens } from "./passagens";
import { ffmpegDisponivel } from "./voz";
import { comUso } from "./uso";
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
        return json(res, 200, {
          ok: true,
          versao: versao(),
          whatsapp: e.situacao,
          faltando: configuracoesFaltando(),
          ia: resultadoAutoteste(),
          passagens: await situacaoPassagens(),
          voz: ffmpegDisponivel() ? "ok" : "falta o ffmpeg no servidor",
        });
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
        return json(res, 200, await comUso(usuarioId, () => perguntar(usuarioId, pergunta)));
      }
      if (rota === "POST /conexoes/gmail" || rota === "POST /conexoes/agenda" || rota === "POST /conexoes/google") {
        const corpo = await lerCorpo(req);
        const usuarioId = String(corpo.usuarioId ?? "");
        if (!UUID.test(usuarioId)) return json(res, 400, { ok: false, erro: "pedido inválido" });
        const perfil = await banco.perfilParaVerificacao(usuarioId);
        if (!perfil || perfil.status !== "aprovado") return json(res, 403, { ok: false, erro: "Cadastro não aprovado." });
        if (!config.chaveConexoes) return json(res, 503, { ok: false, erro: "O servidor ainda não está pronto para conexões. Tente em alguns minutos." });
        try {
          if (rota === "POST /conexoes/gmail") {
            const email = String(corpo.email ?? "").trim();
            const senha = String(corpo.senha ?? "");
            if (!emailValido(email)) return json(res, 400, { ok: false, erro: "Digite o seu endereço do Gmail completo." });
            if (!senhaDeAppValida(senha)) return json(res, 400, { ok: false, erro: "A senha de app tem 16 letras (o Google mostra em 4 blocos). Não é a senha normal da conta." });
            await conectarGmail(usuarioId, email, senha);
          } else if (rota === "POST /conexoes/google") {
            const codigo = String(corpo.codigo ?? "");
            const redirectUri = String(corpo.redirectUri ?? "");
            if (!config.googleClientId || !config.googleClientSecret) return json(res, 503, { ok: false, erro: "O login do Google ainda não foi configurado no servidor." });
            if (codigo.length < 10 || codigo.length > 2000 || !redirectUriValido(redirectUri)) return json(res, 400, { ok: false, erro: "pedido inválido" });
            await conectarGoogleAgenda(usuarioId, codigo, redirectUri);
          } else {
            await conectarAgenda(usuarioId, String(corpo.url ?? "").trim());
          }
          return json(res, 200, { ok: true });
        } catch (e) {
          if (e instanceof ConexaoInvalida) return json(res, 200, { ok: false, erro: e.message });
          throw e;
        }
      }
      if (rota.startsWith("POST /espacos/") || rota === "GET /espacos/arquivo") {
        return await rotaDeEspaco(rota, req, res);
      }
      if (rota === "GET /agenda") {
        const p = new URL(req.url ?? "/", "http://x").searchParams;
        const usuarioId = p.get("usuarioId") ?? "";
        const de = p.get("de") ?? "";
        const ate = p.get("ate") ?? de;
        if (!UUID.test(usuarioId) || !/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
          return json(res, 400, { ok: false, erro: "pedido inválido" });
        }
        const lista = await compromissosDe(usuarioId, de, ate);
        return json(res, 200, {
          ok: true,
          conectada: lista !== null,
          compromissos: (lista ?? []).map((c) => ({
            titulo: c.titulo,
            inicio: c.inicio.toISOString(),
            fim: c.fim.toISOString(),
            diaInteiro: c.diaInteiro,
            dia: c.dia,
            local: c.local,
          })),
        });
      }
      return json(res, 404, { ok: false, erro: "não encontrado" });
    } catch (e) {
      log.erro("api interna:", e);
      return json(res, 500, { ok: false, erro: "Falha no robô. Tente de novo em instantes." });
    }
  });
  servidor.listen(config.portaInterna, "127.0.0.1", () => log.info(`API interna em 127.0.0.1:${config.portaInterna}`));
}

// ------------------------------------------------------------- espaços
// O site manda quem está logado (usuarioId) e o espaço; o robô confere se a
// pessoa é membro (ou admin, quando precisa) antes de qualquer coisa.

async function rotaDeEspaco(rota: string, req: IncomingMessage, res: ServerResponse) {
  const corpo = rota.startsWith("GET ") ? Object.fromEntries(new URL(req.url ?? "/", "http://x").searchParams) : await lerCorpo(req);
  const usuarioId = String(corpo.usuarioId ?? "");
  const espacoId = String(corpo.espacoId ?? "");
  if (!UUID.test(usuarioId) || !UUID.test(espacoId)) return json(res, 400, { ok: false, erro: "pedido inválido" });
  const perfil = await banco.perfilParaVerificacao(usuarioId);
  if (!perfil || perfil.status !== "aprovado") return json(res, 403, { ok: false, erro: "Cadastro não aprovado." });
  const [espaco, papel] = await Promise.all([banco.espacoPorId(espacoId), banco.papelNoEspaco(espacoId, usuarioId)]);
  if (!espaco || !papel) return json(res, 404, { ok: false, erro: "Espaço não encontrado." });

  if (rota === "POST /espacos/perguntar") {
    const pergunta = String(corpo.pergunta ?? "").trim().slice(0, 500);
    if (pergunta.length < 2) return json(res, 400, { ok: false, erro: "Escreva a pergunta." });
    if (!limitePerguntas.permitir(usuarioId)) return json(res, 200, { ok: false, erro: "Muitas perguntas seguidas. Espere um minuto." });
    try {
      const resposta = await comUso(usuarioId, async () => {
        const trechos = await buscarNoEspaco(espaco.id, pergunta, 10);
        if (trechos.length === 0) return `Não encontrei nada sobre isso na memória do espaço "${espaco.nome}".`;
        return responderComFontes(pergunta, trechos, `o grupo "${espaco.nome}"`);
      });
      return json(res, 200, { ok: true, resposta: resposta || "Não consegui montar uma resposta agora." });
    } catch (e) {
      if (e instanceof IaIndisponivel) return json(res, 200, { ok: false, erro: "A inteligência artificial está instável agora. Tente de novo em instantes." });
      throw e;
    }
  }

  const documentoId = String(corpo.documentoId ?? "");
  if (rota === "GET /espacos/arquivo" || rota === "POST /espacos/apagar-documento" || rota === "POST /espacos/reler-documento") {
    if (!UUID.test(documentoId)) return json(res, 400, { ok: false, erro: "pedido inválido" });
    const [doc] = await banco.documentosEspacoPorIds(espaco.id, [documentoId]);
    if (!doc) return json(res, 404, { ok: false, erro: "Documento não encontrado." });

    if (rota === "GET /espacos/arquivo") {
      try {
        const dados = await baixarDocumento(espaco, doc);
        res.writeHead(200, {
          "Content-Type": doc.tipo_mime ?? "application/octet-stream",
          "Content-Length": dados.length,
          "X-Nome-Arquivo": encodeURIComponent(doc.nome_arquivo),
          "Cache-Control": "no-store",
        });
        return res.end(dados);
      } catch (e) {
        if (e instanceof ArquivoIndisponivel) return json(res, 410, { ok: false, erro: e.message });
        throw e;
      }
    }
    if (rota === "POST /espacos/reler-documento") {
      const ok = await banco.relerDocumentoEspaco(espaco.id, doc.id);
      if (ok) acordarCerebro();
      return json(res, 200, { ok });
    }
    if (papel !== "admin" && doc.enviado_por !== usuarioId) {
      return json(res, 403, { ok: false, erro: "Só quem mandou o documento ou um administrador do espaço pode apagar." });
    }
    await apagarDocumentos(espaco, [doc.id]);
    return json(res, 200, { ok: true });
  }

  // daqui para baixo: só administrador
  if (papel !== "admin") return json(res, 403, { ok: false, erro: "Só administradores do espaço podem fazer isso." });

  if (rota === "POST /espacos/drive") {
    const codigo = String(corpo.codigo ?? "");
    const redirectUri = String(corpo.redirectUri ?? "");
    if (!config.chaveConexoes) return json(res, 503, { ok: false, erro: "O servidor ainda não está pronto para conexões. Tente em alguns minutos." });
    if (!config.googleClientId || !config.googleClientSecret) return json(res, 503, { ok: false, erro: "O login do Google ainda não foi configurado no servidor." });
    if (codigo.length < 10 || codigo.length > 2000 || !redirectUriValido(redirectUri)) return json(res, 400, { ok: false, erro: "pedido inválido" });
    try {
      await conectarDriveEspaco(espaco, codigo, redirectUri);
      return json(res, 200, { ok: true });
    } catch (e) {
      if (e instanceof ConexaoInvalida) return json(res, 200, { ok: false, erro: e.message });
      throw e;
    }
  }
  if (rota === "POST /espacos/apagar") {
    await apagarEspaco(espaco);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { ok: false, erro: "não encontrado" });
}
