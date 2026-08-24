"use client";

/**
 * Login e biblioteca de modelos na nuvem.
 *
 * O app inteiro continua funcionando sem nada disso configurado: quando as
 * variáveis de ambiente não existem, o estado fica em "off" e a interface
 * mostra como ligar. Nenhuma chamada é feita nesse caso.
 */

import { create } from "zustand";
import type { Diagram } from "./types";
import { DIAGRAMS_TABLE, cloudStatus, getSupabase, type CloudStatus } from "./supabase";

export interface CloudDoc {
  id: string;
  name: string;
  updated_at: string;
}

interface CloudState {
  status: CloudStatus;
  ready: boolean;
  user: { id: string; email: string } | null;
  docs: CloudDoc[];
  /** modelo aberto agora, para o botão "salvar por cima" saber quem é */
  currentId: string | null;
  busy: boolean;
  error: string | null;
  notice: string | null;

  init: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  listDocs: () => Promise<void>;
  saveNew: (name: string, diagram: Diagram) => Promise<void>;
  saveOver: (id: string, name: string, diagram: Diagram) => Promise<void>;
  fetchDiagram: (id: string) => Promise<Diagram | null>;
  remove: (id: string) => Promise<void>;
  setCurrent: (id: string | null) => void;
  clearMessages: () => void;
}

/** traduz as mensagens que o Supabase devolve em inglês */
function friendly(message: string): string {
  const map: Array<[RegExp, string]> = [
    [/invalid login credentials/i, "E-mail ou senha não conferem."],
    [/email not confirmed/i, "Confirme o e-mail pelo link que a Supabase enviou antes de entrar."],
    [/user already registered/i, "Esse e-mail já tem conta. Use entrar."],
    [/password should be at least (\d+)/i, "A senha precisa ter pelo menos $1 caracteres."],
    [/rate limit|too many requests/i, "Muitas tentativas seguidas. Espere um pouco."],
    [/failed to fetch|network/i, "Não deu para falar com a Supabase. Confira a URL do projeto e a rede."],
    [/relation .* does not exist/i, "A tabela pgcanvas_diagrams não existe. Rode supabase/schema.sql no projeto."],
    [/row-level security|permission denied/i, "O RLS recusou a operação. Confira as políticas do schema.sql."],
  ];
  for (const [pattern, text] of map) {
    if (pattern.test(message)) return message.replace(pattern, text);
  }
  return message;
}

function isDiagram(value: unknown): value is Diagram {
  const candidate = value as Diagram | null;
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      Array.isArray(candidate.tables) &&
      Array.isArray(candidate.relations),
  );
}

export const useCloud = create<CloudState>()((set, get) => ({
  status: "off",
  ready: false,
  user: null,
  docs: [],
  currentId: null,
  busy: false,
  error: null,
  notice: null,

  init: () => {
    if (get().ready) return;
    const status = cloudStatus();
    set({ status, ready: true });
    if (status !== "ready") return;

    const supabase = getSupabase();
    if (!supabase) return;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        set({ user: user ? { id: user.id, email: user.email ?? "" } : null });
        if (user) void get().listDocs();
      })
      .catch(() => {
        // projeto fora do ar ou URL errada: segue sem nuvem, sem quebrar a tela
        set({ error: "Não deu para falar com a Supabase. Confira a URL do projeto." });
      });

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      set({ user: user ? { id: user.id, email: user.email ?? "" } : null });
      if (user) void get().listDocs();
      else set({ docs: [], currentId: null });
    });
  },

  signIn: async (email, password) => {
    const supabase = getSupabase();
    if (!supabase) return;
    set({ busy: true, error: null, notice: null });
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    set({ busy: false, error: error ? friendly(error.message) : null });
  },

  signUp: async (email, password) => {
    const supabase = getSupabase();
    if (!supabase) return;
    set({ busy: true, error: null, notice: null });
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      set({ busy: false, error: friendly(error.message) });
      return;
    }
    // com confirmação de e-mail ligada, a sessão só vem depois do clique no link
    set({
      busy: false,
      notice: data.session
        ? "Conta criada."
        : "Conta criada. Confirme pelo link enviado para o seu e-mail e depois entre.",
    });
  },

  signOut: async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ user: null, docs: [], currentId: null, notice: null, error: null });
  },

  listDocs: async () => {
    const supabase = getSupabase();
    if (!supabase || !get().user) return;
    set({ busy: true });
    const { data, error } = await supabase
      .from(DIAGRAMS_TABLE)
      .select("id, name, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    set({
      busy: false,
      docs: error ? [] : ((data ?? []) as CloudDoc[]),
      error: error ? friendly(error.message) : null,
    });
  },

  saveNew: async (name, diagram) => {
    const supabase = getSupabase();
    const user = get().user;
    if (!supabase || !user) return;
    set({ busy: true, error: null, notice: null });
    const { data, error } = await supabase
      .from(DIAGRAMS_TABLE)
      .insert({ name: name.trim() || "Sem nome", data: diagram, user_id: user.id })
      .select("id, name, updated_at")
      .single();
    if (error) {
      set({ busy: false, error: friendly(error.message) });
      return;
    }
    set({ busy: false, currentId: data.id, notice: `"${data.name}" salvo na sua conta.` });
    void get().listDocs();
  },

  saveOver: async (id, name, diagram) => {
    const supabase = getSupabase();
    if (!supabase || !get().user) return;
    set({ busy: true, error: null, notice: null });
    const { error } = await supabase
      .from(DIAGRAMS_TABLE)
      .update({ name: name.trim() || "Sem nome", data: diagram })
      .eq("id", id);
    if (error) {
      set({ busy: false, error: friendly(error.message) });
      return;
    }
    set({ busy: false, currentId: id, notice: "Modelo atualizado." });
    void get().listDocs();
  },

  fetchDiagram: async (id) => {
    const supabase = getSupabase();
    if (!supabase) return null;
    set({ busy: true, error: null, notice: null });
    const { data, error } = await supabase
      .from(DIAGRAMS_TABLE)
      .select("id, name, data")
      .eq("id", id)
      .single();
    if (error || !data) {
      set({ busy: false, error: error ? friendly(error.message) : "Modelo não encontrado." });
      return null;
    }
    if (!isDiagram(data.data)) {
      set({ busy: false, error: "O conteúdo salvo não tem o formato de modelo do pgcanvas." });
      return null;
    }
    set({ busy: false, currentId: id });
    return { ...data.data, name: data.name ?? data.data.name } as Diagram;
  },

  remove: async (id) => {
    const supabase = getSupabase();
    if (!supabase) return;
    set({ busy: true, error: null, notice: null });
    const { error } = await supabase.from(DIAGRAMS_TABLE).delete().eq("id", id);
    if (error) {
      set({ busy: false, error: friendly(error.message) });
      return;
    }
    set((state) => ({
      busy: false,
      currentId: state.currentId === id ? null : state.currentId,
      notice: "Modelo removido da nuvem.",
    }));
    void get().listDocs();
  },

  setCurrent: (id) => set({ currentId: id }),
  clearMessages: () => set({ error: null, notice: null }),
}));
