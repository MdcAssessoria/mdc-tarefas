export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      cliente_responsaveis: {
        Row: {
          cliente_id: string;
          org_id: string;
          setor_id: string;
          user_id: string;
        };
        Insert: {
          cliente_id: string;
          org_id: string;
          setor_id: string;
          user_id: string;
        };
        Update: {
          cliente_id?: string;
          org_id?: string;
          setor_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cliente_responsaveis_org_id_cliente_id_fkey";
            columns: ["org_id", "cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "cliente_responsaveis_org_id_setor_id_fkey";
            columns: ["org_id", "setor_id"];
            isOneToOne: false;
            referencedRelation: "setores";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "cliente_responsaveis_org_id_setor_id_fkey";
            columns: ["org_id", "setor_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_setores";
            referencedColumns: ["org_id", "setor_id"];
          },
          {
            foreignKeyName: "cliente_responsaveis_org_id_user_id_fkey";
            columns: ["org_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "membros";
            referencedColumns: ["org_id", "user_id"];
          },
          {
            foreignKeyName: "cliente_responsaveis_org_id_user_id_fkey";
            columns: ["org_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_responsaveis";
            referencedColumns: ["org_id", "user_id"];
          },
        ];
      };
      clientes: {
        Row: {
          ativo: boolean;
          cidade: string | null;
          cliente_desde: string | null;
          cnpj: string | null;
          codigo_dominio: string | null;
          criado_em: string;
          grupos: string[];
          id: string;
          importado_em: string | null;
          inativo_em: string | null;
          inicio_em: string | null;
          motivo_inativacao: string | null;
          nome_fantasia: string | null;
          org_id: string;
          razao_social: string;
          regime: string | null;
          segmento: string | null;
          situacao_dominio: string | null;
          uf: string | null;
        };
        Insert: {
          ativo?: boolean;
          cidade?: string | null;
          cliente_desde?: string | null;
          cnpj?: string | null;
          codigo_dominio?: string | null;
          criado_em?: string;
          grupos?: string[];
          id?: string;
          importado_em?: string | null;
          inativo_em?: string | null;
          inicio_em?: string | null;
          motivo_inativacao?: string | null;
          nome_fantasia?: string | null;
          org_id: string;
          razao_social: string;
          regime?: string | null;
          segmento?: string | null;
          situacao_dominio?: string | null;
          uf?: string | null;
        };
        Update: {
          ativo?: boolean;
          cidade?: string | null;
          cliente_desde?: string | null;
          cnpj?: string | null;
          codigo_dominio?: string | null;
          criado_em?: string;
          grupos?: string[];
          id?: string;
          importado_em?: string | null;
          inativo_em?: string | null;
          inicio_em?: string | null;
          motivo_inativacao?: string | null;
          nome_fantasia?: string | null;
          org_id?: string;
          razao_social?: string;
          regime?: string | null;
          segmento?: string | null;
          situacao_dominio?: string | null;
          uf?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clientes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      comentarios: {
        Row: {
          autor_id: string;
          criado_em: string;
          id: string;
          org_id: string;
          tarefa_id: string;
          texto: string;
        };
        Insert: {
          autor_id?: string;
          criado_em?: string;
          id?: string;
          org_id: string;
          tarefa_id: string;
          texto: string;
        };
        Update: {
          autor_id?: string;
          criado_em?: string;
          id?: string;
          org_id?: string;
          tarefa_id?: string;
          texto?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comentarios_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comentarios_tarefa_id_fkey";
            columns: ["tarefa_id"];
            isOneToOne: false;
            referencedRelation: "tarefas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comentarios_tarefa_id_fkey";
            columns: ["tarefa_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_vencimentos";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_atividades: {
        Row: {
          autor_id: string | null;
          concluida: boolean;
          criado_em: string;
          id: string;
          oportunidade_id: string;
          org_id: string;
          quando: string | null;
          texto: string;
          tipo: string;
        };
        Insert: {
          autor_id?: string | null;
          concluida?: boolean;
          criado_em?: string;
          id?: string;
          oportunidade_id: string;
          org_id: string;
          quando?: string | null;
          texto: string;
          tipo: string;
        };
        Update: {
          autor_id?: string | null;
          concluida?: boolean;
          criado_em?: string;
          id?: string;
          oportunidade_id?: string;
          org_id?: string;
          quando?: string | null;
          texto?: string;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_atividades_oportunidade_id_fkey";
            columns: ["oportunidade_id"];
            isOneToOne: false;
            referencedRelation: "crm_oportunidades";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_atividades_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_contratos: {
        Row: {
          assinado_em: string | null;
          criado_em: string;
          criado_por: string | null;
          enviado_em: string | null;
          id: string;
          modelo_id: string | null;
          modelo_versao: number | null;
          numero: string | null;
          oportunidade_id: string;
          org_id: string;
          status: string;
          texto: string;
          valores: Json;
        };
        Insert: {
          assinado_em?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          enviado_em?: string | null;
          id?: string;
          modelo_id?: string | null;
          modelo_versao?: number | null;
          numero?: string | null;
          oportunidade_id: string;
          org_id: string;
          status?: string;
          texto: string;
          valores?: Json;
        };
        Update: {
          assinado_em?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          enviado_em?: string | null;
          id?: string;
          modelo_id?: string | null;
          modelo_versao?: number | null;
          numero?: string | null;
          oportunidade_id?: string;
          org_id?: string;
          status?: string;
          texto?: string;
          valores?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "crm_contratos_modelo_id_fkey";
            columns: ["modelo_id"];
            isOneToOne: false;
            referencedRelation: "crm_modelos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_contratos_oportunidade_id_fkey";
            columns: ["oportunidade_id"];
            isOneToOne: false;
            referencedRelation: "crm_oportunidades";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_contratos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_modelos: {
        Row: {
          ativo: boolean;
          atualizado_em: string;
          atualizado_por: string | null;
          id: string;
          nome: string;
          org_id: string;
          texto: string;
          versao: number;
        };
        Insert: {
          ativo?: boolean;
          atualizado_em?: string;
          atualizado_por?: string | null;
          id?: string;
          nome: string;
          org_id: string;
          texto: string;
          versao?: number;
        };
        Update: {
          ativo?: boolean;
          atualizado_em?: string;
          atualizado_por?: string | null;
          id?: string;
          nome?: string;
          org_id?: string;
          texto?: string;
          versao?: number;
        };
        Relationships: [
          {
            foreignKeyName: "crm_modelos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_oportunidades: {
        Row: {
          arquivado_em: string | null;
          arquivado_por: string | null;
          atividade: string | null;
          atualizado_em: string;
          cidade: string | null;
          cliente_id: string | null;
          cnpj: string | null;
          contato_nome: string | null;
          criado_em: string;
          criado_por: string | null;
          dados_origem: Json | null;
          email: string | null;
          empresa: string;
          etapa: string;
          etapa_desde: string;
          faturamento: number | null;
          id: string;
          motivo_arquivo: string | null;
          motivo_perda: string | null;
          observacoes: string | null;
          org_id: string;
          origem: string;
          origem_ref: string | null;
          proximo_contato: string | null;
          razao_social: string | null;
          regime_atual: string | null;
          responsavel_id: string | null;
          uf: string | null;
          valor_mensal: number | null;
          whatsapp: string | null;
        };
        Insert: {
          arquivado_em?: string | null;
          arquivado_por?: string | null;
          atividade?: string | null;
          atualizado_em?: string;
          cidade?: string | null;
          cliente_id?: string | null;
          cnpj?: string | null;
          contato_nome?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          dados_origem?: Json | null;
          email?: string | null;
          empresa: string;
          etapa?: string;
          etapa_desde?: string;
          faturamento?: number | null;
          id?: string;
          motivo_arquivo?: string | null;
          motivo_perda?: string | null;
          observacoes?: string | null;
          org_id: string;
          origem?: string;
          origem_ref?: string | null;
          proximo_contato?: string | null;
          razao_social?: string | null;
          regime_atual?: string | null;
          responsavel_id?: string | null;
          uf?: string | null;
          valor_mensal?: number | null;
          whatsapp?: string | null;
        };
        Update: {
          arquivado_em?: string | null;
          arquivado_por?: string | null;
          atividade?: string | null;
          atualizado_em?: string;
          cidade?: string | null;
          cliente_id?: string | null;
          cnpj?: string | null;
          contato_nome?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          dados_origem?: Json | null;
          email?: string | null;
          empresa?: string;
          etapa?: string;
          etapa_desde?: string;
          faturamento?: number | null;
          id?: string;
          motivo_arquivo?: string | null;
          motivo_perda?: string | null;
          observacoes?: string | null;
          org_id?: string;
          origem?: string;
          origem_ref?: string | null;
          proximo_contato?: string | null;
          razao_social?: string | null;
          regime_atual?: string | null;
          responsavel_id?: string | null;
          uf?: string | null;
          valor_mensal?: number | null;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crm_oportunidades_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_oportunidades_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      est_itens: {
        Row: {
          ativo: boolean;
          categoria_despesa_id: string | null;
          categoria_receita_id: string | null;
          cliente_id: string;
          codigo: string | null;
          codigo_barras: string | null;
          controla_estoque: boolean;
          criado_em: string;
          custo: number | null;
          estoque_minimo: number;
          id: string;
          ncm: string | null;
          nome: string;
          observacao: string | null;
          org_id: string;
          preco_venda: number | null;
          tipo: string;
          unidade: string;
        };
        Insert: {
          ativo?: boolean;
          categoria_despesa_id?: string | null;
          categoria_receita_id?: string | null;
          cliente_id: string;
          codigo?: string | null;
          codigo_barras?: string | null;
          controla_estoque?: boolean;
          criado_em?: string;
          custo?: number | null;
          estoque_minimo?: number;
          id?: string;
          ncm?: string | null;
          nome: string;
          observacao?: string | null;
          org_id: string;
          preco_venda?: number | null;
          tipo?: string;
          unidade?: string;
        };
        Update: {
          ativo?: boolean;
          categoria_despesa_id?: string | null;
          categoria_receita_id?: string | null;
          cliente_id?: string;
          codigo?: string | null;
          codigo_barras?: string | null;
          controla_estoque?: boolean;
          criado_em?: string;
          custo?: number | null;
          estoque_minimo?: number;
          id?: string;
          ncm?: string | null;
          nome?: string;
          observacao?: string | null;
          org_id?: string;
          preco_venda?: number | null;
          tipo?: string;
          unidade?: string;
        };
        Relationships: [
          {
            foreignKeyName: "est_itens_categoria_despesa_id_fkey";
            columns: ["categoria_despesa_id"];
            isOneToOne: false;
            referencedRelation: "fin_categorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "est_itens_categoria_receita_id_fkey";
            columns: ["categoria_receita_id"];
            isOneToOne: false;
            referencedRelation: "fin_categorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "est_itens_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "est_itens_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      est_locais: {
        Row: {
          ativo: boolean;
          cliente_id: string;
          criado_em: string;
          id: string;
          nome: string;
          org_id: string;
          padrao: boolean;
        };
        Insert: {
          ativo?: boolean;
          cliente_id: string;
          criado_em?: string;
          id?: string;
          nome: string;
          org_id: string;
          padrao?: boolean;
        };
        Update: {
          ativo?: boolean;
          cliente_id?: string;
          criado_em?: string;
          id?: string;
          nome?: string;
          org_id?: string;
          padrao?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "est_locais_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "est_locais_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      est_movimentos: {
        Row: {
          cliente_id: string;
          custo_unitario: number | null;
          data: string;
          em: string;
          estornado: boolean;
          estornado_em: string | null;
          estorno_motivo: string | null;
          grupo: string | null;
          id: number;
          item_id: string;
          local_id: string;
          observacao: string | null;
          org_id: string;
          origem: string;
          origem_id: string | null;
          por: string | null;
          quantidade: number;
          tipo: string;
        };
        Insert: {
          cliente_id: string;
          custo_unitario?: number | null;
          data: string;
          em?: string;
          estornado?: boolean;
          estornado_em?: string | null;
          estorno_motivo?: string | null;
          grupo?: string | null;
          id?: never;
          item_id: string;
          local_id: string;
          observacao?: string | null;
          org_id: string;
          origem?: string;
          origem_id?: string | null;
          por?: string | null;
          quantidade: number;
          tipo: string;
        };
        Update: {
          cliente_id?: string;
          custo_unitario?: number | null;
          data?: string;
          em?: string;
          estornado?: boolean;
          estornado_em?: string | null;
          estorno_motivo?: string | null;
          grupo?: string | null;
          id?: never;
          item_id?: string;
          local_id?: string;
          observacao?: string | null;
          org_id?: string;
          origem?: string;
          origem_id?: string | null;
          por?: string | null;
          quantidade?: number;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "est_movimentos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "est_movimentos_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "est_itens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "est_movimentos_local_id_fkey";
            columns: ["local_id"];
            isOneToOne: false;
            referencedRelation: "est_locais";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "est_movimentos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      est_parametros: {
        Row: {
          atualizado_em: string;
          cliente_id: string;
          org_id: string;
          permite_negativo: boolean;
        };
        Insert: {
          atualizado_em?: string;
          cliente_id: string;
          org_id: string;
          permite_negativo?: boolean;
        };
        Update: {
          atualizado_em?: string;
          cliente_id?: string;
          org_id?: string;
          permite_negativo?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "est_parametros_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: true;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "est_parametros_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      feriados: {
        Row: {
          data: string;
          descricao: string;
          id: string;
          org_id: string | null;
        };
        Insert: {
          data: string;
          descricao: string;
          id?: string;
          org_id?: string | null;
        };
        Update: {
          data?: string;
          descricao?: string;
          id?: string;
          org_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "feriados_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fin_baixas: {
        Row: {
          cliente_id: string;
          conta_id: string;
          data: string;
          desconto: number;
          em: string;
          estornada: boolean;
          estornada_em: string | null;
          estorno_motivo: string | null;
          extrato_linha_id: number | null;
          forma: string | null;
          id: number;
          juros: number;
          multa: number;
          observacao: string | null;
          org_id: string;
          por: string | null;
          titulo_id: string;
          total: number | null;
          valor: number;
        };
        Insert: {
          cliente_id: string;
          conta_id: string;
          data: string;
          desconto?: number;
          em?: string;
          estornada?: boolean;
          estornada_em?: string | null;
          estorno_motivo?: string | null;
          extrato_linha_id?: number | null;
          forma?: string | null;
          id?: never;
          juros?: number;
          multa?: number;
          observacao?: string | null;
          org_id: string;
          por?: string | null;
          titulo_id: string;
          total?: number | null;
          valor: number;
        };
        Update: {
          cliente_id?: string;
          conta_id?: string;
          data?: string;
          desconto?: number;
          em?: string;
          estornada?: boolean;
          estornada_em?: string | null;
          estorno_motivo?: string | null;
          extrato_linha_id?: number | null;
          forma?: string | null;
          id?: never;
          juros?: number;
          multa?: number;
          observacao?: string | null;
          org_id?: string;
          por?: string | null;
          titulo_id?: string;
          total?: number | null;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fin_baixas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_baixas_conta_id_fkey";
            columns: ["conta_id"];
            isOneToOne: false;
            referencedRelation: "fin_contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_baixas_extrato_linha_id_fkey";
            columns: ["extrato_linha_id"];
            isOneToOne: false;
            referencedRelation: "fin_extrato_linhas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_baixas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_baixas_titulo_id_fkey";
            columns: ["titulo_id"];
            isOneToOne: false;
            referencedRelation: "fin_titulos";
            referencedColumns: ["id"];
          },
        ];
      };
      fin_categorias: {
        Row: {
          ativo: boolean;
          cliente_id: string;
          conta_contabil_id: string;
          criado_em: string;
          grupo: string | null;
          id: string;
          nome: string;
          org_id: string;
          tipo: string;
        };
        Insert: {
          ativo?: boolean;
          cliente_id: string;
          conta_contabil_id: string;
          criado_em?: string;
          grupo?: string | null;
          id?: string;
          nome: string;
          org_id: string;
          tipo: string;
        };
        Update: {
          ativo?: boolean;
          cliente_id?: string;
          conta_contabil_id?: string;
          criado_em?: string;
          grupo?: string | null;
          id?: string;
          nome?: string;
          org_id?: string;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fin_categorias_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_categorias_conta_contabil_id_fkey";
            columns: ["conta_contabil_id"];
            isOneToOne: false;
            referencedRelation: "fin_plano_contas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_categorias_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fin_centros_custo: {
        Row: {
          ativo: boolean;
          cliente_id: string;
          codigo: string | null;
          criado_em: string;
          id: string;
          nome: string;
          org_id: string;
        };
        Insert: {
          ativo?: boolean;
          cliente_id: string;
          codigo?: string | null;
          criado_em?: string;
          id?: string;
          nome: string;
          org_id: string;
        };
        Update: {
          ativo?: boolean;
          cliente_id?: string;
          codigo?: string | null;
          criado_em?: string;
          id?: string;
          nome?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fin_centros_custo_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_centros_custo_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fin_contas_bancarias: {
        Row: {
          agencia: string | null;
          ativo: boolean;
          banco: string | null;
          cliente_id: string;
          conta_contabil_id: string | null;
          criado_em: string;
          id: string;
          nome: string;
          numero: string | null;
          org_id: string;
          saldo_inicial: number;
          saldo_inicial_em: string | null;
        };
        Insert: {
          agencia?: string | null;
          ativo?: boolean;
          banco?: string | null;
          cliente_id: string;
          conta_contabil_id?: string | null;
          criado_em?: string;
          id?: string;
          nome: string;
          numero?: string | null;
          org_id: string;
          saldo_inicial?: number;
          saldo_inicial_em?: string | null;
        };
        Update: {
          agencia?: string | null;
          ativo?: boolean;
          banco?: string | null;
          cliente_id?: string;
          conta_contabil_id?: string | null;
          criado_em?: string;
          id?: string;
          nome?: string;
          numero?: string | null;
          org_id?: string;
          saldo_inicial?: number;
          saldo_inicial_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fin_contas_bancarias_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_contas_bancarias_conta_contabil_id_fkey";
            columns: ["conta_contabil_id"];
            isOneToOne: false;
            referencedRelation: "fin_plano_contas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_contas_bancarias_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fin_extrato_linhas: {
        Row: {
          chave: string;
          cliente_id: string;
          conta_id: string;
          criado_em: string;
          data: string;
          descricao: string;
          documento: string | null;
          fitid: string | null;
          id: number;
          lote_id: string;
          org_id: string;
          situacao: string;
          valor: number;
        };
        Insert: {
          chave: string;
          cliente_id: string;
          conta_id: string;
          criado_em?: string;
          data: string;
          descricao: string;
          documento?: string | null;
          fitid?: string | null;
          id?: never;
          lote_id: string;
          org_id: string;
          situacao?: string;
          valor: number;
        };
        Update: {
          chave?: string;
          cliente_id?: string;
          conta_id?: string;
          criado_em?: string;
          data?: string;
          descricao?: string;
          documento?: string | null;
          fitid?: string | null;
          id?: never;
          lote_id?: string;
          org_id?: string;
          situacao?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fin_extrato_linhas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_extrato_linhas_conta_id_fkey";
            columns: ["conta_id"];
            isOneToOne: false;
            referencedRelation: "fin_contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_extrato_linhas_lote_id_fkey";
            columns: ["lote_id"];
            isOneToOne: false;
            referencedRelation: "fin_extrato_lotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_extrato_linhas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fin_extrato_lotes: {
        Row: {
          arquivo: string;
          cliente_id: string;
          conta_id: string;
          em: string;
          fim: string | null;
          formato: string;
          id: string;
          inicio: string | null;
          novas: number;
          org_id: string;
          por: string | null;
          recebidas: number;
          repetidas: number;
          saldo_final: number | null;
        };
        Insert: {
          arquivo: string;
          cliente_id: string;
          conta_id: string;
          em?: string;
          fim?: string | null;
          formato: string;
          id?: string;
          inicio?: string | null;
          novas?: number;
          org_id: string;
          por?: string | null;
          recebidas?: number;
          repetidas?: number;
          saldo_final?: number | null;
        };
        Update: {
          arquivo?: string;
          cliente_id?: string;
          conta_id?: string;
          em?: string;
          fim?: string | null;
          formato?: string;
          id?: string;
          inicio?: string | null;
          novas?: number;
          org_id?: string;
          por?: string | null;
          recebidas?: number;
          repetidas?: number;
          saldo_final?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fin_extrato_lotes_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_extrato_lotes_conta_id_fkey";
            columns: ["conta_id"];
            isOneToOne: false;
            referencedRelation: "fin_contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_extrato_lotes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fin_pessoas: {
        Row: {
          ativo: boolean;
          cidade: string | null;
          cliente_id: string;
          criado_em: string;
          documento: string | null;
          email: string | null;
          id: string;
          nome: string;
          observacao: string | null;
          org_id: string;
          telefone: string | null;
          tipo: string;
          uf: string | null;
        };
        Insert: {
          ativo?: boolean;
          cidade?: string | null;
          cliente_id: string;
          criado_em?: string;
          documento?: string | null;
          email?: string | null;
          id?: string;
          nome: string;
          observacao?: string | null;
          org_id: string;
          telefone?: string | null;
          tipo: string;
          uf?: string | null;
        };
        Update: {
          ativo?: boolean;
          cidade?: string | null;
          cliente_id?: string;
          criado_em?: string;
          documento?: string | null;
          email?: string | null;
          id?: string;
          nome?: string;
          observacao?: string | null;
          org_id?: string;
          telefone?: string | null;
          tipo?: string;
          uf?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fin_pessoas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_pessoas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fin_plano_contas: {
        Row: {
          analitica: boolean;
          ativo: boolean;
          atualizado_em: string;
          classificacao: string;
          cliente_id: string;
          codigo: string | null;
          descricao: string;
          id: string;
          nivel: number;
          org_id: string;
        };
        Insert: {
          analitica?: boolean;
          ativo?: boolean;
          atualizado_em?: string;
          classificacao: string;
          cliente_id: string;
          codigo?: string | null;
          descricao: string;
          id?: string;
          nivel?: number;
          org_id: string;
        };
        Update: {
          analitica?: boolean;
          ativo?: boolean;
          atualizado_em?: string;
          classificacao?: string;
          cliente_id?: string;
          codigo?: string | null;
          descricao?: string;
          id?: string;
          nivel?: number;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fin_plano_contas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_plano_contas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fin_plano_importacoes: {
        Row: {
          arquivo: string;
          cliente_id: string;
          em: string;
          id: number;
          inativadas: number;
          novas: number;
          org_id: string;
          por: string | null;
          total: number;
        };
        Insert: {
          arquivo: string;
          cliente_id: string;
          em?: string;
          id?: never;
          inativadas: number;
          novas: number;
          org_id: string;
          por?: string | null;
          total: number;
        };
        Update: {
          arquivo?: string;
          cliente_id?: string;
          em?: string;
          id?: never;
          inativadas?: number;
          novas?: number;
          org_id?: string;
          por?: string | null;
          total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fin_plano_importacoes_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_plano_importacoes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fin_titulos: {
        Row: {
          cancelado_motivo: string | null;
          categoria_id: string;
          centro_id: string | null;
          cliente_id: string;
          conta_prevista_id: string | null;
          criado_em: string;
          descricao: string;
          documento: string | null;
          emissao: string | null;
          grupo: string | null;
          id: string;
          nota_id: string | null;
          observacao: string | null;
          org_id: string;
          parcela: number;
          parcelas: number;
          pessoa_id: string | null;
          por: string | null;
          quitado_em: string | null;
          situacao: string;
          tipo: string;
          valor: number;
          valor_pago: number;
          vencimento: string;
        };
        Insert: {
          cancelado_motivo?: string | null;
          categoria_id: string;
          centro_id?: string | null;
          cliente_id: string;
          conta_prevista_id?: string | null;
          criado_em?: string;
          descricao: string;
          documento?: string | null;
          emissao?: string | null;
          grupo?: string | null;
          id?: string;
          nota_id?: string | null;
          observacao?: string | null;
          org_id: string;
          parcela?: number;
          parcelas?: number;
          pessoa_id?: string | null;
          por?: string | null;
          quitado_em?: string | null;
          situacao?: string;
          tipo: string;
          valor: number;
          valor_pago?: number;
          vencimento: string;
        };
        Update: {
          cancelado_motivo?: string | null;
          categoria_id?: string;
          centro_id?: string | null;
          cliente_id?: string;
          conta_prevista_id?: string | null;
          criado_em?: string;
          descricao?: string;
          documento?: string | null;
          emissao?: string | null;
          grupo?: string | null;
          id?: string;
          nota_id?: string | null;
          observacao?: string | null;
          org_id?: string;
          parcela?: number;
          parcelas?: number;
          pessoa_id?: string | null;
          por?: string | null;
          quitado_em?: string | null;
          situacao?: string;
          tipo?: string;
          valor?: number;
          valor_pago?: number;
          vencimento?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fin_titulos_nota_id_fkey";
            columns: ["nota_id"];
            isOneToOne: false;
            referencedRelation: "fis_notas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_titulos_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "fin_categorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_titulos_centro_id_fkey";
            columns: ["centro_id"];
            isOneToOne: false;
            referencedRelation: "fin_centros_custo";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_titulos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_titulos_conta_prevista_id_fkey";
            columns: ["conta_prevista_id"];
            isOneToOne: false;
            referencedRelation: "fin_contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_titulos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fin_titulos_pessoa_id_fkey";
            columns: ["pessoa_id"];
            isOneToOne: false;
            referencedRelation: "fin_pessoas";
            referencedColumns: ["id"];
          },
        ];
      };
      fis_certificados: {
        Row: {
          cliente_id: string;
          cnpj: string;
          emissor: string | null;
          enviado_em: string;
          enviado_por: string | null;
          icp_brasil: boolean;
          org_id: string;
          pfx_secret: string;
          senha_secret: string;
          titular: string;
          valido_ate: string;
          valido_de: string | null;
        };
        Insert: {
          cliente_id: string;
          cnpj: string;
          emissor?: string | null;
          enviado_em?: string;
          enviado_por?: string | null;
          icp_brasil?: boolean;
          org_id: string;
          pfx_secret: string;
          senha_secret: string;
          titular: string;
          valido_ate: string;
          valido_de?: string | null;
        };
        Update: {
          cliente_id?: string;
          cnpj?: string;
          emissor?: string | null;
          enviado_em?: string;
          enviado_por?: string | null;
          icp_brasil?: boolean;
          org_id?: string;
          pfx_secret?: string;
          senha_secret?: string;
          titular?: string;
          valido_ate?: string;
          valido_de?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fis_certificados_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: true;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_certificados_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fis_depara_itens: {
        Row: {
          atualizado_em: string;
          cliente_id: string;
          codigo_fornecedor: string;
          fator: number;
          fornecedor_doc: string;
          id: string;
          item_id: string;
          org_id: string;
        };
        Insert: {
          atualizado_em?: string;
          cliente_id: string;
          codigo_fornecedor: string;
          fator?: number;
          fornecedor_doc: string;
          id?: string;
          item_id: string;
          org_id: string;
        };
        Update: {
          atualizado_em?: string;
          cliente_id?: string;
          codigo_fornecedor?: string;
          fator?: number;
          fornecedor_doc?: string;
          id?: string;
          item_id?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fis_depara_itens_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_depara_itens_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "est_itens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_depara_itens_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fis_dfe_controle: {
        Row: {
          bloqueado_ate: string | null;
          cliente_id: string;
          documentos_recebidos: number;
          em_execucao_ate: string | null;
          fonte: string;
          max_nsu: number | null;
          org_id: string;
          proxima_consulta_em: string | null;
          ult_nsu: number;
          ultima_consulta_em: string | null;
          ultimo_cstat: string | null;
          ultimo_erro: string | null;
        };
        Insert: {
          bloqueado_ate?: string | null;
          cliente_id: string;
          documentos_recebidos?: number;
          em_execucao_ate?: string | null;
          fonte: string;
          max_nsu?: number | null;
          org_id: string;
          proxima_consulta_em?: string | null;
          ult_nsu?: number;
          ultima_consulta_em?: string | null;
          ultimo_cstat?: string | null;
          ultimo_erro?: string | null;
        };
        Update: {
          bloqueado_ate?: string | null;
          cliente_id?: string;
          documentos_recebidos?: number;
          em_execucao_ate?: string | null;
          fonte?: string;
          max_nsu?: number | null;
          org_id?: string;
          proxima_consulta_em?: string | null;
          ult_nsu?: number;
          ultima_consulta_em?: string | null;
          ultimo_cstat?: string | null;
          ultimo_erro?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fis_dfe_controle_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_dfe_controle_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fis_eventos: {
        Row: {
          chave: string;
          cliente_id: string;
          cstat: string | null;
          descricao: string | null;
          em: string;
          id: number;
          justificativa: string | null;
          motivo: string | null;
          nota_id: string | null;
          org_id: string;
          origem: string;
          por: string | null;
          protocolo: string | null;
          registrado_em: string | null;
          sequencia: number;
          tp_evento: string;
          xml: string | null;
        };
        Insert: {
          chave: string;
          cliente_id: string;
          cstat?: string | null;
          descricao?: string | null;
          em?: string;
          id?: never;
          justificativa?: string | null;
          motivo?: string | null;
          nota_id?: string | null;
          org_id: string;
          origem: string;
          por?: string | null;
          protocolo?: string | null;
          registrado_em?: string | null;
          sequencia?: number;
          tp_evento: string;
          xml?: string | null;
        };
        Update: {
          chave?: string;
          cliente_id?: string;
          cstat?: string | null;
          descricao?: string | null;
          em?: string;
          id?: never;
          justificativa?: string | null;
          motivo?: string | null;
          nota_id?: string | null;
          org_id?: string;
          origem?: string;
          por?: string | null;
          protocolo?: string | null;
          registrado_em?: string | null;
          sequencia?: number;
          tp_evento?: string;
          xml?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fis_eventos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_eventos_nota_id_fkey";
            columns: ["nota_id"];
            isOneToOne: false;
            referencedRelation: "fis_notas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_eventos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fis_nota_itens: {
        Row: {
          cbs_valor: number;
          cest: string | null;
          cfop: string | null;
          cliente_id: string;
          codigo: string | null;
          cofins_cst: string | null;
          cofins_valor: number;
          desconto: number;
          descricao: string;
          fator: number;
          frete: number;
          gtin: string | null;
          ibs_valor: number;
          icms_aliquota: number;
          icms_base: number;
          icms_cst: string | null;
          icms_st_valor: number;
          icms_valor: number;
          id: number;
          ipi_valor: number;
          item_id: string | null;
          ncm: string | null;
          nota_id: string;
          numero: number;
          org_id: string;
          outros: number;
          pis_cst: string | null;
          pis_valor: number;
          quantidade: number;
          seguro: number;
          unidade: string | null;
          valor_total: number;
          valor_unitario: number;
        };
        Insert: {
          cbs_valor?: number;
          cest?: string | null;
          cfop?: string | null;
          cliente_id: string;
          codigo?: string | null;
          cofins_cst?: string | null;
          cofins_valor?: number;
          desconto?: number;
          descricao: string;
          fator?: number;
          frete?: number;
          gtin?: string | null;
          ibs_valor?: number;
          icms_aliquota?: number;
          icms_base?: number;
          icms_cst?: string | null;
          icms_st_valor?: number;
          icms_valor?: number;
          id?: never;
          ipi_valor?: number;
          item_id?: string | null;
          ncm?: string | null;
          nota_id: string;
          numero: number;
          org_id: string;
          outros?: number;
          pis_cst?: string | null;
          pis_valor?: number;
          quantidade?: number;
          seguro?: number;
          unidade?: string | null;
          valor_total?: number;
          valor_unitario?: number;
        };
        Update: {
          cbs_valor?: number;
          cest?: string | null;
          cfop?: string | null;
          cliente_id?: string;
          codigo?: string | null;
          cofins_cst?: string | null;
          cofins_valor?: number;
          desconto?: number;
          descricao?: string;
          fator?: number;
          frete?: number;
          gtin?: string | null;
          ibs_valor?: number;
          icms_aliquota?: number;
          icms_base?: number;
          icms_cst?: string | null;
          icms_st_valor?: number;
          icms_valor?: number;
          id?: never;
          ipi_valor?: number;
          item_id?: string | null;
          ncm?: string | null;
          nota_id?: string;
          numero?: number;
          org_id?: string;
          outros?: number;
          pis_cst?: string | null;
          pis_valor?: number;
          quantidade?: number;
          seguro?: number;
          unidade?: string | null;
          valor_total?: number;
          valor_unitario?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fis_nota_itens_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_nota_itens_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "est_itens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_nota_itens_nota_id_fkey";
            columns: ["nota_id"];
            isOneToOne: false;
            referencedRelation: "fis_notas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_nota_itens_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fis_notas: {
        Row: {
          atualizado_em: string;
          autorizacao: string | null;
          cbs_valor: number;
          cfop_principal: string | null;
          chave: string;
          cliente_id: string;
          cofins_valor: number;
          conteudo: string;
          criado_em: string;
          data_entrada: string | null;
          destinatario_doc: string | null;
          destinatario_nome: string | null;
          direcao: string;
          duplicatas: Json;
          emissao: string | null;
          emitente_doc: string | null;
          emitente_ie: string | null;
          emitente_nome: string | null;
          emitente_uf: string | null;
          estoque_grupo: string | null;
          ibs_valor: number;
          icms_base: number;
          icms_st_base: number;
          icms_st_valor: number;
          icms_valor: number;
          id: string;
          ipi_valor: number;
          iss_retido: boolean;
          iss_valor: number;
          manifestacao: string | null;
          manifestacao_em: string | null;
          manifestacao_protocolo: string | null;
          modelo: string;
          natureza: string | null;
          nsu: number | null;
          numero: string | null;
          org_id: string;
          origem: string;
          pessoa_id: string | null;
          pis_valor: number;
          processada: boolean;
          processada_em: string | null;
          processada_por: string | null;
          protocolo: string | null;
          retencoes: number;
          serie: string | null;
          situacao: string;
          tipo_entrada: string | null;
          tipo_nf: string | null;
          titulos: string[];
          valor_desconto: number;
          valor_frete: number;
          valor_outros: number;
          valor_produtos: number;
          valor_seguro: number;
          valor_total: number;
          xml_caminho: string | null;
        };
        Insert: {
          atualizado_em?: string;
          autorizacao?: string | null;
          cbs_valor?: number;
          cfop_principal?: string | null;
          chave: string;
          cliente_id: string;
          cofins_valor?: number;
          conteudo?: string;
          criado_em?: string;
          data_entrada?: string | null;
          destinatario_doc?: string | null;
          destinatario_nome?: string | null;
          direcao: string;
          duplicatas?: Json;
          emissao?: string | null;
          emitente_doc?: string | null;
          emitente_ie?: string | null;
          emitente_nome?: string | null;
          emitente_uf?: string | null;
          estoque_grupo?: string | null;
          ibs_valor?: number;
          icms_base?: number;
          icms_st_base?: number;
          icms_st_valor?: number;
          icms_valor?: number;
          id?: string;
          ipi_valor?: number;
          iss_retido?: boolean;
          iss_valor?: number;
          manifestacao?: string | null;
          manifestacao_em?: string | null;
          manifestacao_protocolo?: string | null;
          modelo: string;
          natureza?: string | null;
          nsu?: number | null;
          numero?: string | null;
          org_id: string;
          origem: string;
          pessoa_id?: string | null;
          pis_valor?: number;
          processada?: boolean;
          processada_em?: string | null;
          processada_por?: string | null;
          protocolo?: string | null;
          retencoes?: number;
          serie?: string | null;
          situacao?: string;
          tipo_entrada?: string | null;
          tipo_nf?: string | null;
          titulos?: string[];
          valor_desconto?: number;
          valor_frete?: number;
          valor_outros?: number;
          valor_produtos?: number;
          valor_seguro?: number;
          valor_total?: number;
          xml_caminho?: string | null;
        };
        Update: {
          atualizado_em?: string;
          autorizacao?: string | null;
          cbs_valor?: number;
          cfop_principal?: string | null;
          chave?: string;
          cliente_id?: string;
          cofins_valor?: number;
          conteudo?: string;
          criado_em?: string;
          data_entrada?: string | null;
          destinatario_doc?: string | null;
          destinatario_nome?: string | null;
          direcao?: string;
          duplicatas?: Json;
          emissao?: string | null;
          emitente_doc?: string | null;
          emitente_ie?: string | null;
          emitente_nome?: string | null;
          emitente_uf?: string | null;
          estoque_grupo?: string | null;
          ibs_valor?: number;
          icms_base?: number;
          icms_st_base?: number;
          icms_st_valor?: number;
          icms_valor?: number;
          id?: string;
          ipi_valor?: number;
          iss_retido?: boolean;
          iss_valor?: number;
          manifestacao?: string | null;
          manifestacao_em?: string | null;
          manifestacao_protocolo?: string | null;
          modelo?: string;
          natureza?: string | null;
          nsu?: number | null;
          numero?: string | null;
          org_id?: string;
          origem?: string;
          pessoa_id?: string | null;
          pis_valor?: number;
          processada?: boolean;
          processada_em?: string | null;
          processada_por?: string | null;
          protocolo?: string | null;
          retencoes?: number;
          serie?: string | null;
          situacao?: string;
          tipo_entrada?: string | null;
          tipo_nf?: string | null;
          titulos?: string[];
          valor_desconto?: number;
          valor_frete?: number;
          valor_outros?: number;
          valor_produtos?: number;
          valor_seguro?: number;
          valor_total?: number;
          xml_caminho?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fis_notas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_notas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_notas_pessoa_id_fkey";
            columns: ["pessoa_id"];
            isOneToOne: false;
            referencedRelation: "fin_pessoas";
            referencedColumns: ["id"];
          },
        ];
      };
      fis_parametros: {
        Row: {
          ambiente: string;
          atualizado_em: string;
          atualizado_por: string | null;
          captura_ativa: boolean;
          ciencia_automatica: boolean;
          cliente_id: string;
          contribuinte_icms: boolean;
          contribuinte_ipi: boolean;
          org_id: string;
        };
        Insert: {
          ambiente?: string;
          atualizado_em?: string;
          atualizado_por?: string | null;
          captura_ativa?: boolean;
          ciencia_automatica?: boolean;
          cliente_id: string;
          contribuinte_icms?: boolean;
          contribuinte_ipi?: boolean;
          org_id: string;
        };
        Update: {
          ambiente?: string;
          atualizado_em?: string;
          atualizado_por?: string | null;
          captura_ativa?: boolean;
          ciencia_automatica?: boolean;
          cliente_id?: string;
          contribuinte_icms?: boolean;
          contribuinte_ipi?: boolean;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fis_parametros_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: true;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_parametros_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fis_regras_credito: {
        Row: {
          aliquota: number | null;
          base: string | null;
          condicao: string | null;
          criado_em: string;
          cst_sem_credito: string[] | null;
          explicacao: string;
          fonte_legal: string;
          forma: string;
          id: number;
          org_id: string | null;
          regime: string;
          tipos_entrada: string[] | null;
          tributo: string;
          vigencia_fim: string | null;
          vigencia_inicio: string;
        };
        Insert: {
          aliquota?: number | null;
          base?: string | null;
          condicao?: string | null;
          criado_em?: string;
          cst_sem_credito?: string[] | null;
          explicacao: string;
          fonte_legal: string;
          forma: string;
          id?: never;
          org_id?: string | null;
          regime: string;
          tipos_entrada?: string[] | null;
          tributo: string;
          vigencia_fim?: string | null;
          vigencia_inicio: string;
        };
        Update: {
          aliquota?: number | null;
          base?: string | null;
          condicao?: string | null;
          criado_em?: string;
          cst_sem_credito?: string[] | null;
          explicacao?: string;
          fonte_legal?: string;
          forma?: string;
          id?: never;
          org_id?: string | null;
          regime?: string;
          tipos_entrada?: string[] | null;
          tributo?: string;
          vigencia_fim?: string | null;
          vigencia_inicio?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fis_regras_credito_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      fis_tipos_entrada: {
        Row: {
          ativo: boolean;
          atualizado_em: string;
          categoria_id: string | null;
          cliente_id: string | null;
          codigo: string;
          explicacao: string | null;
          gera_pagar: boolean;
          id: string;
          movimenta_estoque: boolean;
          nome: string;
          org_id: string | null;
        };
        Insert: {
          ativo?: boolean;
          atualizado_em?: string;
          categoria_id?: string | null;
          cliente_id?: string | null;
          codigo: string;
          explicacao?: string | null;
          gera_pagar: boolean;
          id?: string;
          movimenta_estoque: boolean;
          nome: string;
          org_id?: string | null;
        };
        Update: {
          ativo?: boolean;
          atualizado_em?: string;
          categoria_id?: string | null;
          cliente_id?: string | null;
          codigo?: string;
          explicacao?: string | null;
          gera_pagar?: boolean;
          id?: string;
          movimenta_estoque?: boolean;
          nome?: string;
          org_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fis_tipos_entrada_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "fin_categorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_tipos_entrada_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fis_tipos_entrada_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      historico: {
        Row: {
          acao: string;
          detalhe: Json | null;
          em: string;
          id: number;
          org_id: string;
          tarefa_id: string;
          user_id: string | null;
        };
        Insert: {
          acao: string;
          detalhe?: Json | null;
          em?: string;
          id?: number;
          org_id: string;
          tarefa_id: string;
          user_id?: string | null;
        };
        Update: {
          acao?: string;
          detalhe?: Json | null;
          em?: string;
          id?: number;
          org_id?: string;
          tarefa_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "historico_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "historico_tarefa_id_fkey";
            columns: ["tarefa_id"];
            isOneToOne: false;
            referencedRelation: "tarefas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "historico_tarefa_id_fkey";
            columns: ["tarefa_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_vencimentos";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_acessos: {
        Row: {
          app: string;
          expira_em: string | null;
          liberado_em: string;
          liberado_por: string | null;
          org_id: string;
          papel: string;
          user_id: string;
        };
        Insert: {
          app: string;
          expira_em?: string | null;
          liberado_em?: string;
          liberado_por?: string | null;
          org_id: string;
          papel: string;
          user_id: string;
        };
        Update: {
          app?: string;
          expira_em?: string | null;
          liberado_em?: string;
          liberado_por?: string | null;
          org_id?: string;
          papel?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hub_acessos_app_fkey";
            columns: ["app"];
            isOneToOne: false;
            referencedRelation: "hub_apps";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "hub_acessos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_apps: {
        Row: {
          descricao: string;
          externo: boolean;
          icone: string;
          nome: string;
          ordem: number;
          rota: string;
          slug: string;
          status: string;
        };
        Insert: {
          descricao?: string;
          externo?: boolean;
          icone?: string;
          nome: string;
          ordem?: number;
          rota: string;
          slug: string;
          status?: string;
        };
        Update: {
          descricao?: string;
          externo?: boolean;
          icone?: string;
          nome?: string;
          ordem?: number;
          rota?: string;
          slug?: string;
          status?: string;
        };
        Relationships: [];
      };
      hub_arquivos: {
        Row: {
          app: string;
          caminho: string;
          cliente_id: string | null;
          enviado_em: string;
          enviado_por: string | null;
          id: string;
          nome: string;
          org_id: string;
          ref_id: string | null;
          tamanho: number | null;
          tipo: string | null;
          visivel_cliente: boolean;
        };
        Insert: {
          app: string;
          caminho: string;
          cliente_id?: string | null;
          enviado_em?: string;
          enviado_por?: string | null;
          id?: string;
          nome: string;
          org_id: string;
          ref_id?: string | null;
          tamanho?: number | null;
          tipo?: string | null;
          visivel_cliente?: boolean;
        };
        Update: {
          app?: string;
          caminho?: string;
          cliente_id?: string | null;
          enviado_em?: string;
          enviado_por?: string | null;
          id?: string;
          nome?: string;
          org_id?: string;
          ref_id?: string | null;
          tamanho?: number | null;
          tipo?: string | null;
          visivel_cliente?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "hub_arquivos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hub_arquivos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_auditoria: {
        Row: {
          acao: string;
          alvo: string | null;
          antes: Json | null;
          app: string | null;
          depois: Json | null;
          em: string;
          id: number;
          org_id: string;
          user_id: string | null;
        };
        Insert: {
          acao: string;
          alvo?: string | null;
          antes?: Json | null;
          app?: string | null;
          depois?: Json | null;
          em?: string;
          id?: never;
          org_id: string;
          user_id?: string | null;
        };
        Update: {
          acao?: string;
          alvo?: string | null;
          antes?: Json | null;
          app?: string | null;
          depois?: Json | null;
          em?: string;
          id?: never;
          org_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "hub_auditoria_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_certificados: {
        Row: {
          documento_final: string | null;
          emissor: string | null;
          enviado_em: string;
          enviado_por: string | null;
          icp_brasil: boolean;
          org_id: string;
          pfx_secret: string;
          senha_secret: string;
          titular: string;
          valido_ate: string | null;
          valido_de: string | null;
        };
        Insert: {
          documento_final?: string | null;
          emissor?: string | null;
          enviado_em?: string;
          enviado_por?: string | null;
          icp_brasil?: boolean;
          org_id: string;
          pfx_secret: string;
          senha_secret: string;
          titular: string;
          valido_ate?: string | null;
          valido_de?: string | null;
        };
        Update: {
          documento_final?: string | null;
          emissor?: string | null;
          enviado_em?: string;
          enviado_por?: string | null;
          icp_brasil?: boolean;
          org_id?: string;
          pfx_secret?: string;
          senha_secret?: string;
          titular?: string;
          valido_ate?: string | null;
          valido_de?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "hub_certificados_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_importacoes: {
        Row: {
          arquivo: string;
          balancete_id: string | null;
          cliente_id: string | null;
          competencia: string | null;
          em: string;
          id: number;
          motivo: string | null;
          org_id: string;
          origem: string;
          por: string | null;
          resultado: string;
        };
        Insert: {
          arquivo: string;
          balancete_id?: string | null;
          cliente_id?: string | null;
          competencia?: string | null;
          em?: string;
          id?: never;
          motivo?: string | null;
          org_id: string;
          origem: string;
          por?: string | null;
          resultado: string;
        };
        Update: {
          arquivo?: string;
          balancete_id?: string | null;
          cliente_id?: string | null;
          competencia?: string | null;
          em?: string;
          id?: never;
          motivo?: string | null;
          org_id?: string;
          origem?: string;
          por?: string | null;
          resultado?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hub_importacoes_balancete_id_fkey";
            columns: ["balancete_id"];
            isOneToOne: false;
            referencedRelation: "portal_balancetes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hub_importacoes_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hub_importacoes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_integracoes: {
        Row: {
          ativo: boolean;
          atualizado_em: string;
          atualizado_por: string | null;
          config: Json;
          org_id: string;
          tipo: string;
          ultima_execucao: string | null;
          ultimo_resultado: string | null;
        };
        Insert: {
          ativo?: boolean;
          atualizado_em?: string;
          atualizado_por?: string | null;
          config?: Json;
          org_id: string;
          tipo: string;
          ultima_execucao?: string | null;
          ultimo_resultado?: string | null;
        };
        Update: {
          ativo?: boolean;
          atualizado_em?: string;
          atualizado_por?: string | null;
          config?: Json;
          org_id?: string;
          tipo?: string;
          ultima_execucao?: string | null;
          ultimo_resultado?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "hub_integracoes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_notificacoes: {
        Row: {
          app: string | null;
          criado_em: string;
          id: string;
          lida_em: string | null;
          link: string | null;
          org_id: string;
          texto: string | null;
          titulo: string;
          user_id: string;
        };
        Insert: {
          app?: string | null;
          criado_em?: string;
          id?: string;
          lida_em?: string | null;
          link?: string | null;
          org_id: string;
          texto?: string | null;
          titulo: string;
          user_id: string;
        };
        Update: {
          app?: string | null;
          criado_em?: string;
          id?: string;
          lida_em?: string | null;
          link?: string | null;
          org_id?: string;
          texto?: string | null;
          titulo?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hub_notificacoes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_perfis: {
        Row: {
          apps: Json;
          id: string;
          nome: string;
          org_id: string;
        };
        Insert: {
          apps?: Json;
          id?: string;
          nome: string;
          org_id: string;
        };
        Update: {
          apps?: Json;
          id?: string;
          nome?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hub_perfis_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      membros: {
        Row: {
          ativo: boolean;
          criado_em: string;
          email: string | null;
          nome: string;
          org_id: string;
          papel: Database["public"]["Enums"]["papel_membro"];
          perfil_id: string | null;
          setor_id: string | null;
          user_id: string;
        };
        Insert: {
          ativo?: boolean;
          criado_em?: string;
          email?: string | null;
          nome: string;
          org_id: string;
          papel?: Database["public"]["Enums"]["papel_membro"];
          perfil_id?: string | null;
          setor_id?: string | null;
          user_id: string;
        };
        Update: {
          ativo?: boolean;
          criado_em?: string;
          email?: string | null;
          nome?: string;
          org_id?: string;
          papel?: Database["public"]["Enums"]["papel_membro"];
          perfil_id?: string | null;
          setor_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membros_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "membros_org_id_setor_id_fkey";
            columns: ["org_id", "setor_id"];
            isOneToOne: false;
            referencedRelation: "setores";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "membros_org_id_setor_id_fkey";
            columns: ["org_id", "setor_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_setores";
            referencedColumns: ["org_id", "setor_id"];
          },
          {
            foreignKeyName: "membros_perfil_id_fkey";
            columns: ["perfil_id"];
            isOneToOne: false;
            referencedRelation: "hub_perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      modelos_recorrentes: {
        Row: {
          ajuste: Database["public"]["Enums"]["ajuste_vencimento"];
          ativo: boolean;
          criado_em: string;
          descricao: string | null;
          dia_vencimento: number;
          grupos: string[] | null;
          id: string;
          meses: number[] | null;
          meses_apos_competencia: number;
          org_id: string;
          por_cliente: boolean;
          prioridade: Database["public"]["Enums"]["prioridade"];
          regimes: string[] | null;
          segmentos: string[] | null;
          setor_id: string | null;
          titulo: string;
          visivel_cliente: boolean;
        };
        Insert: {
          ajuste?: Database["public"]["Enums"]["ajuste_vencimento"];
          ativo?: boolean;
          criado_em?: string;
          descricao?: string | null;
          dia_vencimento: number;
          grupos?: string[] | null;
          id?: string;
          meses?: number[] | null;
          meses_apos_competencia?: number;
          org_id: string;
          por_cliente?: boolean;
          prioridade?: Database["public"]["Enums"]["prioridade"];
          regimes?: string[] | null;
          segmentos?: string[] | null;
          setor_id?: string | null;
          titulo: string;
          visivel_cliente?: boolean;
        };
        Update: {
          ajuste?: Database["public"]["Enums"]["ajuste_vencimento"];
          ativo?: boolean;
          criado_em?: string;
          descricao?: string | null;
          dia_vencimento?: number;
          grupos?: string[] | null;
          id?: string;
          meses?: number[] | null;
          meses_apos_competencia?: number;
          org_id?: string;
          por_cliente?: boolean;
          prioridade?: Database["public"]["Enums"]["prioridade"];
          regimes?: string[] | null;
          segmentos?: string[] | null;
          setor_id?: string | null;
          titulo?: string;
          visivel_cliente?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "modelos_recorrentes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "modelos_recorrentes_org_id_setor_id_fkey";
            columns: ["org_id", "setor_id"];
            isOneToOne: false;
            referencedRelation: "setores";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "modelos_recorrentes_org_id_setor_id_fkey";
            columns: ["org_id", "setor_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_setores";
            referencedColumns: ["org_id", "setor_id"];
          },
        ];
      };
      organizacoes: {
        Row: {
          ativo: boolean;
          cnpj: string | null;
          cor_destaque: string;
          cor_primaria: string;
          criado_em: string;
          fuso: string;
          id: string;
          logo_url: string | null;
          nome: string;
          plano: string;
          slug: string;
        };
        Insert: {
          ativo?: boolean;
          cnpj?: string | null;
          cor_destaque?: string;
          cor_primaria?: string;
          criado_em?: string;
          fuso?: string;
          id?: string;
          logo_url?: string | null;
          nome: string;
          plano?: string;
          slug: string;
        };
        Update: {
          ativo?: boolean;
          cnpj?: string | null;
          cor_destaque?: string;
          cor_primaria?: string;
          criado_em?: string;
          fuso?: string;
          id?: string;
          logo_url?: string | null;
          nome?: string;
          plano?: string;
          slug?: string;
        };
        Relationships: [];
      };
      portal_balancete_linhas: {
        Row: {
          analitica: boolean;
          balancete_id: string;
          classificacao: string;
          codigo: string | null;
          creditos: number;
          debitos: number;
          descricao: string;
          grupo: string | null;
          id: number;
          nivel: number;
          org_id: string;
          saldo_anterior: number;
          saldo_atual: number;
        };
        Insert: {
          analitica?: boolean;
          balancete_id: string;
          classificacao: string;
          codigo?: string | null;
          creditos?: number;
          debitos?: number;
          descricao: string;
          grupo?: string | null;
          id?: never;
          nivel?: number;
          org_id: string;
          saldo_anterior?: number;
          saldo_atual?: number;
        };
        Update: {
          analitica?: boolean;
          balancete_id?: string;
          classificacao?: string;
          codigo?: string | null;
          creditos?: number;
          debitos?: number;
          descricao?: string;
          grupo?: string | null;
          id?: never;
          nivel?: number;
          org_id?: string;
          saldo_anterior?: number;
          saldo_atual?: number;
        };
        Relationships: [
          {
            foreignKeyName: "portal_balancete_linhas_balancete_id_fkey";
            columns: ["balancete_id"];
            isOneToOne: false;
            referencedRelation: "portal_balancetes";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_balancetes: {
        Row: {
          alertas: Json;
          arquivo_nome: string | null;
          cliente_id: string;
          comentario: string | null;
          competencia: string;
          conferencias: Json;
          demonstracoes: Json | null;
          id: string;
          importado_em: string;
          importado_por: string | null;
          indices: Json;
          org_id: string;
          periodo_fim: string | null;
          periodo_inicio: string | null;
          publicado_em: string | null;
          publicado_por: string | null;
          resumo: Json;
          status: string;
        };
        Insert: {
          alertas?: Json;
          arquivo_nome?: string | null;
          cliente_id: string;
          comentario?: string | null;
          competencia: string;
          conferencias?: Json;
          demonstracoes?: Json | null;
          id?: string;
          importado_em?: string;
          importado_por?: string | null;
          indices?: Json;
          org_id: string;
          periodo_fim?: string | null;
          periodo_inicio?: string | null;
          publicado_em?: string | null;
          publicado_por?: string | null;
          resumo?: Json;
          status?: string;
        };
        Update: {
          alertas?: Json;
          arquivo_nome?: string | null;
          cliente_id?: string;
          comentario?: string | null;
          competencia?: string;
          conferencias?: Json;
          demonstracoes?: Json | null;
          id?: string;
          importado_em?: string;
          importado_por?: string | null;
          indices?: Json;
          org_id?: string;
          periodo_fim?: string | null;
          periodo_inicio?: string | null;
          publicado_em?: string | null;
          publicado_por?: string | null;
          resumo?: Json;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_balancetes_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_balancetes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_conversas: {
        Row: {
          aberto_por: string | null;
          assunto: string;
          atualizado_em: string;
          avaliacao: number | null;
          cliente_id: string;
          criado_em: string;
          id: string;
          org_id: string;
          prazo_resposta: string | null;
          processo_id: string | null;
          resolvida_em: string | null;
          respondida_em: string | null;
          responsavel_id: string | null;
          setor_id: string | null;
          status: string;
          tarefa_id: string | null;
          titulo: string;
        };
        Insert: {
          aberto_por?: string | null;
          assunto: string;
          atualizado_em?: string;
          avaliacao?: number | null;
          cliente_id: string;
          criado_em?: string;
          id?: string;
          org_id: string;
          prazo_resposta?: string | null;
          processo_id?: string | null;
          resolvida_em?: string | null;
          respondida_em?: string | null;
          responsavel_id?: string | null;
          setor_id?: string | null;
          status?: string;
          tarefa_id?: string | null;
          titulo: string;
        };
        Update: {
          aberto_por?: string | null;
          assunto?: string;
          atualizado_em?: string;
          avaliacao?: number | null;
          cliente_id?: string;
          criado_em?: string;
          id?: string;
          org_id?: string;
          prazo_resposta?: string | null;
          processo_id?: string | null;
          resolvida_em?: string | null;
          respondida_em?: string | null;
          responsavel_id?: string | null;
          setor_id?: string | null;
          status?: string;
          tarefa_id?: string | null;
          titulo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_conversas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_conversas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_conversas_processo_id_fkey";
            columns: ["processo_id"];
            isOneToOne: false;
            referencedRelation: "soc_processos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_conversas_setor_id_fkey";
            columns: ["setor_id"];
            isOneToOne: false;
            referencedRelation: "setores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_conversas_setor_id_fkey";
            columns: ["setor_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_setores";
            referencedColumns: ["setor_id"];
          },
          {
            foreignKeyName: "portal_conversas_tarefa_id_fkey";
            columns: ["tarefa_id"];
            isOneToOne: false;
            referencedRelation: "tarefas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_conversas_tarefa_id_fkey";
            columns: ["tarefa_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_vencimentos";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_convites: {
        Row: {
          cliente_id: string;
          criado_em: string;
          email: string;
          nome: string | null;
          org_id: string;
          permissoes: string[];
        };
        Insert: {
          cliente_id: string;
          criado_em?: string;
          email: string;
          nome?: string | null;
          org_id: string;
          permissoes?: string[];
        };
        Update: {
          cliente_id?: string;
          criado_em?: string;
          email?: string;
          nome?: string | null;
          org_id?: string;
          permissoes?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "portal_convites_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_convites_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_mapa_contas: {
        Row: {
          classificacao: string;
          cliente_id: string | null;
          grupo: string;
          id: string;
          org_id: string;
        };
        Insert: {
          classificacao: string;
          cliente_id?: string | null;
          grupo: string;
          id?: string;
          org_id: string;
        };
        Update: {
          classificacao?: string;
          cliente_id?: string | null;
          grupo?: string;
          id?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_mapa_contas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_mapa_contas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_mapa_dfc: {
        Row: {
          classificacao: string;
          cliente_id: string | null;
          criado_em: string;
          criado_por: string | null;
          id: number;
          linha: string;
          org_id: string;
        };
        Insert: {
          classificacao: string;
          cliente_id?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          id?: never;
          linha: string;
          org_id: string;
        };
        Update: {
          classificacao?: string;
          cliente_id?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          id?: never;
          linha?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_mapa_dfc_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_mapa_dfc_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_mensagens: {
        Row: {
          anexo_id: string | null;
          autor_id: string | null;
          autor_nome: string | null;
          autor_tipo: string;
          conversa_id: string;
          criado_em: string;
          id: string;
          interna: boolean;
          org_id: string;
          texto: string;
        };
        Insert: {
          anexo_id?: string | null;
          autor_id?: string | null;
          autor_nome?: string | null;
          autor_tipo?: string;
          conversa_id: string;
          criado_em?: string;
          id?: string;
          interna?: boolean;
          org_id: string;
          texto?: string;
        };
        Update: {
          anexo_id?: string | null;
          autor_id?: string | null;
          autor_nome?: string | null;
          autor_tipo?: string;
          conversa_id?: string;
          criado_em?: string;
          id?: string;
          interna?: boolean;
          org_id?: string;
          texto?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_mensagens_anexo_id_fkey";
            columns: ["anexo_id"];
            isOneToOne: false;
            referencedRelation: "hub_arquivos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_mensagens_conversa_id_fkey";
            columns: ["conversa_id"];
            isOneToOne: false;
            referencedRelation: "portal_conversas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_mensagens_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_pareceres: {
        Row: {
          balancete_id: string;
          cliente_id: string;
          contador_crc: string | null;
          contador_nome: string | null;
          criado_em: string;
          criado_por: string | null;
          id: string;
          org_id: string;
          publicado_em: string | null;
          status: string;
          texto: string;
          versao: number;
        };
        Insert: {
          balancete_id: string;
          cliente_id: string;
          contador_crc?: string | null;
          contador_nome?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          id?: string;
          org_id: string;
          publicado_em?: string | null;
          status?: string;
          texto: string;
          versao?: number;
        };
        Update: {
          balancete_id?: string;
          cliente_id?: string;
          contador_crc?: string | null;
          contador_nome?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          id?: string;
          org_id?: string;
          publicado_em?: string | null;
          status?: string;
          texto?: string;
          versao?: number;
        };
        Relationships: [
          {
            foreignKeyName: "portal_pareceres_balancete_id_fkey";
            columns: ["balancete_id"];
            isOneToOne: false;
            referencedRelation: "portal_balancetes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_pareceres_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_pareceres_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_usuarios: {
        Row: {
          ativo: boolean;
          cliente_id: string;
          criado_em: string;
          email: string;
          nome: string;
          org_id: string;
          permissoes: string[];
          user_id: string;
        };
        Insert: {
          ativo?: boolean;
          cliente_id: string;
          criado_em?: string;
          email: string;
          nome: string;
          org_id: string;
          permissoes?: string[];
          user_id: string;
        };
        Update: {
          ativo?: boolean;
          cliente_id?: string;
          criado_em?: string;
          email?: string;
          nome?: string;
          org_id?: string;
          permissoes?: string[];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portal_usuarios_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portal_usuarios_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      setores: {
        Row: {
          ativo: boolean;
          cor: string;
          id: string;
          nome: string;
          ordem: number;
          org_id: string;
        };
        Insert: {
          ativo?: boolean;
          cor?: string;
          id?: string;
          nome: string;
          ordem?: number;
          org_id: string;
        };
        Update: {
          ativo?: boolean;
          cor?: string;
          id?: string;
          nome?: string;
          ordem?: number;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "setores_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      soc_eventos: {
        Row: {
          em: string;
          id: number;
          org_id: string;
          processo_id: string;
          texto: string;
          tipo: string;
          user_id: string | null;
          visivel_cliente: boolean;
        };
        Insert: {
          em?: string;
          id?: never;
          org_id: string;
          processo_id: string;
          texto: string;
          tipo: string;
          user_id?: string | null;
          visivel_cliente?: boolean;
        };
        Update: {
          em?: string;
          id?: never;
          org_id?: string;
          processo_id?: string;
          texto?: string;
          tipo?: string;
          user_id?: string | null;
          visivel_cliente?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "soc_eventos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "soc_eventos_processo_id_fkey";
            columns: ["processo_id"];
            isOneToOne: false;
            referencedRelation: "soc_processos";
            referencedColumns: ["id"];
          },
        ];
      };
      soc_exigencias: {
        Row: {
          criado_em: string;
          data: string;
          id: string;
          org_id: string;
          orgao: string;
          processo_id: string;
          reprotocolo_em: string | null;
          resposta: string | null;
          texto: string;
        };
        Insert: {
          criado_em?: string;
          data?: string;
          id?: string;
          org_id: string;
          orgao: string;
          processo_id: string;
          reprotocolo_em?: string | null;
          resposta?: string | null;
          texto: string;
        };
        Update: {
          criado_em?: string;
          data?: string;
          id?: string;
          org_id?: string;
          orgao?: string;
          processo_id?: string;
          reprotocolo_em?: string | null;
          resposta?: string | null;
          texto?: string;
        };
        Relationships: [
          {
            foreignKeyName: "soc_exigencias_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "soc_exigencias_processo_id_fkey";
            columns: ["processo_id"];
            isOneToOne: false;
            referencedRelation: "soc_processos";
            referencedColumns: ["id"];
          },
        ];
      };
      soc_fases: {
        Row: {
          codigo: string;
          fim_em: string | null;
          id: string;
          inicio_em: string | null;
          mudou_em: string;
          nome: string;
          ordem: number;
          org_id: string;
          prazo_dias: number | null;
          prazo_em: string | null;
          processo_id: string;
          responsavel_id: string | null;
          status: string;
          tarefa_id: string | null;
        };
        Insert: {
          codigo: string;
          fim_em?: string | null;
          id?: string;
          inicio_em?: string | null;
          mudou_em?: string;
          nome: string;
          ordem: number;
          org_id: string;
          prazo_dias?: number | null;
          prazo_em?: string | null;
          processo_id: string;
          responsavel_id?: string | null;
          status?: string;
          tarefa_id?: string | null;
        };
        Update: {
          codigo?: string;
          fim_em?: string | null;
          id?: string;
          inicio_em?: string | null;
          mudou_em?: string;
          nome?: string;
          ordem?: number;
          org_id?: string;
          prazo_dias?: number | null;
          prazo_em?: string | null;
          processo_id?: string;
          responsavel_id?: string | null;
          status?: string;
          tarefa_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "soc_fases_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "soc_fases_processo_id_fkey";
            columns: ["processo_id"];
            isOneToOne: false;
            referencedRelation: "soc_processos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "soc_fases_tarefa_id_fkey";
            columns: ["tarefa_id"];
            isOneToOne: false;
            referencedRelation: "tarefas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "soc_fases_tarefa_id_fkey";
            columns: ["tarefa_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_vencimentos";
            referencedColumns: ["id"];
          },
        ];
      };
      soc_processos: {
        Row: {
          atualizado_em: string;
          cliente_id: string | null;
          cnpj: string | null;
          concluido_em: string | null;
          criado_em: string;
          criado_por: string | null;
          descricao: string | null;
          exigencias: number;
          fase_atual: number;
          futuro_cliente: string | null;
          id: string;
          numero: number;
          org_id: string;
          pedido_em: string;
          previsao_em: string | null;
          responsavel_id: string | null;
          status: string;
          tipo_id: string;
          uf: string | null;
          visivel_cliente: boolean;
        };
        Insert: {
          atualizado_em?: string;
          cliente_id?: string | null;
          cnpj?: string | null;
          concluido_em?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          descricao?: string | null;
          exigencias?: number;
          fase_atual?: number;
          futuro_cliente?: string | null;
          id?: string;
          numero: number;
          org_id: string;
          pedido_em?: string;
          previsao_em?: string | null;
          responsavel_id?: string | null;
          status?: string;
          tipo_id: string;
          uf?: string | null;
          visivel_cliente?: boolean;
        };
        Update: {
          atualizado_em?: string;
          cliente_id?: string | null;
          cnpj?: string | null;
          concluido_em?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          descricao?: string | null;
          exigencias?: number;
          fase_atual?: number;
          futuro_cliente?: string | null;
          id?: string;
          numero?: number;
          org_id?: string;
          pedido_em?: string;
          previsao_em?: string | null;
          responsavel_id?: string | null;
          status?: string;
          tipo_id?: string;
          uf?: string | null;
          visivel_cliente?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "soc_processos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "soc_processos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "soc_processos_tipo_id_fkey";
            columns: ["tipo_id"];
            isOneToOne: false;
            referencedRelation: "soc_tipos";
            referencedColumns: ["id"];
          },
        ];
      };
      soc_protocolos: {
        Row: {
          criado_em: string;
          data: string;
          id: string;
          link: string | null;
          numero: string;
          org_id: string;
          orgao: string;
          processo_id: string;
        };
        Insert: {
          criado_em?: string;
          data?: string;
          id?: string;
          link?: string | null;
          numero: string;
          org_id: string;
          orgao: string;
          processo_id: string;
        };
        Update: {
          criado_em?: string;
          data?: string;
          id?: string;
          link?: string | null;
          numero?: string;
          org_id?: string;
          orgao?: string;
          processo_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "soc_protocolos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "soc_protocolos_processo_id_fkey";
            columns: ["processo_id"];
            isOneToOne: false;
            referencedRelation: "soc_processos";
            referencedColumns: ["id"];
          },
        ];
      };
      soc_taxas: {
        Row: {
          criado_em: string;
          descricao: string;
          id: string;
          org_id: string;
          pago_em: string | null;
          pago_por: string | null;
          processo_id: string;
          valor: number | null;
          vencimento: string | null;
        };
        Insert: {
          criado_em?: string;
          descricao: string;
          id?: string;
          org_id: string;
          pago_em?: string | null;
          pago_por?: string | null;
          processo_id: string;
          valor?: number | null;
          vencimento?: string | null;
        };
        Update: {
          criado_em?: string;
          descricao?: string;
          id?: string;
          org_id?: string;
          pago_em?: string | null;
          pago_por?: string | null;
          processo_id?: string;
          valor?: number | null;
          vencimento?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "soc_taxas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "soc_taxas_processo_id_fkey";
            columns: ["processo_id"];
            isOneToOne: false;
            referencedRelation: "soc_processos";
            referencedColumns: ["id"];
          },
        ];
      };
      soc_tipos: {
        Row: {
          ativo: boolean;
          codigo: string;
          fases: Json;
          id: string;
          nome: string;
          ordem: number;
          org_id: string;
        };
        Insert: {
          ativo?: boolean;
          codigo: string;
          fases: Json;
          id?: string;
          nome: string;
          ordem?: number;
          org_id: string;
        };
        Update: {
          ativo?: boolean;
          codigo?: string;
          fases?: Json;
          id?: string;
          nome?: string;
          ordem?: number;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "soc_tipos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      tarefas: {
        Row: {
          atualizado_em: string;
          cancelada_por_inativacao: boolean;
          cliente_id: string | null;
          competencia: string | null;
          concluida_em: string | null;
          criado_em: string;
          criado_por: string | null;
          descricao: string | null;
          id: string;
          modelo_id: string | null;
          org_id: string;
          pendencia_cliente: string | null;
          prazo: string | null;
          prioridade: Database["public"]["Enums"]["prioridade"];
          responsavel_id: string | null;
          setor_id: string | null;
          status: Database["public"]["Enums"]["status_tarefa"];
          titulo: string;
          visivel_cliente: boolean | null;
        };
        Insert: {
          atualizado_em?: string;
          cancelada_por_inativacao?: boolean;
          cliente_id?: string | null;
          competencia?: string | null;
          concluida_em?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          descricao?: string | null;
          id?: string;
          modelo_id?: string | null;
          org_id: string;
          pendencia_cliente?: string | null;
          prazo?: string | null;
          prioridade?: Database["public"]["Enums"]["prioridade"];
          responsavel_id?: string | null;
          setor_id?: string | null;
          status?: Database["public"]["Enums"]["status_tarefa"];
          titulo: string;
          visivel_cliente?: boolean | null;
        };
        Update: {
          atualizado_em?: string;
          cancelada_por_inativacao?: boolean;
          cliente_id?: string | null;
          competencia?: string | null;
          concluida_em?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          descricao?: string | null;
          id?: string;
          modelo_id?: string | null;
          org_id?: string;
          pendencia_cliente?: string | null;
          prazo?: string | null;
          prioridade?: Database["public"]["Enums"]["prioridade"];
          responsavel_id?: string | null;
          setor_id?: string | null;
          status?: Database["public"]["Enums"]["status_tarefa"];
          titulo?: string;
          visivel_cliente?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "tarefas_org_id_cliente_id_fkey";
            columns: ["org_id", "cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "tarefas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tarefas_org_id_modelo_id_fkey";
            columns: ["org_id", "modelo_id"];
            isOneToOne: false;
            referencedRelation: "modelos_recorrentes";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "tarefas_org_id_responsavel_id_fkey";
            columns: ["org_id", "responsavel_id"];
            isOneToOne: false;
            referencedRelation: "membros";
            referencedColumns: ["org_id", "user_id"];
          },
          {
            foreignKeyName: "tarefas_org_id_responsavel_id_fkey";
            columns: ["org_id", "responsavel_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_responsaveis";
            referencedColumns: ["org_id", "user_id"];
          },
          {
            foreignKeyName: "tarefas_org_id_setor_id_fkey";
            columns: ["org_id", "setor_id"];
            isOneToOne: false;
            referencedRelation: "setores";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "tarefas_org_id_setor_id_fkey";
            columns: ["org_id", "setor_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_setores";
            referencedColumns: ["org_id", "setor_id"];
          },
        ];
      };
      venc_itens: {
        Row: {
          avisos: number[];
          cliente_id: string | null;
          criado_em: string;
          criado_por: string | null;
          descricao: string | null;
          id: string;
          observacao: string | null;
          org_id: string;
          responsavel_id: string | null;
          status: string;
          substituido_por: string | null;
          tarefa_id: string | null;
          tipo: string;
          vence_em: string;
          visivel_cliente: boolean;
        };
        Insert: {
          avisos?: number[];
          cliente_id?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          descricao?: string | null;
          id?: string;
          observacao?: string | null;
          org_id: string;
          responsavel_id?: string | null;
          status?: string;
          substituido_por?: string | null;
          tarefa_id?: string | null;
          tipo: string;
          vence_em: string;
          visivel_cliente?: boolean;
        };
        Update: {
          avisos?: number[];
          cliente_id?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          descricao?: string | null;
          id?: string;
          observacao?: string | null;
          org_id?: string;
          responsavel_id?: string | null;
          status?: string;
          substituido_por?: string | null;
          tarefa_id?: string | null;
          tipo?: string;
          vence_em?: string;
          visivel_cliente?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "venc_itens_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venc_itens_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venc_itens_substituido_por_fkey";
            columns: ["substituido_por"];
            isOneToOne: false;
            referencedRelation: "venc_itens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venc_itens_tarefa_id_fkey";
            columns: ["tarefa_id"];
            isOneToOne: false;
            referencedRelation: "tarefas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venc_itens_tarefa_id_fkey";
            columns: ["tarefa_id"];
            isOneToOne: false;
            referencedRelation: "vw_painel_vencimentos";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      est_saldos: {
        Row: {
          cliente_id: string | null;
          item_id: string | null;
          local_id: string | null;
          saldo: number | null;
          ultimo_movimento: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "est_movimentos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "est_movimentos_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "est_itens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "est_movimentos_local_id_fkey";
            columns: ["local_id"];
            isOneToOne: false;
            referencedRelation: "est_locais";
            referencedColumns: ["id"];
          },
        ];
      };
      vw_painel_kpis: {
        Row: {
          abertas: number | null;
          atrasadas: number | null;
          concluidas_hoje: number | null;
          concluidas_mes: number | null;
          em_andamento: number | null;
          org_id: string | null;
          pct_no_prazo_mes: number | null;
          proximos_7_dias: number | null;
          vencem_hoje: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tarefas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      vw_painel_responsaveis: {
        Row: {
          abertas: number | null;
          atrasadas: number | null;
          concluidas_mes: number | null;
          nome: string | null;
          org_id: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "membros_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      vw_painel_setores: {
        Row: {
          abertas: number | null;
          atrasadas: number | null;
          concluidas_mes: number | null;
          cor: string | null;
          nome: string | null;
          ordem: number | null;
          org_id: string | null;
          setor_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "setores_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
      vw_painel_vencimentos: {
        Row: {
          cliente: string | null;
          cliente_curto: string | null;
          dias: number | null;
          id: string | null;
          org_id: string | null;
          prazo: string | null;
          prioridade: Database["public"]["Enums"]["prioridade"] | null;
          responsavel: string | null;
          setor: string | null;
          setor_cor: string | null;
          status: Database["public"]["Enums"]["status_tarefa"] | null;
          titulo: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tarefas_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizacoes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      adicionar_membro: {
        Args: {
          p_email: string;
          p_nome: string;
          p_org: string;
          p_papel?: Database["public"]["Enums"]["papel_membro"];
          p_setor?: string;
        };
        Returns: string;
      };
      agente_token_confere: { Args: { p_token: string }; Returns: boolean };
      cancelar_convite: {
        Args: { p_email: string; p_org: string };
        Returns: undefined;
      };
      cert_obter: {
        Args: { p_org: string };
        Returns: {
          emissor: string;
          pfx: string;
          senha: string;
          titular: string;
          valido_ate: string;
        }[];
      };
      cert_remover: {
        Args: { p_org: string; p_user?: string };
        Returns: undefined;
      };
      cert_salvar: {
        Args: {
          p_info: Json;
          p_org: string;
          p_pfx: string;
          p_senha: string;
          p_user: string;
        };
        Returns: undefined;
      };
      convites_pendentes: {
        Args: { p_org: string };
        Returns: {
          criado_em: string;
          email: string;
          nome: string;
          papel: Database["public"]["Enums"]["papel_membro"];
          setor_id: string;
        }[];
      };
      criar_organizacao: {
        Args: { p_nome: string; p_nome_usuario: string; p_slug: string };
        Returns: string;
      };
      crm_arquivar: {
        Args: { p_arquivar?: boolean; p_ids: string[]; p_motivo: string };
        Returns: number;
      };
      crm_converter_cliente: { Args: { p_op: string }; Returns: string };
      crm_receber_lead: { Args: { p: Json }; Returns: undefined };
      est_definir_negativo: {
        Args: { p_cliente: string; p_permite: boolean };
        Returns: undefined;
      };
      est_estornar_movimento: {
        Args: { p_motivo: string; p_mov: number };
        Returns: undefined;
      };
      est_movimentar: { Args: { p: Json }; Returns: Json };
      fin_baixar: {
        Args: {
          p_conta: string;
          p_data: string;
          p_desconto?: number;
          p_forma?: string;
          p_juros?: number;
          p_multa?: number;
          p_obs?: string;
          p_titulo: string;
          p_valor: number;
        };
        Returns: Json;
      };
      fin_cancelar_titulo: {
        Args: { p_motivo: string; p_titulo: string };
        Returns: undefined;
      };
      fin_desfazer_lote: { Args: { p_lote: string }; Returns: Json };
      fin_estornar_baixa: {
        Args: { p_baixa: number; p_motivo: string };
        Returns: Json;
      };
      fin_importar_extrato: {
        Args: {
          p_arquivo: string;
          p_conta: string;
          p_fim: string;
          p_formato: string;
          p_inicio: string;
          p_linhas: Json;
          p_saldo_final: number;
        };
        Returns: Json;
      };
      fin_importar_plano: {
        Args: { p_arquivo: string; p_cliente: string; p_contas: Json };
        Returns: Json;
      };
      fin_lancar: { Args: { p: Json }; Returns: Json };
      fis_desfazer_lancamento: {
        Args: { p_motivo: string; p_nota: string };
        Returns: undefined;
      };
      fis_pode: { Args: { p_cliente: string; p_nivel?: string }; Returns: boolean };
      fis_pode_certificado: { Args: { p_cliente: string }; Returns: boolean };
      fis_processar_nota: { Args: { p: Json }; Returns: Json };
      fis_registrar_upload: { Args: { p: Json }; Returns: Json };
      fis_salvar_parametros: {
        Args: { p: Json; p_cliente: string };
        Returns: undefined;
      };
      fis_salvar_tipo_entrada: { Args: { p: Json }; Returns: string };
      gerar_competencia: {
        Args: { p_competencia: string; p_org: string };
        Returns: number;
      };
      hub_aplicar_perfil: {
        Args: { p_org: string; p_perfil: string; p_user: string };
        Returns: number;
      };
      hub_cancelar_convite: {
        Args: { p_email: string; p_org: string };
        Returns: undefined;
      };
      hub_conta_existe: { Args: { p_email: string }; Returns: boolean };
      hub_convidar: {
        Args: {
          p_email: string;
          p_nome: string;
          p_org: string;
          p_papel: Database["public"]["Enums"]["papel_membro"];
          p_perfil: string;
          p_setor: string;
        };
        Returns: string;
      };
      hub_definir_acesso: {
        Args: {
          p_app: string;
          p_expira?: string;
          p_org: string;
          p_papel: string;
          p_user: string;
        };
        Returns: undefined;
      };
      hub_definir_perfil: {
        Args: { p_org: string; p_perfil: string; p_user: string };
        Returns: undefined;
      };
      hub_editar_membro: {
        Args: {
          p_ativo: boolean;
          p_nome: string;
          p_org: string;
          p_papel: Database["public"]["Enums"]["papel_membro"];
          p_perfil: string;
          p_setor: string;
          p_user: string;
        };
        Returns: undefined;
      };
      hub_ler_arquivo_temp: { Args: { p_chave: string }; Returns: string };
      hub_meus_apps: {
        Args: { p_org: string };
        Returns: {
          descricao: string;
          externo: boolean;
          icone: string;
          nome: string;
          ordem: number;
          papel: string;
          rota: string;
          slug: string;
          status: string;
        }[];
      };
      hub_pendencias_membro: {
        Args: { p_org: string; p_user: string };
        Returns: Json;
      };
      hub_pode_enviar_convite: { Args: { p_email: string }; Returns: boolean };
      hub_pode_ver_link_convite: { Args: { p_email: string }; Returns: boolean };
      hub_receber_arquivo_temp: {
        Args: { p_chave: string; p_dados: string };
        Returns: boolean;
      };
      hub_situacao_contas: {
        Args: { p_org: string };
        Returns: {
          confirmado: boolean;
          ultimo_acesso: string;
          user_id: string;
        }[];
      };
      hub_transferir_trabalho: {
        Args: {
          p_carteira?: boolean;
          p_de: string;
          p_org: string;
          p_para: string;
        };
        Returns: Json;
      };
      importar_clientes: {
        Args: { p_atualizar?: boolean; p_linhas: Json; p_org: string };
        Returns: Json;
      };
      inativar_cliente: {
        Args: { p_cliente: string; p_data: string; p_motivo?: string };
        Returns: Json;
      };
      portal_abrir_conversa: {
        Args: {
          p_assunto: string;
          p_cliente: string;
          p_texto: string;
          p_titulo: string;
        };
        Returns: string;
      };
      portal_conversa_para_tarefa: {
        Args: { p_conversa: string; p_prazo?: string };
        Returns: string;
      };
      portal_convidar: {
        Args: {
          p_cliente: string;
          p_email: string;
          p_nome: string;
          p_permissoes?: string[];
        };
        Returns: string;
      };
      portal_gravar_balancete: {
        Args: {
          p_analise: Json;
          p_arquivo: string;
          p_cliente: string;
          p_competencia: string;
          p_linhas: Json;
          p_org: string;
          p_origem?: string;
        };
        Returns: string;
      };
      portal_minhas_empresas: {
        Args: never;
        Returns: {
          cliente_id: string;
          cnpj: string;
          cor_destaque: string;
          cor_primaria: string;
          logo_url: string;
          nome_fantasia: string;
          org_id: string;
          org_nome: string;
          permissoes: string[];
          razao_social: string;
          regime: string;
          uf: string;
        }[];
      };
      portal_processos: {
        Args: { p_cliente: string };
        Returns: {
          concluido_em: string;
          descricao: string;
          eventos: Json;
          fase: string;
          fase_status: string;
          numero: number;
          pedido_em: string;
          previsao_em: string;
          processo_id: string;
          status: string;
          tipo: string;
        }[];
      };
      portal_publicar_balancete: {
        Args: { p_balancete: string; p_publicar?: boolean };
        Returns: undefined;
      };
      portal_publicar_parecer: {
        Args: { p_parecer: string };
        Returns: undefined;
      };
      portal_regravar_contas: {
        Args: { p_analise: Json; p_balancete: string; p_linhas: Json };
        Returns: undefined;
      };
      portal_rotinas: {
        Args: { p_cliente: string; p_competencia: string };
        Returns: {
          arquivos: Json;
          concluida_em: string;
          pendencia: string;
          prazo: string;
          setor: string;
          situacao: string;
          tarefa_id: string;
          titulo: string;
        }[];
      };
      prever_rotina: {
        Args: {
          p_grupos: string[];
          p_org: string;
          p_regimes: string[];
          p_segmentos: string[];
        };
        Returns: number;
      };
      reativar_cliente: { Args: { p_cliente: string }; Returns: Json };
      soc_abrir_processo: {
        Args: {
          p_cliente: string;
          p_cnpj: string;
          p_descricao: string;
          p_dispensar?: string[];
          p_futuro: string;
          p_org: string;
          p_previsao: string;
          p_responsavel: string;
          p_tipo: string;
          p_uf: string;
        };
        Returns: string;
      };
      soc_cancelar_processo: {
        Args: { p_motivo: string; p_proc: string };
        Returns: undefined;
      };
      soc_concluir_processo: { Args: { p_proc: string }; Returns: undefined };
      soc_mudar_fase: {
        Args: { p_fase: string; p_status: string };
        Returns: undefined;
      };
      soc_registrar_exigencia: {
        Args: { p_orgao: string; p_proc: string; p_texto: string };
        Returns: undefined;
      };
      venc_renovar: {
        Args: { p_item: string; p_nova_data: string; p_obs?: string };
        Returns: string;
      };
    };
    Enums: {
      ajuste_vencimento: "antecipa" | "posterga" | "nenhum";
      papel_membro: "admin" | "gestor" | "analista" | "tv";
      prioridade: "baixa" | "media" | "alta" | "urgente";
      status_tarefa: "a_fazer" | "em_andamento" | "aguardando" | "concluida" | "cancelada";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ajuste_vencimento: ["antecipa", "posterga", "nenhum"],
      papel_membro: ["admin", "gestor", "analista", "tv"],
      prioridade: ["baixa", "media", "alta", "urgente"],
      status_tarefa: ["a_fazer", "em_andamento", "aguardando", "concluida", "cancelada"],
    },
  },
} as const;
