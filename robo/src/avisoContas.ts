// Monta a mensagem diária de contas a pagar (função pura, testada).

import { diasEntre } from "@/lib/contas";
import { formatarDataCurta } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";

export type ItemAviso = {
  descricao: string;
  valor: number | null;
  vencimento: string;
  tipo: "antes" | "hoje" | "atrasada";
};

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function linha(i: ItemAviso, hoje: string): string {
  const valor = i.valor == null ? "valor a definir" : formatarReais(i.valor);
  if (i.tipo === "atrasada") {
    const dias = diasEntre(i.vencimento, hoje);
    return `• ${i.descricao}: ${valor} (venceu ${dias === 1 ? "ontem" : `há ${dias} dias, em ${formatarDataCurta(i.vencimento)}`})`;
  }
  if (i.tipo === "hoje") return `• ${i.descricao}: ${valor}`;
  const dia = SEMANA[new Date(`${i.vencimento}T12:00:00Z`).getUTCDay()];
  return `• ${i.descricao}: ${valor} (vence ${dia}, ${formatarDataCurta(i.vencimento)})`;
}

export function montarAvisoContas(itens: ItemAviso[], hoje: string): string {
  const atrasadas = itens.filter((i) => i.tipo === "atrasada");
  const deHoje = itens.filter((i) => i.tipo === "hoje");
  const proximas = itens.filter((i) => i.tipo === "antes");
  const partes: string[] = ["💸 *Contas a pagar*"];
  if (atrasadas.length) partes.push(`\n⚠️ *Não estão marcadas como pagas:*\n${atrasadas.map((i) => linha(i, hoje)).join("\n")}`);
  if (deHoje.length) partes.push(`\n📌 *Vencem hoje:*\n${deHoje.map((i) => linha(i, hoje)).join("\n")}`);
  if (proximas.length) partes.push(`\n🗓️ *Vencem em breve:*\n${proximas.map((i) => linha(i, hoje)).join("\n")}`);
  const exemplo = (atrasadas[0] ?? deHoje[0] ?? proximas[0])?.descricao.toLowerCase() ?? "a conta";
  partes.push(`\nQuando pagar, me diga "paguei ${exemplo}" que eu marco e já lanço nos gastos.`);
  return partes.join("\n");
}
