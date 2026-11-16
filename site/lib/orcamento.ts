// Situação do orçamento de uma categoria no mês.

export type Situacao = {
  percentual: number; // 0 a 100+ (sem limite = null)
  cor: "verde" | "ambar" | "vermelho";
  texto: string;
};

export function situacaoDoOrcamento(gasto: number, limite: number, formatar: (v: number) => string): Situacao {
  const percentual = limite > 0 ? (gasto / limite) * 100 : 0;
  const cor = percentual >= 100 ? "vermelho" : percentual >= 80 ? "ambar" : "verde";
  const diferenca = Math.round((limite - gasto) * 100) / 100;
  const texto =
    diferenca > 0
      ? `faltam ${formatar(diferenca)}`
      : diferenca === 0
        ? "limite atingido"
        : `passou ${formatar(-diferenca)}`;
  return { percentual, cor, texto };
}

// Larguras da barra de 5 em 5% (classes escritas por extenso para o Tailwind
// gerar; estilo "inline" é bloqueado pela proteção CSP do site).
const LARGURAS = [
  "w-0", "w-[5%]", "w-[10%]", "w-[15%]", "w-[20%]", "w-[25%]", "w-[30%]", "w-[35%]", "w-[40%]", "w-[45%]",
  "w-[50%]", "w-[55%]", "w-[60%]", "w-[65%]", "w-[70%]", "w-[75%]", "w-[80%]", "w-[85%]", "w-[90%]", "w-[95%]", "w-full",
];

export function classeLargura(percentual: number): string {
  const passo = Math.max(0, Math.min(20, Math.round(percentual / 5)));
  return LARGURAS[passo === 0 && percentual > 0 ? 1 : passo];
}
