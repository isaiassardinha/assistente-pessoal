// E-mail e agenda pessoais: leitura periódica, avisos e resumo da manhã.

import { hojeISO, instanteParaLocal } from "@/lib/datas";
import { baixarIcs, compromissosDoIcs, descreverCompromisso, horaLocal, type Compromisso } from "./agenda";
import * as banco from "./banco";
import { cifrar, decifrar } from "./cofre";
import { config } from "./config";
import { AcessoNegado, aplicarRegras, buscarNovos, emSilencio, testarGmail, type EmailBruto, type EstadoCaixa } from "./email";
import { classificarEmails } from "./ia";
import { log } from "./log";
import { numeroPermitido } from "./regras";
import { comUso } from "./uso";
import { conectado, enviarTexto } from "./whatsapp";

function horaAgora(): number {
  return Number(instanteParaLocal(new Date().toISOString()).slice(11, 13));
}

async function avisar(usuarioId: string, texto: string): Promise<boolean> {
  if (!conectado()) return false;
  const p = await banco.preferencias(usuarioId);
  if (!p?.celular || !p.celular_verificado || p.status !== "aprovado" || !numeroPermitido(p.celular, config.numerosPermitidos)) return false;
  await enviarTexto(p.celular, texto);
  return true;
}

// ================================================================ conectar

export class ConexaoInvalida extends Error {}

/** Testa e grava (criptografado) o Gmail da pessoa. */
export async function conectarGmail(usuarioId: string, email: string, senha: string) {
  try {
    await testarGmail(email, senha);
  } catch (e) {
    if (e instanceof AcessoNegado) {
      throw new ConexaoInvalida("O Google recusou. Confira o e-mail e a senha de app (16 letras) e se a verificação em duas etapas está ligada.");
    }
    log.aviso("teste do Gmail:", e);
    throw new ConexaoInvalida("Não consegui falar com o Gmail agora. Tente de novo em instantes.");
  }
  const c = await banco.salvarConexao(usuarioId, "gmail", email.trim().toLowerCase(), cifrar(JSON.stringify({ email: email.trim(), senha })));
  void lerGmail(c).catch((e) => log.aviso("primeira leitura do Gmail:", e));
}

/** Testa e grava (criptografado) o link secreto da agenda. */
export async function conectarAgenda(usuarioId: string, url: string) {
  let ics: string;
  try {
    ics = await baixarIcs(url);
    compromissosDoIcs(ics, new Date(), new Date(Date.now() + 86_400_000));
  } catch (e) {
    log.aviso("teste da agenda:", e);
    throw new ConexaoInvalida("Não consegui ler a agenda por esse link. Confira se copiou o \"endereço secreto no formato iCal\" inteiro.");
  }
  await banco.salvarConexao(usuarioId, "agenda_ics", "Google Agenda", cifrar(url));
  cacheAgenda.delete(usuarioId);
}

// ================================================================ e-mail

const MAX_FALHAS = 15; // ~30 minutos tentando antes de mostrar erro

async function lerGmail(c: banco.Conexao) {
  return comUso(c.usuario_id, async () => {
    let credenciais: { email: string; senha: string };
    try {
      credenciais = JSON.parse(decifrar(c.segredo_cifrado));
    } catch {
      await banco.atualizarConexao(c.usuario_id, c.id, { situacao: "erro", erro: "Conexão corrompida. Conecte o e-mail de novo." });
      return;
    }
    const estado = c.estado as EstadoCaixa;
    let resultado;
    try {
      resultado = await buscarNovos(credenciais.email, credenciais.senha, estado);
    } catch (e) {
      if (e instanceof AcessoNegado) {
        await banco.atualizarConexao(c.usuario_id, c.id, {
          situacao: "erro",
          erro: "O Google recusou a senha de app (ela pode ter sido apagada). Gere outra e conecte de novo.",
        });
        if (!c.erro_avisado && (await avisar(c.usuario_id, "⚠️ Parei de conseguir ler seu e-mail: o Google recusou a senha de app. Gere outra e conecte de novo em Minha conta → Conexões.").catch(() => false))) {
          await banco.atualizarConexao(c.usuario_id, c.id, { erro_avisado: true });
        }
        return;
      }
      const falhas = (estado.falhas ?? 0) + 1;
      await banco.atualizarConexao(c.usuario_id, c.id, {
        estado: { ...estado, falhas },
        ...(falhas >= MAX_FALHAS ? { situacao: "erro" as const, erro: "Não consigo falar com o Gmail há um tempo. Continuo tentando." } : {}),
      });
      log.aviso("leitura do Gmail:", e);
      return;
    }

    const novos = await classificarEGravar(c, resultado.emails, resultado.primeiraVez);
    await banco.atualizarConexao(c.usuario_id, c.id, {
      estado: resultado.estado as Record<string, unknown>,
      situacao: "ok",
      erro: null,
      erro_avisado: false,
      ultima_leitura: new Date().toISOString(),
    });
    if (!resultado.primeiraVez) await avisarUrgentes(c.usuario_id, novos.filter((e) => e.importancia === "urgente"));
  });
}

