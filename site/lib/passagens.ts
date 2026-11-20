// Vigias de passagem no site: validação do formulário e textos (funções puras, testadas).

import { dataValida, formatarDataCurta, somarDias } from "./datas";
import { lerValor } from "./dinheiro";

export const AEROPORTOS = /^[A-Z]{3}(,[A-Z]{3}){0,5}$/;

export type NovaVigiaSite = {
  origem: string;
  destino: string;
  descricao: string | null;
  ida: string;
  ida_ate: string | null;
  volta: string | null;
  dias_viagem: number | null;
  so_ida: boolean;
  adultos: number;
  so_direto: boolean;
  preco_alvo: number;
};

/** "gru, cgh" -> "GRU,CGH" */
export function lerAeroportos(texto: string): string {
  return texto.toUpperCase().replace(/[\s/;]+/g, ",").replace(/,+/g, ",").replace(/^,|,$/g, "");
}

/**
 * Formulário do site. tipo: "volta" (ida e volta, datas fixas), "ida" (só ida)
 * ou "flexivel" (saída em qualquer dia da janela, com N dias de viagem).
 */
export function validarVigia(c: Record<string, string>, hoje: string): { dados?: NovaVigiaSite; erro?: string } {
  const origem = lerAeroportos(c.origem ?? "");
  const destino = lerAeroportos(c.destino ?? "");
  if (!AEROPORTOS.test(origem) || !AEROPORTOS.test(destino))
    return { erro: "Use o código do aeroporto (3 letras, ex.: GRU, MIA). Vários do mesmo lugar: separe por vírgula (GRU,CGH,VCP)." };
  if (origem === destino) return { erro: "Origem e destino iguais." };
  const preco = lerValor(c.preco_alvo ?? "");
  if (!preco || preco >= 1_000_000) return { erro: "Digite o preço-alvo (ex.: 3.000)." };
  const tipo = c.tipo === "ida" || c.tipo === "flexivel" ? c.tipo : "volta";
  const ida = c.ida ?? "";
  const limite = somarDias(hoje, 330);
  const dataOk = (d: string) => dataValida(d) && d >= hoje && d <= limite;
  if (!dataOk(ida)) return { erro: "Data de ida inválida (de hoje até uns 11 meses à frente)." };

  let volta: string | null = null;
  let idaAte: string | null = null;
  let dias: number | null = null;
  if (tipo === "volta") {
    volta = c.volta ?? "";
    if (!dataOk(volta) || volta < ida) return { erro: "Data de volta inválida (precisa ser depois da ida)." };
  }
  if (tipo === "flexivel") {
    idaAte = c.ida_ate ?? "";
    if (!dataOk(idaAte) || idaAte < ida || idaAte > somarDias(ida, 120)) return { erro: "A janela de saída precisa ter de 1 a 120 dias." };
    if (c.dias_viagem) {
      dias = Number(c.dias_viagem);
      if (!Number.isInteger(dias) || dias < 1 || dias > 60) return { erro: "Dias de viagem: de 1 a 60 (ou deixe em branco para só ida)." };
    }
  }
  const adultos = Number(c.adultos || 1);
  if (!Number.isInteger(adultos) || adultos < 1 || adultos > 9) return { erro: "Adultos: de 1 a 9." };

  return {
    dados: {
      origem,
      destino,
      descricao: (c.descricao ?? "").trim().slice(0, 120) || null,
      ida,
      ida_ate: idaAte,
      volta,
      dias_viagem: dias,
      so_ida: tipo === "ida" || (tipo === "flexivel" && dias == null),
      adultos,
      so_direto: c.so_direto === "on",
      preco_alvo: preco,
    },
  };
}

export function rotaLegivel(v: { origem: string; destino: string; descricao?: string | null }): string {
  return v.descricao?.trim() || `${v.origem.replace(/,/g, "/")} → ${v.destino.replace(/,/g, "/")}`;
}

export function datasLegiveis(v: { ida: string; ida_ate?: string | null; volta?: string | null; dias_viagem?: number | null; so_ida?: boolean }): string {
  if (v.ida_ate) {
    const janela = `saída entre ${formatarDataCurta(v.ida)} e ${formatarDataCurta(v.ida_ate)}`;
    return v.so_ida || !v.dias_viagem ? `${janela}, só ida` : `${janela}, ${v.dias_viagem} dias de viagem`;
  }
  return v.volta ? `${formatarDataCurta(v.ida)} a ${formatarDataCurta(v.volta)}` : `${formatarDataCurta(v.ida)}, só ida`;
}
