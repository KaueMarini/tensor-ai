export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      acao: {
        Row: {
          antes: Json | null
          criado_em: string
          depois: Json | null
          devops_id: number | null
          erro: string | null
          id: number
          projeto_id: string | null
          status: string
          tipo: string
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          antes?: Json | null
          criado_em?: string
          depois?: Json | null
          devops_id?: number | null
          erro?: string | null
          id?: never
          projeto_id?: string | null
          status: string
          tipo: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          antes?: Json | null
          criado_em?: string
          depois?: Json | null
          devops_id?: number | null
          erro?: string | null
          id?: never
          projeto_id?: string | null
          status?: string
          tipo?: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acao_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acao_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acao_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      alocacao_projeto: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          horas_dia: number
          pessoa_id: string
          projeto_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          horas_dia: number
          pessoa_id: string
          projeto_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          horas_dia?: number
          pessoa_id?: string
          projeto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alocacao_projeto_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alocacao_projeto_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "alocacao_projeto_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alocacao_projeto_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alocacao_projeto_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      analise_config: {
        Row: {
          atualizado_em: string
          campo_bloqueio: string | null
          campo_horas_carga: string
          horas_fallback_padrao: number
          horas_fallback_por_tag: Json
          id: boolean
          janela_historico_dias: number
          percentil_referencia: number
          tags_bloqueio: string[]
        }
        Insert: {
          atualizado_em?: string
          campo_bloqueio?: string | null
          campo_horas_carga?: string
          horas_fallback_padrao?: number
          horas_fallback_por_tag?: Json
          id?: boolean
          janela_historico_dias?: number
          percentil_referencia?: number
          tags_bloqueio?: string[]
        }
        Update: {
          atualizado_em?: string
          campo_bloqueio?: string | null
          campo_horas_carga?: string
          horas_fallback_padrao?: number
          horas_fallback_por_tag?: Json
          id?: boolean
          janela_historico_dias?: number
          percentil_referencia?: number
          tags_bloqueio?: string[]
        }
        Relationships: []
      }
      ausencia: {
        Row: {
          fim: string
          id: number
          inicio: string
          observacao: string | null
          pessoa_id: string
          tipo: string
        }
        Insert: {
          fim: string
          id?: never
          inicio: string
          observacao?: string | null
          pessoa_id: string
          tipo: string
        }
        Update: {
          fim?: string
          id?: never
          inicio?: string
          observacao?: string | null
          pessoa_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ausencia_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencia_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
        ]
      }
      capacidade_sprint: {
        Row: {
          atividades: Json
          atualizado_em: string
          capacidade_dia: number
          pessoa_id: string
          sprint_id: string
          time_id: string
        }
        Insert: {
          atividades?: Json
          atualizado_em?: string
          capacidade_dia?: number
          pessoa_id: string
          sprint_id: string
          time_id: string
        }
        Update: {
          atividades?: Json
          atualizado_em?: string
          capacidade_dia?: number
          pessoa_id?: string
          sprint_id?: string
          time_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacidade_sprint_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacidade_sprint_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "capacidade_sprint_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprint"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacidade_sprint_time_id_fkey"
            columns: ["time_id"]
            isOneToOne: false
            referencedRelation: "time"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacidade_sprint_time_id_fkey"
            columns: ["time_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["time_id"]
          },
        ]
      }
      devops_relacao_cache: {
        Row: {
          alvo_id: number
          lido_em: string
          tipo: string
          work_item_id: number
        }
        Insert: {
          alvo_id: number
          lido_em?: string
          tipo: string
          work_item_id: number
        }
        Update: {
          alvo_id?: number
          lido_em?: string
          tipo?: string
          work_item_id?: number
        }
        Relationships: []
      }
      dias_off: {
        Row: {
          fim: string
          id: number
          inicio: string
          pessoa_id: string | null
          sprint_id: string
          time_id: string
        }
        Insert: {
          fim: string
          id?: never
          inicio: string
          pessoa_id?: string | null
          sprint_id: string
          time_id: string
        }
        Update: {
          fim?: string
          id?: never
          inicio?: string
          pessoa_id?: string | null
          sprint_id?: string
          time_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dias_off_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dias_off_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "dias_off_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprint"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dias_off_time_id_fkey"
            columns: ["time_id"]
            isOneToOne: false
            referencedRelation: "time"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dias_off_time_id_fkey"
            columns: ["time_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["time_id"]
          },
        ]
      }
      evento: {
        Row: {
          chave_idempotencia: string
          devops_id: number | null
          erro: string | null
          id: number
          payload: Json
          processado_em: string | null
          recebido_em: string
          rev: number | null
          status: string
          tentativas: number
          tipo: string
        }
        Insert: {
          chave_idempotencia: string
          devops_id?: number | null
          erro?: string | null
          id?: never
          payload: Json
          processado_em?: string | null
          recebido_em?: string
          rev?: number | null
          status?: string
          tentativas?: number
          tipo: string
        }
        Update: {
          chave_idempotencia?: string
          devops_id?: number | null
          erro?: string | null
          id?: never
          payload?: Json
          processado_em?: string | null
          recebido_em?: string
          rev?: number | null
          status?: string
          tentativas?: number
          tipo?: string
        }
        Relationships: []
      }
      feriado: {
        Row: {
          abrangencia: string
          data: string
          id: number
          nome: string
        }
        Insert: {
          abrangencia?: string
          data: string
          id?: never
          nome: string
        }
        Update: {
          abrangencia?: string
          data?: string
          id?: never
          nome?: string
        }
        Relationships: []
      }
      fluxo_config: {
        Row: {
          atualizado_em: string
          coluna: string
          limite_wip_coluna: number | null
          limite_wip_pessoa: number | null
          projeto_id: string
          sla_horas_uteis: number | null
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          coluna: string
          limite_wip_coluna?: number | null
          limite_wip_pessoa?: number | null
          projeto_id: string
          sla_horas_uteis?: number | null
          tipo?: string
        }
        Update: {
          atualizado_em?: string
          coluna?: string
          limite_wip_coluna?: number | null
          limite_wip_pessoa?: number | null
          projeto_id?: string
          sla_horas_uteis?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_config_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_config_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_config_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      funcao_tag: {
        Row: {
          criado_em: string
          id: number
          nome: string
        }
        Insert: {
          criado_em?: string
          id?: never
          nome: string
        }
        Update: {
          criado_em?: string
          id?: never
          nome?: string
        }
        Relationships: []
      }
      notificacao: {
        Row: {
          criada_em: string
          gravidade: string
          id: string
          lida_em: string | null
          link: string | null
          mensagem: string | null
          origem: string
          pessoa_id: string | null
          projeto_id: string | null
          titulo: string
          usuario_id: string | null
        }
        Insert: {
          criada_em?: string
          gravidade?: string
          id?: string
          lida_em?: string | null
          link?: string | null
          mensagem?: string | null
          origem?: string
          pessoa_id?: string | null
          projeto_id?: string | null
          titulo: string
          usuario_id?: string | null
        }
        Update: {
          criada_em?: string
          gravidade?: string
          id?: string
          lida_em?: string | null
          link?: string | null
          mensagem?: string | null
          origem?: string
          pessoa_id?: string | null
          projeto_id?: string | null
          titulo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "notificacao_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacao_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacao_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      pessoa: {
        Row: {
          atualizado_em: string
          devops_user_id: string | null
          horas_semana_base: number
          id: string
          nome: string
          papel: string | null
          unique_name: string | null
        }
        Insert: {
          atualizado_em?: string
          devops_user_id?: string | null
          horas_semana_base?: number
          id?: string
          nome: string
          papel?: string | null
          unique_name?: string | null
        }
        Update: {
          atualizado_em?: string
          devops_user_id?: string | null
          horas_semana_base?: number
          id?: string
          nome?: string
          papel?: string | null
          unique_name?: string | null
        }
        Relationships: []
      }
      pessoa_funcao_tag: {
        Row: {
          criado_em: string
          funcao_tag_id: number
          pessoa_id: string
        }
        Insert: {
          criado_em?: string
          funcao_tag_id: number
          pessoa_id: string
        }
        Update: {
          criado_em?: string
          funcao_tag_id?: number
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoa_funcao_tag_funcao_tag_id_fkey"
            columns: ["funcao_tag_id"]
            isOneToOne: false
            referencedRelation: "funcao_tag"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_funcao_tag_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_funcao_tag_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
        ]
      }
      projeto: {
        Row: {
          atualizado_em: string
          deleted_at: string | null
          descricao: string | null
          descricao_extra: string | null
          id: string
          nome: string
          processo: string | null
          tags_requeridas: string[]
        }
        Insert: {
          atualizado_em?: string
          deleted_at?: string | null
          descricao?: string | null
          descricao_extra?: string | null
          id: string
          nome: string
          processo?: string | null
          tags_requeridas?: string[]
        }
        Update: {
          atualizado_em?: string
          deleted_at?: string | null
          descricao?: string | null
          descricao_extra?: string | null
          id?: string
          nome?: string
          processo?: string | null
          tags_requeridas?: string[]
        }
        Relationships: []
      }
      regra_capacidade: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          foco: number
          id: boolean
          jornada_dia: number
          limite_atencao: number
          limite_sobrecarga: number
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          foco?: number
          id?: boolean
          jornada_dia?: number
          limite_atencao?: number
          limite_sobrecarga?: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          foco?: number
          id?: boolean
          jornada_dia?: number
          limite_atencao?: number
          limite_sobrecarga?: number
        }
        Relationships: []
      }
      regra_capacidade_pessoa: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          foco: number | null
          jornada_dia: number | null
          observacao: string | null
          pessoa_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          foco?: number | null
          jornada_dia?: number | null
          observacao?: string | null
          pessoa_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          foco?: number | null
          jornada_dia?: number | null
          observacao?: string | null
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regra_capacidade_pessoa_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regra_capacidade_pessoa_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
        ]
      }
      regra_capacidade_projeto: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          limite_atencao: number | null
          limite_sobrecarga: number | null
          projeto_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          limite_atencao?: number | null
          limite_sobrecarga?: number | null
          projeto_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          limite_atencao?: number | null
          limite_sobrecarga?: number | null
          projeto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regra_capacidade_projeto_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: true
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regra_capacidade_projeto_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: true
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regra_capacidade_projeto_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: true
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      skill_tag: {
        Row: {
          atualizado_em: string
          confianca: number | null
          confirmada: boolean
          evidencias: number
          horas: number | null
          id: number
          origem: string
          pessoa_id: string
          rejeitada: boolean
          tag: string
        }
        Insert: {
          atualizado_em?: string
          confianca?: number | null
          confirmada?: boolean
          evidencias?: number
          horas?: number | null
          id?: never
          origem: string
          pessoa_id: string
          rejeitada?: boolean
          tag: string
        }
        Update: {
          atualizado_em?: string
          confianca?: number | null
          confirmada?: boolean
          evidencias?: number
          horas?: number | null
          id?: never
          origem?: string
          pessoa_id?: string
          rejeitada?: boolean
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_tag_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_tag_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
        ]
      }
      sprint: {
        Row: {
          atualizado_em: string
          deleted_at: string | null
          fim: string | null
          id: string
          inicio: string | null
          iteration_path: string
          nome: string
          projeto_id: string
        }
        Insert: {
          atualizado_em?: string
          deleted_at?: string | null
          fim?: string | null
          id: string
          inicio?: string | null
          iteration_path: string
          nome: string
          projeto_id: string
        }
        Update: {
          atualizado_em?: string
          deleted_at?: string | null
          fim?: string | null
          id?: string
          inicio?: string | null
          iteration_path?: string
          nome?: string
          projeto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprint_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      sugestao: {
        Row: {
          acao: Json | null
          criada_em: string
          decidida_em: string | null
          decidida_por: string | null
          hash_payload: string | null
          id: string
          impacto: Json | null
          impacto_antes: Json | null
          impacto_depois: Json | null
          justificativa: string | null
          markdown: string | null
          origem: string | null
          payload: Json
          projeto_id: string | null
          status: string
          tipo: string
          usou_fallback: boolean
          versao_prompt: string | null
        }
        Insert: {
          acao?: Json | null
          criada_em?: string
          decidida_em?: string | null
          decidida_por?: string | null
          hash_payload?: string | null
          id?: string
          impacto?: Json | null
          impacto_antes?: Json | null
          impacto_depois?: Json | null
          justificativa?: string | null
          markdown?: string | null
          origem?: string | null
          payload: Json
          projeto_id?: string | null
          status?: string
          tipo: string
          usou_fallback?: boolean
          versao_prompt?: string | null
        }
        Update: {
          acao?: Json | null
          criada_em?: string
          decidida_em?: string | null
          decidida_por?: string | null
          hash_payload?: string | null
          id?: string
          impacto?: Json | null
          impacto_antes?: Json | null
          impacto_depois?: Json | null
          justificativa?: string | null
          markdown?: string | null
          origem?: string | null
          payload?: Json
          projeto_id?: string | null
          status?: string
          tipo?: string
          usou_fallback?: boolean
          versao_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sugestao_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestao_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestao_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      sync_state: {
        Row: {
          atualizado_em: string
          cursor: Json
          fase: string
          full_concluida_em: string | null
          full_iniciada_em: string | null
          lease_ate: string | null
          projeto_id: string
          run_id: string | null
          ultima_reconciliacao_em: string | null
          ultima_reconciliacao_ok: boolean | null
          ultimo_changed_date: string | null
          ultimo_erro: string | null
        }
        Insert: {
          atualizado_em?: string
          cursor?: Json
          fase?: string
          full_concluida_em?: string | null
          full_iniciada_em?: string | null
          lease_ate?: string | null
          projeto_id: string
          run_id?: string | null
          ultima_reconciliacao_em?: string | null
          ultima_reconciliacao_ok?: boolean | null
          ultimo_changed_date?: string | null
          ultimo_erro?: string | null
        }
        Update: {
          atualizado_em?: string
          cursor?: Json
          fase?: string
          full_concluida_em?: string | null
          full_iniciada_em?: string | null
          lease_ate?: string | null
          projeto_id?: string
          run_id?: string | null
          ultima_reconciliacao_em?: string | null
          ultima_reconciliacao_ok?: boolean | null
          ultimo_changed_date?: string | null
          ultimo_erro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_state_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: true
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_state_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: true
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_state_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: true
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      time: {
        Row: {
          atualizado_em: string
          id: string
          nome: string
          projeto_id: string
        }
        Insert: {
          atualizado_em?: string
          id: string
          nome: string
          projeto_id: string
        }
        Update: {
          atualizado_em?: string
          id?: string
          nome?: string
          projeto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      time_membro: {
        Row: {
          ativo: boolean
          atualizado_em: string
          pessoa_id: string
          time_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          pessoa_id: string
          time_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          pessoa_id?: string
          time_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_membro_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_membro_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "time_membro_time_id_fkey"
            columns: ["time_id"]
            isOneToOne: false
            referencedRelation: "time"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_membro_time_id_fkey"
            columns: ["time_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["time_id"]
          },
        ]
      }
      work_item: {
        Row: {
          area_path: string | null
          atualizado_em: string
          changed_date: string | null
          criado_em: string
          deleted_at: string | null
          descritivo: string | null
          devops_id: number
          estado: string | null
          feature_devops_id: number | null
          fields: Json
          finish_date: string | null
          horas_concluidas: number | null
          horas_estimadas: number | null
          horas_origem: string
          horas_restantes: number | null
          iteration_path: string | null
          parent_devops_id: number | null
          projeto_id: string
          responsavel_id: string | null
          rev: number
          sprint_id: string | null
          start_date: string | null
          sync_origem: string | null
          tags: string[]
          target_date: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          area_path?: string | null
          atualizado_em?: string
          changed_date?: string | null
          criado_em?: string
          deleted_at?: string | null
          descritivo?: string | null
          devops_id: number
          estado?: string | null
          feature_devops_id?: number | null
          fields?: Json
          finish_date?: string | null
          horas_concluidas?: number | null
          horas_estimadas?: number | null
          horas_origem?: string
          horas_restantes?: number | null
          iteration_path?: string | null
          parent_devops_id?: number | null
          projeto_id: string
          responsavel_id?: string | null
          rev: number
          sprint_id?: string | null
          start_date?: string | null
          sync_origem?: string | null
          tags?: string[]
          target_date?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          area_path?: string | null
          atualizado_em?: string
          changed_date?: string | null
          criado_em?: string
          deleted_at?: string | null
          descritivo?: string | null
          devops_id?: number
          estado?: string | null
          feature_devops_id?: number | null
          fields?: Json
          finish_date?: string | null
          horas_concluidas?: number | null
          horas_estimadas?: number | null
          horas_origem?: string
          horas_restantes?: number | null
          iteration_path?: string | null
          parent_devops_id?: number | null
          projeto_id?: string
          responsavel_id?: string | null
          rev?: number
          sprint_id?: string | null
          start_date?: string | null
          sync_origem?: string | null
          tags?: string[]
          target_date?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "work_item_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "work_item_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprint"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_transicao: {
        Row: {
          campo: string
          changed_at: string
          changed_rev: number
          criado_em: string
          de: string | null
          id: number
          origem: string
          para: string | null
          work_item_id: number
        }
        Insert: {
          campo: string
          changed_at: string
          changed_rev: number
          criado_em?: string
          de?: string | null
          id?: never
          origem: string
          para?: string | null
          work_item_id: number
        }
        Update: {
          campo?: string
          changed_at?: string
          changed_rev?: number
          criado_em?: string
          de?: string | null
          id?: never
          origem?: string
          para?: string | null
          work_item_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      feature: {
        Row: {
          atualizado_em: string | null
          changed_date: string | null
          descricao: string | null
          devops_id: number | null
          estado: string | null
          projeto_id: string | null
          responsavel_id: string | null
          sprint_id: string | null
          tags: string[] | null
          titulo: string | null
        }
        Insert: {
          atualizado_em?: string | null
          changed_date?: string | null
          descricao?: string | null
          devops_id?: number | null
          estado?: string | null
          projeto_id?: string | null
          responsavel_id?: string | null
          sprint_id?: string | null
          tags?: string[] | null
          titulo?: string | null
        }
        Update: {
          atualizado_em?: string | null
          changed_date?: string | null
          descricao?: string | null
          devops_id?: number | null
          estado?: string | null
          projeto_id?: string | null
          responsavel_id?: string | null
          sprint_id?: string | null
          tags?: string[] | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_item_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "work_item_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "work_item_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprint"
            referencedColumns: ["id"]
          },
        ]
      }
      v_backlog: {
        Row: {
          atualizado_em: string | null
          feature_estado: string | null
          feature_id: number | null
          feature_tags: string[] | null
          feature_titulo: string | null
          horas_concluidas: number | null
          horas_estimadas: number | null
          horas_origem: string | null
          horas_restantes: number | null
          item_estado: string | null
          item_id: number | null
          item_parent_id: number | null
          item_tipo: string | null
          item_titulo: string | null
          projeto_id: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          sem_estimativa: boolean | null
          sprint_fim: string | null
          sprint_id: string | null
          sprint_inicio: string | null
          sprint_nome: string | null
          tags: string[] | null
        }
        Relationships: []
      }
      v_membros: {
        Row: {
          ativo: boolean | null
          horas_semana_base: number | null
          nome: string | null
          papel: string | null
          pessoa_id: string | null
          projeto_id: string | null
          projeto_nome: string | null
          skills: Json | null
          tags: Json | null
          time_id: string | null
          time_nome: string | null
          unique_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_sem_dono_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      v_projeto_resumo: {
        Row: {
          descricao: string | null
          id: string | null
          n_features: number | null
          n_itens: number | null
          n_membros: number | null
          nome: string | null
          processo: string | null
          sprint_atual: string | null
          sync_fase: string | null
          tags: string[] | null
          ultima_reconciliacao_em: string | null
        }
        Relationships: []
      }
      v_sem_dono_resumo: {
        Row: {
          horas: number | null
          projeto_id: string | null
          projeto_nome: string | null
          tasks: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_sync_lease: {
        Args: { p_projeto_id: string; p_segundos?: number }
        Returns: boolean
      }
      arquivar_projeto: { Args: { p_projeto_id: string }; Returns: undefined }
      chamar_analytics: {
        Args: { caminho: string; corpo: Json }
        Returns: number
      }
      feature_ancestral: { Args: { p_devops_id: number }; Returns: number }
      recalcular_skills: { Args: { p_pessoas: string[] }; Returns: number }
      recompute_hierarquia: { Args: { p_ids: number[] }; Returns: number }
      release_sync_lease: { Args: { p_projeto_id: string }; Returns: undefined }
      renomear_paths_projeto: {
        Args: { p_antigo: string; p_novo: string; p_projeto_id: string }
        Returns: number
      }
      replace_capacidade: {
        Args: {
          p_capacidades: Json
          p_dias_off_time: Json
          p_sprint_id: string
          p_time_id: string
        }
        Returns: undefined
      }
      seed_fluxo_config: { Args: { p_projeto: string }; Returns: undefined }
      skill_chave: { Args: { p_tag: string }; Returns: string }
      soft_delete_work_item: {
        Args: { p_devops_id: number; p_rev?: number }
        Returns: boolean
      }
      sweep_work_items: {
        Args: { p_ids_vivos: number[]; p_projeto_id: string }
        Returns: number
      }
      sync_time_membros: {
        Args: { p_membros: Json; p_time_id: string }
        Returns: undefined
      }
      transicao_valor: { Args: { campo: Json; qual: string }; Returns: string }
      upsert_work_items: {
        Args: { p_items: Json; p_origem: string }
        Returns: {
          aplicado: boolean
          devops_id: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
