// =====================================================================
// ESPAÇOS COMPARTILHADOS: memória comum de um grupo do WhatsApp.
//   * arquivos: Google Drive do espaço (se conectado) ou cofre "espacos";
//   * leitura dos documentos e mensagens pesquisáveis pelo sentido;
//   * busca SEMPRE dentro de um único espaço.
// =====================================================================

import { instanteParaLocal } from "@/lib/datas";
import { nomeSeguro } from "@/lib/arquivos";
import * as banco from "./banco";
import { ArquivoIlegivel, extrairTexto } from "./cerebro";
import { cifrar, decifrar } from "./cofre";
import { baixarArquivoDrive, contaDoDrive, criarPasta, DriveSemEspaco, enviarArquivoDrive, lixeiraDrive, pastaExiste } from "./googleDrive";
import { esquecerToken, GoogleRecusou, SemPermissaoMarcada, tokenDeAcesso, trocarCodigo } from "./googleAgenda";
import { gerarVetores, IaIndisponivel, resumir } from "./ia";
import { log } from "./log";
import { ConexaoInvalida } from "./pessoal";
import { normalizarTexto, quebrarEmTrechos } from "./trechos";
import { comUso } from "./uso";

/** Data e hora curtas: "05/03 14:20". */
export function quandoCurto(iso: string): string {
  const local = instanteParaLocal(iso);
  return `${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11, 16)}`;
}

/** Mensagem curta demais para valer como memória ("ok", "kkk", "bom dia"). */
export function mensagemSemConteudo(texto: string): boolean {
  const limpo = texto
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Component}]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (limpo.length < 12) return true;
  return /^(bom dia|boa tarde|boa noite|obrigad[oa]|valeu|ok|blz|beleza|kk+|rs+|haha+|sim|nao|não)( pessoal| a todos| galera)?$/i.test(limpo);
}

// ----------------------------------------------------------------- Drive

async function tokenDoDrive(espaco: banco.Espaco): Promise<string | null> {
  if (!espaco.drive_segredo_cifrado || !espaco.drive_pasta_id) return null;
  return tokenDeAcesso(`drive:${espaco.id}`, decifrar(espaco.drive_segredo_cifrado));
}

/** Conecta o Drive de um admin ao espaço: troca o código, cria a pasta e guarda o token criptografado. */
export async function conectarDriveEspaco(espaco: banco.Espaco, codigo: string, redirectUri: string) {
  let refreshToken: string;
  let conta: string;
  let pastaId: string;
  const chaveTeste = `teste-drive:${espaco.id}`;
  try {
    refreshToken = await trocarCodigo(codigo, redirectUri, "drive");
    const token = await tokenDeAcesso(chaveTeste, refreshToken);
    pastaId = await criarPasta(token, `Assistente - ${espaco.nome}`);
    conta = await contaDoDrive(token);
  } catch (e) {
    log.aviso("conectar Drive do espaço:", e);
    if (e instanceof SemPermissaoMarcada) {
      throw new ConexaoInvalida("Na tela do Google, a caixinha do Drive ficou desmarcada. Conecte de novo e marque a permissão.");
    }
    throw new ConexaoInvalida("O Google não liberou o acesso ao Drive. Confira se a API do Google Drive está ativada no projeto do Google Cloud e tente de novo.");
  } finally {
    esquecerToken(chaveTeste);
  }
  await banco.salvarDriveDoEspaco(espaco.id, conta, cifrar(refreshToken), pastaId);
  esquecerToken(`drive:${espaco.id}`);
}

export type Guardado = { armazenamento: "supabase" | "drive"; caminho: string | null; drive_id: string | null };

