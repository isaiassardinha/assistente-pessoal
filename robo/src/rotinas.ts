// Rotinas automáticas (a cada minuto): lembretes, aviso de cadastro novo
// para o administrador e boas-vindas para quem foi aprovado.

import * as banco from "./banco";
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
    setInterval(() => void rodar(), 60_000);
  }, atraso);
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
      '• "anota a tarefa: renovar o seguro do carro"\n\n' +
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
