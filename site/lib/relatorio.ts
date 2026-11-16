// Relatórios de despesas: planilha (CSV para Excel) e PDF.
// Usado pelo site e, mais tarde, pelo robô do WhatsApp.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarData } from "@/lib/datas";
import { formatarReais, valorParaCampo } from "@/lib/dinheiro";

export type LinhaRelatorio = { data: string; descricao: string; categoria: string; valor: number; origem?: string };

export type DadosRelatorio = {
  titulo: string;
  periodo: string;
  linhas: LinhaRelatorio[];
  geradoEm: string; // "16/11/2026 às 15:30"
};

// ---------------------------------------------------------------------
// Planilha (CSV): ponto e vírgula e vírgula decimal, como o Excel brasileiro espera
// ---------------------------------------------------------------------

function celula(valor: string): string {
  let v = valor.replace(/\r?\n/g, " ");
  // Evita que o Excel interprete o texto como fórmula
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return /[;"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function gerarCsv(dados: DadosRelatorio): string {
  const linhas = [
    ["Data", "Descrição", "Categoria", "Valor (R$)"].join(";"),
    ...dados.linhas.map((l) =>
      [formatarData(l.data), celula(l.descricao), celula(l.categoria), valorParaCampo(l.valor)].join(";"),
    ),
    ["", "", "TOTAL", valorParaCampo(dados.linhas.reduce((s, l) => s + l.valor, 0))].join(";"),
  ];
  return `﻿${linhas.join("\r\n")}\r\n`; // ﻿ faz o Excel ler os acentos certo
}

// ---------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------

/** As fontes padrão do PDF só têm letras latinas: troca o resto por "?". */
function seguro(texto: string): string {
  return texto
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ–—•€]/g, "?");
}

function cortar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  let t = seguro(texto);
  if (fonte.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}…`, tamanho) > largura) t = t.slice(0, -1);
  return `${t}…`;
}

export async function gerarPdf(dados: DadosRelatorio): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(seguro(`${dados.titulo} - ${dados.periodo}`));
  pdf.setCreator("Assistente Pessoal");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);

  const LARG = 595.28; // A4
  const ALT = 841.89;
  const MARGEM = 48;
  const cinza = rgb(0.4, 0.4, 0.45);
  const verde = rgb(0.016, 0.47, 0.34);
  const colunas = { data: MARGEM, descricao: MARGEM + 70, categoria: MARGEM + 300, valorFim: LARG - MARGEM };

  let pagina: PDFPage = pdf.addPage([LARG, ALT]);
  let y = ALT - MARGEM;

  const escrever = (t: string, x: number, tam = 10, fonte = normal, cor = rgb(0.1, 0.1, 0.12)) =>
    pagina.drawText(seguro(t), { x, y, size: tam, font: fonte, color: cor });
  const escreverDireita = (t: string, xFim: number, tam = 10, fonte = normal) =>
    pagina.drawText(seguro(t), { x: xFim - fonte.widthOfTextAtSize(seguro(t), tam), y, size: tam, font: fonte });

  const cabecalhoTabela = () => {
    escrever("Data", colunas.data, 9, negrito, cinza);
    escrever("Descrição", colunas.descricao, 9, negrito, cinza);
    escrever("Categoria", colunas.categoria, 9, negrito, cinza);
    escreverDireita("Valor", colunas.valorFim, 9, negrito);
    y -= 6;
    pagina.drawLine({ start: { x: MARGEM, y }, end: { x: LARG - MARGEM, y }, thickness: 0.5, color: cinza });
    y -= 14;
  };

  const novaPaginaSePrecisar = (espaco: number) => {
    if (y - espaco < MARGEM) {
      pagina = pdf.addPage([LARG, ALT]);
      y = ALT - MARGEM;
      cabecalhoTabela();
    }
  };

  // Cabeçalho
  escrever("Assistente Pessoal", MARGEM, 10, negrito, verde);
  y -= 26;
  escrever(dados.titulo, MARGEM, 18, negrito);
  y -= 18;
  escrever(dados.periodo, MARGEM, 11, normal, cinza);
  y -= 30;

  // Resumo
  const total = dados.linhas.reduce((s, l) => s + l.valor, 0);
  escrever(`Total: ${formatarReais(total)}`, MARGEM, 14, negrito);
  y -= 16;
  escrever(`${dados.linhas.length} despesa(s)`, MARGEM, 10, normal, cinza);
  y -= 26;

  // Por categoria
  const porCategoria = new Map<string, number>();
  for (const l of dados.linhas) porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + l.valor);
  if (porCategoria.size > 0) {
    escrever("Por categoria", MARGEM, 11, negrito);
    y -= 16;
    for (const [cat, v] of [...porCategoria.entries()].sort((a, b) => b[1] - a[1])) {
      novaPaginaSePrecisar(14);
      escrever(cortar(cat, normal, 10, 200), MARGEM, 10);
      escreverDireita(formatarReais(v), MARGEM + 330, 10);
      y -= 14;
    }
    y -= 16;
  }

  // Lista
  novaPaginaSePrecisar(40);
  escrever("Despesas", MARGEM, 11, negrito);
  y -= 18;
  cabecalhoTabela();
  if (dados.linhas.length === 0) {
    escrever("Nenhuma despesa neste período.", MARGEM, 10, normal, cinza);
    y -= 14;
  }
  for (const l of dados.linhas) {
    novaPaginaSePrecisar(14);
    escrever(formatarData(l.data), colunas.data, 9);
    escrever(cortar(l.descricao || "-", normal, 9, 220), colunas.descricao, 9);
    escrever(cortar(l.categoria, normal, 9, 120), colunas.categoria, 9);
    escreverDireita(formatarReais(l.valor), colunas.valorFim, 9);
    y -= 14;
  }

  // Rodapé com número da página
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    p.drawText(seguro(`Gerado em ${dados.geradoEm} · página ${i + 1} de ${paginas.length}`), {
      x: MARGEM,
      y: 24,
      size: 8,
      font: normal,
      color: cinza,
    });
  });

  return pdf.save();
}