/** Guarda o arquivo: no Drive do espaço se der; se não, no cofre do Supabase. */
export async function guardarArquivo(espaco: banco.Espaco, id: string, nome: string, mime: string, dados: Buffer): Promise<Guardado> {
  try {
    const token = await tokenDoDrive(espaco);
    if (token) {
      let pasta = espaco.drive_pasta_id!;
      if (!(await pastaExiste(token, pasta))) {
        pasta = await criarPasta(token, `Assistente - ${espaco.nome}`); // apagaram a pasta: cria outra
        await banco.marcarDriveDoEspaco(espaco.id, "ok", pasta);
      }
      const driveId = await enviarArquivoDrive(token, pasta, nome, mime, dados);
      if (espaco.drive_situacao !== "ok") await banco.marcarDriveDoEspaco(espaco.id, "ok");
      return { armazenamento: "drive", caminho: null, drive_id: driveId };
    }
  } catch (e) {
    log.aviso("Drive do espaço falhou, guardando no cofre:", (e as Error).message);
    if (e instanceof GoogleRecusou || e instanceof DriveSemEspaco) await banco.marcarDriveDoEspaco(espaco.id, "erro").catch(() => {});
  }
  const caminho = `${espaco.id}/${id}-${nomeSeguro(nome)}`;
  await banco.guardarArquivoEspaco(espaco.id, caminho, dados, mime);
  return { armazenamento: "supabase", caminho, drive_id: null };
}

export class ArquivoIndisponivel extends Error {}

/** Baixa o arquivo original, onde quer que esteja. */
export async function baixarDocumento(espaco: banco.Espaco, doc: banco.DocumentoEspaco): Promise<Buffer> {
  if (doc.armazenamento === "supabase" && doc.caminho) return banco.baixarArquivoEspaco(espaco.id, doc.caminho);
  if (!doc.drive_id) throw new ArquivoIndisponivel("arquivo sem endereço");
  const token = await tokenDoDrive(espaco).catch(() => null);
  if (!token) throw new ArquivoIndisponivel("O Google Drive do espaço foi desconectado; o original não está acessível.");
  const dados = await baixarArquivoDrive(token, doc.drive_id);
  if (!dados) throw new ArquivoIndisponivel("O arquivo foi apagado ou movido no Google Drive.");
  return dados;
}

/** Apaga as fichas e os arquivos (no Drive vão para a lixeira). */
export async function apagarDocumentos(espaco: banco.Espaco, ids: string[]): Promise<number> {
  const apagados = await banco.apagarDocumentosEspaco(espaco.id, ids);
  const caminhos = apagados.map((d) => d.caminho).filter((c): c is string => !!c);
  if (caminhos.length) await banco.apagarArquivosEspaco(espaco.id, caminhos).catch((e) => log.aviso("apagar do cofre:", e));
  const doDrive = apagados.map((d) => d.drive_id).filter((d): d is string => !!d);
  if (doDrive.length) {
    const token = await tokenDoDrive(espaco).catch(() => null);
    for (const id of token ? doDrive : []) await lixeiraDrive(token!, id).catch((e) => log.aviso("lixeira do Drive:", e));
  }
  return apagados.length;
}

/** Apaga o espaço inteiro: arquivos do cofre e depois tudo no banco (os do Drive ficam lá). */
export async function apagarEspaco(espaco: banco.Espaco) {
  const docs = await banco.documentosEspaco(espaco.id, 10_000);
  const caminhos = docs.map((d) => d.caminho).filter((c): c is string => !!c);
  if (caminhos.length) await banco.apagarArquivosEspaco(espaco.id, caminhos).catch((e) => log.aviso("apagar cofre do espaço:", e));
  await banco.apagarEspaco(espaco.id);
  esquecerToken(`drive:${espaco.id}`);
}

// ------------------------------------------------------------- leitura

/** Lê um documento do espaço (o consumo de IA fica com quem mandou). */
export function processarDocumentoEspaco(item: { id: string; espaco_id: string; enviado_por: string | null; status: string; status_em: string; tentativas: number }) {
  return comUso(item.enviado_por, () => lerDocumento(item));
}