async function classificarEGravar(c: banco.Conexao, brutos: EmailBruto[], primeiraVez: boolean) {
  if (brutos.length === 0) return [];
  const regras = await banco.regrasEmail(c.usuario_id);
  const pref = await banco.preferencias(c.usuario_id);
  const nome = pref?.nome.split(" ")[0] ?? "a pessoa";

  const comRegra = brutos.map((b) => ({ b, regra: aplicarRegras(regras, b) }));
  const paraIa = comRegra.filter((x) => x.regra !== "ignorar");
  const notas = new Map<EmailBruto, { importancia: banco.EmailGuardado["importancia"]; resumo: string; motivo: string }>();
  for (let i = 0; i < paraIa.length; i += 10) {
    const lote = paraIa.slice(i, i + 10);
    const r = await classificarEmails(
      nome,
      lote.map(({ b, regra }) => ({
        remetente: b.remetenteNome ? `${b.remetenteNome} <${b.remetenteEmail}>` : b.remetenteEmail,
        assunto: b.assunto,
        texto: b.texto,
        automatico: b.automatico,
        sempreImportante: regra === "importante",
      })),
    );
    lote.forEach(({ b, regra }, k) =>
      notas.set(b, regra === "importante" ? { ...r[k], importancia: "urgente", motivo: "remetente que você pediu para sempre avisar" } : r[k]),
    );
  }

  const linhas: banco.EmailNovo[] = comRegra.map(({ b, regra }) => {
    const nota = regra === "ignorar" ? { importancia: "ignorar" as const, resumo: "", motivo: "regra sua: ignorar" } : notas.get(b)!;
    return {
      message_id: b.messageId,
      recebido_em: b.recebidoEm.toISOString(),
      remetente_nome: b.remetenteNome || null,
      remetente_email: b.remetenteEmail || null,
      assunto: b.assunto,
      resumo: nota.resumo || null,
      importancia: nota.importancia,
      motivo: nota.motivo || null,
      // na primeira leitura não dispara aviso dos e-mails das últimas 24h
      avisado_em: primeiraVez ? new Date().toISOString() : null,
    };
  });
  return banco.gravarEmails(c.usuario_id, c.id, linhas);
}

function linhaEmail(e: banco.EmailGuardado): string {
  const de = e.remetente_nome || e.remetente_email || "?";
  return `• *${de}*: ${e.resumo || e.assunto || ""}`;
}

/** Urgentes: avisa na hora, fora do horário de silêncio. */
async function avisarUrgentes(usuarioId: string, urgentes: banco.EmailGuardado[]) {
  if (urgentes.length === 0) return;
  const p = await banco.preferencias(usuarioId);
  if (!p || emSilencio(horaAgora(), p.silencio_inicio, p.silencio_fim)) return; // fica para depois do silêncio
  const texto = `📧 *E-mail${urgentes.length > 1 ? "s" : ""} que pede${urgentes.length > 1 ? "m" : ""} atenção:*\n${urgentes.map(linhaEmail).join("\n")}`;
  if (await avisar(usuarioId, texto)) await banco.marcarEmailsAvisados(usuarioId, urgentes.map((e) => e.id));
}

/** Depois do silêncio: manda os urgentes que ficaram guardados (se o resumo da manhã não levou). */
async function avisarUrgentesGuardados(usuarioId: string) {
  const p = await banco.preferencias(usuarioId);
  if (!p || emSilencio(horaAgora(), p.silencio_inicio, p.silencio_fim)) return;
  const pendentes = await banco.urgentesPendentes(usuarioId, new Date(Date.now() - 24 * 3_600_000).toISOString());
  if (pendentes.length) await avisarUrgentes(usuarioId, pendentes);
}

let lendoEmails = false;

/** A cada 2 minutos: lê os Gmails conectados. */
export async function cuidarDosEmails() {
  if (lendoEmails) return;
  lendoEmails = true;
  try {
    for (const c of await banco.conexoesAtivas("gmail")) {
      if (c.situacao === "erro" && c.erro_avisado) continue; // senha recusada: espera reconectar
      try {
        await lerGmail(c);
        await avisarUrgentesGuardados(c.usuario_id);
      } catch (e) {
        log.erro("e-mail:", e);
      }
    }
  } finally {
    lendoEmails = false;
  }
}

// ================================================================ agenda

const cacheAgenda = new Map<string, { em: number; compromissos: Compromisso[] }>();
const VALIDADE_CACHE = 5 * 60_000;

