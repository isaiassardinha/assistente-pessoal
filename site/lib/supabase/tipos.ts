// Tipos do banco (gerados a partir do Supabase e enxugados).
// Para atualizar depois de mudar o banco, gere de novo pelo Supabase.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Tabela<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};

export type StatusCadastro = "pendente" | "aprovado" | "recusado";

export type Perfil = {
  id: string;
  nome: string;
  email: string;
  celular: string | null;
  celular_verificado: boolean;
  status: StatusCadastro;
  is_admin: boolean;
  nome_assistente: string;
  resumo_manha: boolean;
  contas_aviso_dias_antes: number;
  contas_aviso_atraso_cada: number;
  contas_aviso_hora: number;
  agenda_aviso_minutos: number;
  resumo_manha_hora: number;
  silencio_inicio: number;
  silencio_fim: number;
  ultimo_resumo_em: string | null;
  aprovado_em: string | null;
  criado_em: string;
};

export type Categoria = {
  id: string;
  usuario_id: string;
  nome: string;
  criado_em: string;
};

export type Despesa = {
  id: string;
  usuario_id: string;
  valor: number;
  categoria_id: string;
  descricao: string;
  data: string;
  despesa_fixa_id: string | null;
  origem: string;
  criado_em: string;
};

export type DespesaFixa = {
  id: string;
  usuario_id: string;
  descricao: string;
  valor: number | null;
  categoria_id: string;
  dia_vencimento: number;
  ativa: boolean;
  criado_em: string;
};

export type Orcamento = {
  id: string;
  usuario_id: string;
  categoria_id: string;
  limite_mensal: number;
  criado_em: string;
};

export type Tarefa = {
  id: string;
  usuario_id: string;
  titulo: string;
  concluida: boolean;
  concluida_em: string | null;
  criado_em: string;
};

export type Lembrete = {
  id: string;
  usuario_id: string;
  texto: string;
  quando: string;
  status: string;
  tentativas: number;
  reservado_em: string | null;
  enviado_em: string | null;
  ultimo_erro: string | null;
  criado_em: string;
};

export type Memoria = {
  id: string;
  usuario_id: string;
  texto: string;
  indexada: boolean;
  origem: "site" | "whatsapp";
  criado_em: string;
  atualizado_em: string;
};

export type Decisao = {
  id: string;
  usuario_id: string;
  titulo: string;
  contexto: string | null;
  status: string;
  decisao: string | null;
  motivo: string | null;
  decidida_em: string | null;
  criado_em: string;
};

export type DecisaoPonto = {
  id: string;
  usuario_id: string;
  decisao_id: string;
  tipo: string;
  texto: string;
  criado_em: string;
};

export type Documento = {
  id: string;
  usuario_id: string;
  nome_arquivo: string;
  descricao: string;
  caminho: string;
  tipo_mime: string | null;
  tamanho_bytes: number;
  origem: "site" | "whatsapp";
  status: "pendente" | "processando" | "pronto" | "erro";
  status_em: string;
  tentativas: number;
  resumo: string | null;
  erro: string | null;
  erro_detalhe: string | null;
  processado_em: string | null;
  criado_em: string;
};

export type Conta = {
  id: string;
  usuario_id: string;
  descricao: string;
  valor: number | null;
  categoria_id: string;
  vencimento: string;
  despesa_fixa_id: string | null;
  status: "a_pagar" | "paga" | "ignorada";
  paga_em: string | null;
  despesa_id: string | null;
  origem: "site" | "whatsapp" | "fixa";
  ultimo_aviso_em: string | null;
  criado_em: string;
};

export type Conexao = {
  id: string;
  usuario_id: string;
  tipo: "gmail" | "agenda_ics";
  conta: string;
  segredo_cifrado: string;
  estado: Record<string, unknown>;
  situacao: "ok" | "erro";
  erro: string | null;
  erro_avisado: boolean;
  ultima_leitura: string | null;
  criado_em: string;
};

export type EmailResumo = {
  id: string;
  usuario_id: string;
  conexao_id: string;
  message_id: string;
  recebido_em: string;
  remetente_nome: string | null;
  remetente_email: string | null;
  assunto: string | null;
  resumo: string | null;
  importancia: "urgente" | "importante" | "normal" | "ignorar";
  motivo: string | null;
  avisado_em: string | null;
  no_resumo_em: string | null;
  criado_em: string;
};

export type RegraEmail = { id: string; usuario_id: string; tipo: "importante" | "ignorar"; padrao: string; criado_em: string };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      perfis: Tabela<Perfil>;
      categorias: Tabela<Categoria>;
      despesas: Tabela<Despesa>;
      despesas_fixas: Tabela<DespesaFixa>;
      orcamentos: Tabela<Orcamento>;
      tarefas: Tabela<Tarefa>;
      lembretes: Tabela<Lembrete>;
      memorias: Tabela<Memoria>;
      decisoes: Tabela<Decisao>;
      decisao_pontos: Tabela<DecisaoPonto>;
      documentos: Tabela<Documento>;
      contas: Tabela<Conta>;
      conexoes: Tabela<Conexao>;
      emails: Tabela<EmailResumo>;
      regras_email: Tabela<RegraEmail>;
    };
    Views: { [_ in never]: never };
    Functions: {
      admin_definir_status: {
        Args: { p_usuario: string; p_status: StatusCadastro };
        Returns: undefined;
      };
      pagar_conta: {
        Args: {
          p_usuario: string;
          p_conta: string;
          p_valor?: number | null;
          p_data?: string | null;
          p_origem?: string;
        };
        Returns: string;
      };
      resumo_uso_ia: {
        Args: { p_de: string; p_ate: string };
        Returns: {
          dia: string;
          usuario_id: string | null;
          tipo: string;
          chamadas: number;
          tokens_entrada: number;
          tokens_saida: number;
          custo_usd: number;
        }[];
      };
      reler_documento: {
        Args: { p_documento: string };
        Returns: boolean;
      };
      reabrir_conta: {
        Args: { p_usuario: string; p_conta: string };
        Returns: undefined;
      };
    };
    Enums: { status_cadastro: StatusCadastro };
    CompositeTypes: { [_ in never]: never };
  };
};
