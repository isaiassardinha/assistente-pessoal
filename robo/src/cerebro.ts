// =====================================================================
// SEGUNDO CÉREBRO: lê documentos, deixa anotações e documentos
// pesquisáveis pelo sentido e encontra trechos para responder perguntas.
// =====================================================================

import { ehImagem, ehTexto } from "@/lib/arquivos";
import { instanteParaLocal } from "@/lib/datas";
import * as banco from "./banco";
import { ArquivoGrandeDemais, gerarVetores, IaIndisponivel, lerArquivoComIA, MAXIMO_LEITURA_IA, resumir, type TrechoEncontrado } from "./ia";
import { log } from "./log";
import { pareceEscaneado, quebrarEmTrechos } from "./trechos";

/** Problema que não se resolve tentando de novo (mensagem vai para a pessoa). */
export class ArquivoIlegivel extends Error {}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Extrai o texto do arquivo. Fotos e PDFs escaneados são lidos pela IA. */
export async function extrairTexto(dados: Buffer, mime: string): Promise<string> {
  if (ehTexto(mime)) return dados.toString("utf8");

  if (mime === DOCX) {
    const mammoth = (await import("mammoth")).default;
    try {
      const { value } = await mammoth.extractRawText({ buffer: dados });
      return value;
    } catch {
      throw new ArquivoIlegivel("Não consegui abrir este arquivo do Word. Ele pode estar corrompido ou protegido por senha.");
    }
  }

  if (mime === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    let texto = "";
    let paginas = 1;
    try {
      const pdf = await getDocumentProxy(new Uint8Array(dados));
      const r = await extractText(pdf, { mergePages: true });
      texto = r.text;
      paginas = r.totalPages;
    } catch (e) {
      if (/password/i.test(String((e as Error)?.message))) throw new ArquivoIlegivel("Este PDF está protegido por senha. Tire a senha e envie de novo.");
      // PDF estranho: tenta pela IA
    }
    if (!pareceEscaneado(texto, paginas)) return texto;
    if (dados.length > MAXIMO_LEITURA_IA) {
      throw new ArquivoIlegivel("Este PDF parece escaneado (é uma imagem) e é grande demais para eu ler. Envie em partes menores (até 14 MB).");
    }
    return lerArquivoComIA(dados, mime);
  }

  if (ehImagem(mime)) {
    try {
      return await lerArquivoComIA(dados, mime);
    } catch (e) {
      if (e instanceof ArquivoGrandeDemais) throw new ArquivoIlegivel("Esta foto é grande demais para eu ler (até 14 MB).");
      throw e;
    }
  }

  throw new ArquivoIlegivel("Ainda não sei ler este tipo de arquivo.");
}

/** Lê um documento da fila: extrai texto, resume, quebra em trechos e grava os vetores. */
export async function processarDocumento(item: { id: string; usuario_id: string; status: string; status_em: string; tentativas: number }) {
  const uid = item.usuario_id;
  const doc = await banco.reservarDocumento(uid, item);
  if (!doc) return null; // outro processo pegou

  if (item.status === "processando" && item.tentativas >= banco.MAXIMO_TENTATIVAS_LEITURA) {
    // travou no meio várias vezes (ex.: arquivo que derruba o leitor): desiste
    await banco.falharDocumento(uid, doc.id, "Não consegui ler este arquivo depois de várias tentativas. Tente enviar de novo.", true);
    return { doc, ok: false as const, erro: "várias tentativas" };
  }

  try {
    const dados = await banco.baixarArquivo(uid, doc.caminho);
    const texto = (await extrairTexto(dados, doc.tipo_mime ?? "")).trim();
    if (texto.length < 3) throw new ArquivoIlegivel("Não encontrei nenhum texto ou conteúdo legível neste arquivo.");

    const trechos = quebrarEmTrechos(texto);
    const titulo = doc.descricao ? `${doc.nome_arquivo} - ${doc.descricao}` : doc.nome_arquivo;
    const vetores = await gerarVetores(trechos, "documento", titulo);
    await banco.gravarTrechosDoDocumento(uid, doc.id, trechos.map((conteudo, i) => ({ conteudo, vetor: vetores[i] })));

    let resumo = "";
    try {
      resumo = await resumir(texto, doc.nome_arquivo);
    } catch (e) {
      log.aviso("resumo do documento falhou:", e); // não impede o documento de ficar pronto
    }
    await banco.concluirDocumento(uid, doc.id, resumo);
    log.info(`documento lido: ${trechos.length} trechos`);
    return { doc, ok: true as const, resumo };
  } catch (e) {
    const definitivo = e instanceof ArquivoIlegivel || doc.tentativas >= banco.MAXIMO_TENTATIVAS_LEITURA;
    const mensagem = e instanceof ArquivoIlegivel ? e.message : "Não consegui ler agora; vou tentar de novo em instantes.";
    if (!(e instanceof ArquivoIlegivel)) log.erro("leitura de documento:", e);
    await banco.falharDocumento(uid, doc.id, definitivo && !(e instanceof ArquivoIlegivel) ? "Não consegui ler este arquivo. Tente enviar de novo." : mensagem, definitivo);
    if (e instanceof IaIndisponivel) throw e; // a rotina para e tenta depois
    return { doc, ok: false as const, erro: mensagem, definitivo };
  }
}