async function compromissosDaConexao(c: banco.Conexao, forcar = false): Promise<Compromisso[]> {
  const guardado = cacheAgenda.get(c.usuario_id);
  if (guardado && !forcar && Date.now() - guardado.em < VALIDADE_CACHE) return guardado.compromissos;
  try {
    const ics = await baixarIcs(decifrar(c.segredo_cifrado));
    const compromissos = compromissosDoIcs(ics, new Date(Date.now() - 86_400_000), new Date(Date.now() + 15 * 86_400_000));
    cacheAgenda.set(c.usuario_id, { em: Date.now(), compromissos });
    if (c.situacao !== "ok" || !c.ultima_leitura || Date.now() - new Date(c.ultima_leitura).getTime() > 30 * 60_000) {
      await banco.atualizarConexao(c.usuario_id, c.id, { situacao: "ok", erro: null, ultima_leitura: new Date().toISOString() });
    }
    return compromissos;
  } catch (e) {
    log.aviso("agenda:", e);
    if (!guardado) {
      await banco.atualizarConexao(c.usuario_id, c.id, { situacao: "erro", erro: "Não consegui ler a agenda. Se você trocou o link secreto, conecte de novo." });
    }
    return guardado?.compromissos ?? [];
  }
}

/** Compromissos de uma pessoa entre dois dias (AAAA-MM-DD, horário de Brasília). null = agenda não conectada. */
export async function compromissosDe(usuarioId: string, de: string, ate: string): Promise<Compromisso[] | null> {
  const c = await banco.conexaoDe(usuarioId, "agenda_ics");
  if (!c) return null;
  const todos = await compromissosDaConexao(c);
  return todos.filter((x) => x.dia >= de && x.dia <= ate);
}

/** A cada minuto: avisa os compromissos que começam daqui a pouco. */
export async function avisarCompromissos() {
  for (const c of await banco.conexoesAtivas("agenda_ics")) {
    try {
      const p = await banco.preferencias(c.usuario_id);
      if (!p || p.agenda_aviso_minutos <= 0) continue;
      const agora = Date.now();
      const proximos = (await compromissosDaConexao(c)).filter(
        (x) => !x.diaInteiro && x.inicio.getTime() > agora - 60_000 && x.inicio.getTime() - agora <= p.agenda_aviso_minutos * 60_000,
      );
      for (const x of proximos) {
        if (!(await banco.registrarAvisoAgenda(c.usuario_id, x.chave, x.inicio.toISOString()))) continue;
        const faltam = Math.max(0, Math.round((x.inicio.getTime() - agora) / 60_000));
        await avisar(
          c.usuario_id,
          `⏰ ${faltam <= 1 ? "Agora" : `Em ${faltam} min`}: *${x.titulo}* (${horaLocal(x.inicio)}–${horaLocal(x.fim)})${x.local ? `\n📍 ${x.local}` : ""}`,
        ).catch((e) => log.aviso("aviso da agenda:", e));
      }
    } catch (e) {
      log.erro("agenda (avisos):", e);
    }
  }
}

// ================================================================ resumo da manhã

export function montarResumoManha(nome: string, compromissos: Compromisso[] | null, emails: banco.EmailGuardado[]): string {
  const partes = [`☀️ Bom dia, ${nome}!`];
  if (compromissos) {
    partes.push(
      compromissos.length
        ? `📅 *Hoje:*\n${compromissos.map((c) => `• ${descreverCompromisso(c)}`).join("\n")}`
        : "📅 Agenda livre hoje.",
    );
  }
  if (emails.length) {
    const mostrar = emails.slice(0, 8);
    partes.push(
      `📧 *E-mails que merecem atenção:*\n${mostrar.map(linhaEmail).join("\n")}${emails.length > mostrar.length ? `\n… e mais ${emails.length - mostrar.length} no site.` : ""}`,
    );
  } else if (compromissos === null) {
    return ""; // sem agenda e sem e-mails importantes: não manda nada
  } else {
    partes.push("📧 Nenhum e-mail importante desde ontem.");
  }
  return partes.join("\n\n");
}

/** Uma vez por dia, na hora escolhida: agenda de hoje + e-mails importantes. */
export async function enviarResumosDaManha() {
  if (!conectado()) return;
  const hoje = hojeISO();
  const hora = horaAgora();
  if (hora >= 12) return; // passou da manhã: não manda "bom dia" atrasado
  for (const p of await banco.perfisParaResumo(hoje, hora)) {
    try {
      const temEmail = !!(await banco.conexaoDe(p.id, "gmail"));
      const compromissos = await compromissosDe(p.id, hoje, hoje);
      if (!temEmail && compromissos === null) continue; // nada conectado: o resumo ainda não tem o que mostrar
      const emails = temEmail ? await banco.emailsParaResumo(p.id, new Date(Date.now() - 24 * 3_600_000).toISOString()) : [];
      const texto = montarResumoManha(p.nome.split(" ")[0], compromissos, emails);
      if (texto && !(await avisar(p.id, texto))) continue;
      await banco.marcarEmailsNoResumo(p.id, emails.map((e) => e.id));
      await banco.marcarEmailsAvisados(
        p.id,
        emails.filter((e) => e.importancia === "urgente" && !e.avisado_em).map((e) => e.id),
      );
      await banco.marcarResumoEnviado(p.id, hoje);
    } catch (e) {
      log.erro("resumo da manhã:", e);
    }
  }
}
