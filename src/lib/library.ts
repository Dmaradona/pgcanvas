"use client";

/**
 * Biblioteca de modelos guardada no proprio navegador.
 *
 * Enquanto nao existe conta, e aqui que o trabalho do aluno sobrevive a um
 * F5: o modelo aberto, os modelos salvos e os dados preenchidos a mao.
 * Tudo em localStorage, que e por aba de navegador e por maquina. O caminho
 * para levar embora continua sendo exportar JSON, DDL, INSERT ou CSV.
 */

import { create } from "zustand";
import type { Diagram, SimData } from "./types";
import { newId } from "./utils";

const LIBRARY_KEY = "pgcanvas:library:v1";
const CURRENT_KEY = "pgcanvas:diagram:v1";
const DATA_KEY = "pgcanvas:data:v1";

/** acima disso os dados nao vao para o localStorage, para nao estourar a cota */
const DATA_LIMIT = 1_500_000;

export interface SavedModel {
  id: string;
  name: string;
  updatedAt: string;
  tables: number;
  relations: number;
  diagram: Diagram;
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

function readLibrary(): SavedModel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedModel[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string" && isDiagram(item.diagram));
  } catch {
    return [];
  }
}

function writeLibrary(items: SavedModel[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
    return true;
  } catch {
    // cota cheia ou navegacao privada
    return false;
  }
}

function describe(diagram: Diagram): { tables: number; relations: number } {
  return { tables: diagram.tables.length, relations: diagram.relations.length };
}

/** le o JSON exportado pelo app; devolve null quando nao e um modelo */
export function parseDiagramJson(text: string): Diagram | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isDiagram(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Modelo aberto                                                       */
/* ------------------------------------------------------------------ */

export function persistDiagram(diagram: Diagram): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CURRENT_KEY, JSON.stringify(diagram));
  } catch {
    // sem espaco: o modelo continua na tela, so nao sobrevive ao refresh
  }
}

export function readDiagram(): Diagram | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isDiagram(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Dados preenchidos                                                   */
/* ------------------------------------------------------------------ */

/** devolve false quando os dados sao grandes demais para o navegador guardar */
export function persistData(data: SimData): boolean {
  if (typeof window === "undefined") return false;
  try {
    const rows = Object.values(data).reduce((total, list) => total + list.length, 0);
    if (rows === 0) {
      window.localStorage.removeItem(DATA_KEY);
      return true;
    }
    const payload = JSON.stringify(data);
    if (payload.length > DATA_LIMIT) {
      window.localStorage.removeItem(DATA_KEY);
      return false;
    }
    window.localStorage.setItem(DATA_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

export function readData(): SimData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SimData;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearStoredData(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DATA_KEY);
  } catch {
    // nada a fazer
  }
}

/* ------------------------------------------------------------------ */
/* Store da biblioteca                                                 */
/* ------------------------------------------------------------------ */

interface LibraryState {
  items: SavedModel[];
  /** id do modelo salvo que esta aberto agora, quando houver */
  currentId: string | null;
  /** false quando o navegador recusou a escrita, por cota ou aba privada */
  writable: boolean;
  notice: string | null;

  refresh: () => void;
  saveNew: (diagram: Diagram, name?: string) => void;
  saveOver: (id: string, diagram: Diagram) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  setCurrent: (id: string | null) => void;
  clearNotice: () => void;
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  items: [],
  currentId: null,
  writable: true,
  notice: null,

  refresh: () => set({ items: readLibrary() }),

  saveNew: (diagram, name) => {
    const model: SavedModel = {
      id: newId("mdl"),
      name: (name ?? diagram.name).trim() || "Sem nome",
      updatedAt: new Date().toISOString(),
      ...describe(diagram),
      diagram: { ...diagram, name: (name ?? diagram.name).trim() || "Sem nome" },
    };
    const items = [model, ...readLibrary()];
    const ok = writeLibrary(items);
    set({
      items: ok ? items : get().items,
      currentId: ok ? model.id : get().currentId,
      writable: ok,
      notice: ok
        ? `"${model.name}" salvo neste navegador.`
        : "O navegador não deixou salvar. Espaço cheio ou aba privada.",
    });
  },

  saveOver: (id, diagram) => {
    const items = readLibrary().map((item) =>
      item.id === id
        ? {
            ...item,
            name: diagram.name.trim() || item.name,
            updatedAt: new Date().toISOString(),
            ...describe(diagram),
            diagram,
          }
        : item,
    );
    const ok = writeLibrary(items);
    set({
      items: ok ? items : get().items,
      currentId: ok ? id : get().currentId,
      writable: ok,
      notice: ok ? "Modelo atualizado." : "O navegador não deixou salvar.",
    });
  },

  rename: (id, name) => {
    const clean = name.trim() || "Sem nome";
    const items = readLibrary().map((item) =>
      item.id === id
        ? { ...item, name: clean, diagram: { ...item.diagram, name: clean }, updatedAt: new Date().toISOString() }
        : item,
    );
    const ok = writeLibrary(items);
    set({ items: ok ? items : get().items, writable: ok });
  },

  remove: (id) => {
    const items = readLibrary().filter((item) => item.id !== id);
    const ok = writeLibrary(items);
    set({
      items: ok ? items : get().items,
      currentId: get().currentId === id ? null : get().currentId,
      writable: ok,
      notice: ok ? "Modelo removido." : null,
    });
  },

  setCurrent: (id) => set({ currentId: id }),
  clearNotice: () => set({ notice: null }),
}));
