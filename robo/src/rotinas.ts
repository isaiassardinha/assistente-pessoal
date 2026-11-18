// Rotinas automáticas (a cada minuto): lembretes, aviso de cadastro novo
// para o administrador e boas-vindas para quem foi aprovado.

import * as banco from "./banco";
import { indexarAnotacoes, processarDocumento } from "./cerebro";
import { IaIndisponivel } from "./ia";
import { config, configuracoesFaltando } from "./config";
import { log } from "./log";
import { numeroPermitido } from "./regras";
import { conectado, enviarTexto, NumeroSemWhatsApp } from "./whatsapp";

let rodando = false;
let ultimaLimpeza = 0;

export function iniciarRotinas() {
  // alinha com o começo de cada minuto
  const atraso = 60_000 - (Date.now() % 60_000) + 1000;
  setTimeout(() => {
    void rodar();
    void cuidarDoCerebro();
    setInterval(() => {
      void rodar();
      void cuidarDoCerebro();
    }, 60_000);
  }, atraso);
}

// ------------------------------------------------------------ cérebro
// Separado das outras rotinas: ler um documento grande pode demorar e não
// pode atrasar lembretes. Não depende do WhatsApp estar conectado.

let cerebroOcupado = false;
let chamarDeNovo = false;

/** Pede para olhar a fila agora (ex.: o site acabou de receber um arquivo). */
export function acordarCerebro() {
  void cuidarDoCerebro();
}

async function cuidarDoCerebro() {
  if (configuracoesFaltando().length > 0) return;
  if (cerebroOcupado) {
    chamarDeNovo = true;
    return;
  }
  cerebroOcupado = true;
  try {
    do {
      chamarDeNovo = false;
      await indexarAnotacoes();
      const fila = await banco.documentosParaProcessar(3);
      for (const item of fila) {
        const r = await processarDocumento(item);
        if (r && r.doc.origem === "whatsapp" && (r.ok || r.definitivo)) await avisarLeitura(item.usuario_id, r);
      }
      if (fila.length === 3) chamarDeNovo = true; // ainda pode ter mais
    } while (chamarDeNovo);
  } catch (e) {
    if (e instanceof IaIndisponivel) log.aviso("cérebro: IA indisponível, tento no próximo minuto");
    else log.erro("cérebro:", e);
  } finally {
    cerebroOcupado = false;
  }
}

/** Para arquivos mandados pelo WhatsApp: avisa quando terminou de ler. */
async function avisarLeitura(usuarioId: string, r: { doc: banco.Documento; ok: boolean; resumo?: string; erro?: string }) {
  if (!conectado()) return;
  const perfil = await banco.perfilParaVerificacao(usuarioId);
  if (!perfil?.celular || !perfil.celular_verificado || !numeroPermitido(perfil.celular, config.numerosPermitidos)) return;
  const texto = r.ok
    ? `📄 Pronto, li "${r.doc.nome_arquivo}".${r.resumo ? `\n${r.resumo}` : ""}\n\nPode me perguntar qualquer coisa sobre ele.`
    : `Não consegui ler "${r.doc.nome_arquivo}". ${r.erro ?? ""}`.trim();
  try {
    await enviarTexto(perfil.celular, texto);
  } catch (e) {
    log.aviso("aviso de leitura não enviado:", e);
  }
}

async function rodar() {
  if (rodando || !conectado() || configuracoesFaltando().length > 0) return;
  rodando = true;
  try {
    await enviarLembretes();
    await avisarCadastrosNovos();
    await darBoasVindas();
    if (Date.now() - ultimaLimpeza > 3_600_000) {
      ultimaLimpeza = Date.now();
      await banco.limparRegistrosAntigos();
    }
  } catch (e) {
    log.erro("rotina:", (e as Error).message);
  } finally {
    rodando = false;
  }
}

/** Cada lembrete é "reservado" no banco antes de enviar; só vira "enviado"
 *  depois que o WhatsApp aceitou. Se falhar, volta para a fila. */
async function enviarLembretes() {
  const lembretes = await banco.reservarLembretes(20);
  for (const l of lembretes) {
    if (!conectado()) {
      await banco.registrarFalhaLembrete(l.id, "WhatsApp desconectado");
      continue;
    }
    if (!numeroPermitido(l.celular, config.numerosPermitidos)) {
      await banco.registrarFalhaLembrete(l.id, "número fora da lista de números liberados");
      continue;
    }
    try {
      await enviarTexto(l.celular, `⏰ Lembrete: ${l.texto}`);
      await banco.confirmarEnvioLembrete(l.id);
    } catch (e) {
      const motivo = e instanceof NumeroSemWhatsApp ? "número sem WhatsApp" : (e as Error).message;
      log.aviso("lembrete não enviado:", motivo);
      await banco.registrarFalhaLembrete(l.id, motivo);
    }
  }
}

async function avisarCadastrosNovos() {
  const novos = await banco.cadastrosParaAvisar();
  if (novos.length === 0) return;
  const admins = (await banco.administradores()).filter((a) => numeroPermitido(a.celular, config.numerosPermitidos));
  if (admins.length === 0) return; // sem admin com celular verificado: tenta de novo depois
  for (const c of novos) {
    const texto =
      `Novo cadastro esperando aprovação:\n${c.nome} (${c.email})` +
      (config.siteUrl ? `\n\nAprove ou recuse em ${config.siteUrl}/admin` : "");
    let avisou = false;
    for (const a of admins) {
      try {
        await enviarTexto(a.celular, texto);
        avisou = true;
      } catch (e) {
        log.aviso("aviso ao admin falhou:", (e as Error).message);
      }
    }
    if (avisou) await banco.marcarAvisoAdmin(c.id);
  }
}

async function darBoasVindas() {
  for (const u of await banco.paraBoasVindas()) {
    if (!numeroPermitido(u.celular, config.numerosPermitidos)) continue;
    const nome = u.nome.split(" ")[0];
    const texto =
      `Olá, ${nome}! Eu sou ${u.nome_assistente}, seu assistente pessoal. 👋\n\n` +
      "Pode falar comigo por texto ou áudio, do seu jeito. Alguns exemplos:\n" +
      '• "gastei 50 no mercado, categoria mercado"\n' +
      '• "quanto gastei este mês?"\n' +
      '• "me lembra amanhã às 9h de pagar a luz"\n' +
      '• "anota a tarefa: renovar o seguro do carro"\n' +
      '• "guarda isso: a placa do carro é ABC1D23"\n' +
      "• mande um PDF ou foto de documento e depois pergunte sobre ele\n\n" +
      (config.siteUrl ? `Tudo também fica organizado no site: ${config.siteUrl}` : "");
    try {
      await enviarTexto(u.celular, texto);
      await banco.marcarBoasVindas(u.id);
    } catch (e) {
      log.aviso("boas-vindas não enviadas:", (e as Error).message);
      if (e instanceof NumeroSemWhatsApp) await banco.marcarBoasVindas(u.id); // não insiste
    }
  }
}