/** Deixa pesquisáveis as anotações novas ou editadas. */
export async function indexarAnotacoes(limite = 30): Promise<number> {
  const lista = await banco.anotacoesParaIndexar(limite);
  if (lista.length === 0) return 0;
  const vetores = await gerarVetores(lista.map((a) => a.texto), "documento", "Anotação pessoal");
  for (const [i, a] of lista.entries()) {
    await banco.indexarAnotacao(a.usuario_id, a.id, a.texto, vetores[i]);
  }
  return lista.length;
}

/** Quão diferente um trecho pode ser da pergunta e ainda contar (0 = igual, 2 = oposto). */
const DISTANCIA_MAXIMA = 0.7;

/** Procura nas anotações e documentos da pessoa os trechos mais ligados à pergunta. */
export async function buscar(usuarioId: string, pergunta: string, limite = 8) {
  const [vetor] = await gerarVetores([pergunta], "pergunta");
  const achados = (await banco.buscarTrechos(usuarioId, vetor, limite)).filter((t) => t.distancia <= DISTANCIA_MAXIMA);

  const idsDocs = [...new Set(achados.map((t) => t.documento_id).filter((x): x is string => !!x))];
  const idsNotas = [...new Set(achados.map((t) => t.memoria_id).filter((x): x is string => !!x))];
  const docs = new Map((idsDocs.length ? await banco.documentosPorIds(usuarioId, idsDocs) : []).map((d) => [d.id, d]));
  const datas = await banco.datasDasAnotacoes(usuarioId, idsNotas);

  const trechos: (TrechoEncontrado & { documentoId: string | null; anotacaoId: string | null })[] = achados.map((t) => {
    if (t.documento_id) {
      const d = docs.get(t.documento_id);
      return { fonte: `documento "${d?.nome_arquivo ?? "?"}"`, conteudo: t.conteudo, documentoId: t.documento_id, anotacaoId: null };
    }
    const quando = datas.get(t.memoria_id ?? "");
    const dia = quando ? instanteParaLocal(quando).slice(0, 10).split("-").reverse().join("/") : "";
    return { fonte: `anotação${dia ? ` de ${dia}` : ""}`, conteudo: t.conteudo, documentoId: null, anotacaoId: t.memoria_id };
  });

  const fontes = [
    ...idsDocs.filter((id) => docs.has(id)).map((id) => ({ tipo: "documento" as const, id, nome: docs.get(id)!.nome_arquivo })),
    ...(idsNotas.length ? [{ tipo: "anotacao" as const, id: idsNotas[0], nome: idsNotas.length === 1 ? "1 anotação" : `${idsNotas.length} anotações` }] : []),
  ];
  return { trechos, fontes };
}
