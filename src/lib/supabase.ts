"use client";

/**
 * Cliente Supabase do navegador.
 *
 * Só entram aqui as duas variáveis públicas por natureza: a URL do projeto e
 * a chave anônima (ou publishable). Elas são visíveis no bundle por desenho,
 * e quem protege os dados é o RLS declarado em `supabase/schema.sql`.
 *
 * A chave de serviço (`service_role` / `sb_secret_...`) nunca pode entrar num
 * arquivo `NEXT_PUBLIC_`: ela ignora RLS. Se alguém colar uma por engano, o
 * app se recusa a subir o cliente e explica o problema na tela.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// referências estáticas, senão o Next não substitui no build
const URL_FROM_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY_FROM_ENV =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

export type CloudStatus = "off" | "unsafe" | "ready";

/** true quando a chave é secreta e portanto não pode ir para o navegador */
export function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

export function cloudStatus(): CloudStatus {
  if (!URL_FROM_ENV || !KEY_FROM_ENV) return "off";
  if (isSecretKey(KEY_FROM_ENV)) return "unsafe";
  return "ready";
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cloudStatus() !== "ready") return null;
  if (typeof window === "undefined") return null;
  if (!client) {
    client = createClient(URL_FROM_ENV, KEY_FROM_ENV, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "pgcanvas-auth",
      },
    });
  }
  return client;
}

/** nome do projeto, só para mostrar na tela de quem está conectado */
export function cloudHost(): string {
  try {
    return new URL(URL_FROM_ENV).host;
  } catch {
    return "";
  }
}

export const DIAGRAMS_TABLE = "pgcanvas_diagrams";
