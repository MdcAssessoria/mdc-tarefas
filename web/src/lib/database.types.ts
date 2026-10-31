// Gerado automaticamente a partir do banco (Supabase). NÃO edite à mão:
// regenere depois de cada migração (veja docs/07-como-rodar-e-publicar.md).
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