async function lerDocumento(item: { id: string; espaco_id: string; status: string; status_em: string; tentativas: number }) {
  const espaco = await banco.espacoPorId(item.espaco_id);
  if (!espaco) return null;
  const doc = await banco.reservarDocumentoEspaco(espaco.id, item);
  if (!doc) return null;

  if (item.status === "processando" && item.tentativas >= banco.MAXIMO_TENTATIVAS_LEITURA) {
    await banco.falharDocumentoEspaco(espaco.id, doc.id, "Não consegui ler o conteúdo depois de várias tentativas, mas o arquivo continua guardado.", true, "travou várias vezes");
    return { doc, espaco, ok: false as const };
  }

  try {
    const dados = await baixarDocumento(espaco, doc);
    const texto = normalizarTexto(await extrairTexto(dados, doc.tipo_mime ?? ""));
    if (texto.length < 3) throw new ArquivoIlegivel("Não encontrei nenhum texto ou conteúdo legível neste arquivo.");
    const trechos = quebrarEmTrechos(texto);
    const titulo = [doc.nome_arquivo, doc.descricao].filter(Boolean).join(" - ");
    const vetores = await gerarVetores(trechos, "documento", titulo);
    await banco.gravarTrechosDocumentoEspaco(espaco.id, doc.id, trechos.map((conteudo, i) => ({ conteudo, vetor: vetores[i] })));
    let resumo = "";
    try {
      resumo = await resumir(texto, doc.nome_arquivo);
    } catch (e) {
      log.aviso("resumo do documento do espaço falhou:", e);
    }
    await banco.concluirDocumentoEspaco(espaco.id, doc.id, resumo);
    log.info(`documento de espaço lido: ${trechos.length} trechos`);
    return { doc, espaco, ok: true as const };
  } catch (e) {
    const semJeito = e instanceof ArquivoIlegivel || e instanceof ArquivoIndisponivel;
    const definitivo = semJeito || doc.tentativas >= banco.MAXIMO_TENTATIVAS_LEITURA;
    if (!semJeito) log.erro("leitura de documento do espaço:", e);
    await banco.falharDocumentoEspaco(
      espaco.id,
      doc.id,
      semJeito ? (e as Error).message : definitivo ? "Não consegui ler o conteúdo, mas o arquivo continua guardado." : "Não consegui ler agora; vou tentar de novo.",
      definitivo,
      String((e as Error)?.message ?? e).replace(/AIza[A-Za-z0-9_-]+/g, "[chave]"),
    );
    if (e instanceof IaIndisponivel) throw e;
    return { doc, espaco, ok: false as const };
  }
}

/** Deixa pesquisáveis as mensagens novas dos grupos. */
export async function indexarMensagens(limite = 50): Promise<number> {
  const lista = await banco.mensagensParaIndexar(limite);
  if (lista.length === 0) return 0;
  const comConteudo = lista.filter((m) => !mensagemSemConteudo(m.texto));
  for (const m of lista.filter((x) => mensagemSemConteudo(x.texto))) await banco.indexarMensagemEspaco(m.espaco_id, m.id, null, null);

  // agrupa por autor para o consumo de IA ficar na conta de quem falou
  const porAutor = new Map<string | null, typeof lista>();
  for (const m of comConteudo) porAutor.set(m.autor_id, [...(porAutor.get(m.autor_id) ?? []), m]);
  for (const [autor, mensagens] of porAutor) {
    await comUso(autor, async () => {
      const textos = mensagens.map((m) => `${m.autor_nome} em ${quandoCurto(m.criado_em)}: ${m.texto}`);
      const vetores = await gerarVetores(textos, "documento", "Mensagem do grupo");
      for (const [i, m] of mensagens.entries()) await banco.indexarMensagemEspaco(m.espaco_id, m.id, textos[i], vetores[i]);
    });
  }
  return lista.length;
}

// --------------------------------------------------------------- busca

const DISTANCIA_MAXIMA = 0.7;

export type TrechoDoEspaco = { fonte: string; conteudo: string; documentoId: string | null };

/** Procura no espaço (documentos e mensagens) os trechos mais ligados à pergunta. */
export async function buscarNoEspaco(espacoId: string, pergunta: string, limite = 10): Promise<TrechoDoEspaco[]> {
  const [vetor] = await gerarVetores([pergunta], "pergunta");
  const achados = (await banco.buscarTrechosEspaco(espacoId, vetor, limite)).filter((t) => t.distancia <= DISTANCIA_MAXIMA);
  const idsDocs = [...new Set(achados.map((t) => t.documento_id).filter((x): x is string => !!x))];
  const docs = new Map((await banco.documentosEspacoPorIds(espacoId, idsDocs)).map((d) => [d.id, d]));
  return achados.map((t) => {
    if (t.documento_id) {
      const d = docs.get(t.documento_id);
      const quem = d?.enviado_por_nome ? `, enviado por ${d.enviado_por_nome} em ${quandoCurto(d.criado_em).slice(0, 5)}` : "";
      return { fonte: `documento "${d?.nome_arquivo ?? "?"}"${quem}`, conteudo: t.conteudo, documentoId: t.documento_id };
    }
    return { fonte: "mensagem do grupo", conteudo: t.conteudo, documentoId: null };
  });
}
