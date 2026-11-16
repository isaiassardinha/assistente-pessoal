/** Resposta de uma ação de formulário: mensagem de erro/sucesso e os
 *  valores digitados (para não apagar o que a pessoa já preencheu). */
export type EstadoFormulario = {
  erro?: string;
  sucesso?: string;
  valores?: Record<string, string>;
  /** Mostrar o botão "reenviar e-mail de confirmação" */
  reenviar?: boolean;
};

export const ESTADO_INICIAL: EstadoFormulario = {};

export function campo(formulario: FormData, nome: string): string {
  const valor = formulario.get(nome);
  return typeof valor === "string" ? valor.trim() : "";
}

/** Senhas não levam trim: espaço pode fazer parte da senha. */
export function campoSenha(formulario: FormData, nome: string): string {
  const valor = formulario.get(nome);
  return typeof valor === "string" ? valor : "";
}

export const ERRO_GENERICO = "Não deu certo agora. Tente de novo em instantes.";
