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
  ultimo_resumo_em: string | null;
  aprovado_em: string | null;
  criado_em: string;
};

export type Categoria = { id: string; usuario_id: string; nome: string; criado_em: string };

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
  valor: number;
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
  criado_em: string;
};

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
    };
    Views: { [_ in never]: never };
    Functions: {
      admin_definir_status: {
        Args: { p_usuario: string; p_status: StatusCadastro };
        Returns: undefined;
      };
    };
    Enums: { status_cadastro: StatusCadastro };
    CompositeTypes: { [_ in never]: never };
  };
};
