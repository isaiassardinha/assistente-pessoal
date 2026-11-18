// Rotinas automáticas (a cada minuto): lembretes, aviso de cadastro novo
// para o administrador e boas-vindas para quem foi aprovado.

import { hojeISO, instanteParaLocal } from "@/lib/datas";
import { montarAvisoContas } from "./avisoContas";
import * as banco from "./banco";
import { indexarAnotacoes, processarDocumento } from "./cerebro";
import { IaIndisponivel } from "./ia";
import { config, configuracoesFaltando } from "./config";
import { log } from "./log";
import { avisarCompromissos, cuidarDosEmails, enviarResumosDaManha } from "./pessoal";
import { numeroPermitido } from "./regras";
import { conectado, enviarTexto, NumeroSemWhatsApp } from "./whatsapp";

let rodando = false;
let ultimaLimpeza = 0;

export function iniciarRotinas() {
  // alinha com o começo de cada minuto
  const atraso = 60_000 - (Date.now() % 60_000) + 1000;
  setTimeout(() => {
    let volta = 0;
    void rodar();
    void cuidarDoCerebro();
    void lerEmails();
    setInterval(() => {
      void rodar();
      void cuidarDoCerebro();
      if (++volta % 2 === 0) void lerEmails(); // e-mail: a cada 2 minutos
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
    : `Não consegui ler o conteúdo de "${r.doc.nome_arquivo}", mas o arquivo ficou guardado: você pode baixar no site ou me pedir aqui. Se quiser, diga "tenta ler de novo".`;
  try {
    await enviarTexto(perfil.celular, texto);
  } catch (e) {
    log.aviso("aviso de leitura não enviado:", e);
  }
}

/** E-mail não depende do WhatsApp (os avisos esperam ele voltar). */
async function lerEmails() {
  if (configuracoesFaltando().length > 0 || !config.chaveConexoes) return;
  await cuidarDosEmails().catch((e) => log.erro("e-mail:", e));
}

async function rodar() {
  if (rodando || !conectado() || configuracoesFaltando().length > 0) return;
  rodando = true;
  try {
    await enviarLembretes();
    await avisarCadastrosNovos();
    await darBoasVindas();
    await cuidarDasContas();
    if (config.chaveConexoes) {
      await enviarResumosDaManha();
      await avisarCompromissos();
    }
    if (Date.now() - ultimaLimpeza > 3_600_000) {
      ultimaLimpeza = Date.now();
      await banco.limparRegistrosAntigos();
      await banco.limparEmailsEAvisosAntigos();
    }
  } catch (e) {
    log.erro("rotina:", e);
  } finally {
    rodando = false;
  }
}

// ------------------------------------------------------------ contas a pagar

let contasGeradasEm = "";
let ultimaOlhadaContas = 0;

/** Uma vez por dia cria as contas do mês (contas fixas); a cada 5 minutos,
 *  entre a hora escolhida pela pessoa e as 21h, manda os avisos do dia. */
async function cuidarDasContas() {
  const hoje = hojeISO();
  if (contasGeradasEm !== hoje) {
    const n = await banco.gerarContasDoMes(hoje);
    contasGeradasEm = hoje;
    if (n > 0) log.info(`contas do mês criadas: ${n}`);
  }
  if (Date.now() - ultimaOlhadaContas < 5 * 60_000) return;
  ultimaOlhadaContas = Date.now();
  const hora = Number(instanteParaLocal(new Date().toISOString()).slice(11, 13));
  if (hora < 6 || hora >= 21) return;

  const lista = await banco.contasParaAvisar(hoje, hora);
  const porPessoa = new Map<string, banco.ContaParaAvisar[]>();
  for (const c of lista) porPessoa.set(c.usuario_id, [...(porPessoa.get(c.usuario_id) ?? []), c]);

  for (const contas of porPessoa.values()) {
    const celular = contas[0].celular;
    if (!numeroPermitido(celular, config.numerosPermitidos)) continue;
    try {
      await enviarTexto(celular, montarAvisoContas(contas, hoje));
      await banco.marcarContasAvisadas(
        contas.map((c) => c.conta_id),
        hoje,
      );
    } catch (e) {
      log.aviso("aviso de contas não enviado:", e);
    }
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
