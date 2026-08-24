import type { Column, Diagram, SimData, SimOptions, SimRow, Table } from "./types";
import { ROW_ID } from "./types";
import { getType, isSerial, type ValueKind } from "./pg-types";
import { topologicalOrder } from "./sql";
import { quoteIdent, quoteLiteral } from "./utils";

/* ------------------------------------------------------------------ */
/* PRNG deterministico                                                 */
/* ------------------------------------------------------------------ */

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class Random {
  private state: number;

  constructor(seed: string) {
    this.state = hashSeed(seed) || 1;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }
}

/* ------------------------------------------------------------------ */
/* Vocabulario pt-BR                                                   */
/* ------------------------------------------------------------------ */

const NOMES = [
  "Ana", "Bruno", "Carla", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique",
  "Isabela", "João", "Karina", "Lucas", "Mariana", "Nicolas", "Otávio", "Paula",
  "Rafael", "Sofia", "Thiago", "Vanessa", "William", "Yasmin", "André", "Beatriz",
];

const SOBRENOMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves",
  "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho",
  "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa",
];

const CIDADES = [
  "Toledo", "Cascavel", "Curitiba", "Maringá", "Londrina", "Foz do Iguaçu",
  "Ponta Grossa", "Guarapuava", "Pato Branco", "Umuarama", "Campo Mourão",
  "Francisco Beltrão", "Paranaguá", "Apucarana", "Marechal Cândido Rondon",
];

const ESTADOS = ["PR", "SC", "RS", "SP", "MG", "RJ", "BA", "GO", "MT", "MS", "PE", "CE"];

const LOGRADOUROS = [
  "Rua das Palmeiras", "Avenida Brasil", "Rua Paraná", "Avenida Maripá",
  "Rua Sao Paulo", "Travessa Ipe", "Alameda dos Antúrios", "Rua Sete de Setembro",
];

const EMPRESAS = [
  "Aurora Sistemas", "Vale Verde Alimentos", "Delta Log", "Prisma Consultoria",
  "Nordeste Distribuidora", "Órbita Tecnologia", "Casa Bela Móveis", "Rio Claro Agro",
];

const PRODUTOS = [
  "Teclado mecanico", "Monitor 27 polegadas", "Cadeira ergonômica", "Notebook 14",
  "Mouse sem fio", "Headset USB", "Webcam HD", "Suporte para monitor",
  "Café em grãos", "Caderno pautado", "Mochila para notebook", "Hub USB-C",
];

const CATEGORIAS = [
  "Periféricos", "Mobiliário", "Informática", "Papelaria", "Alimentos",
  "Serviços", "Manutenção", "Licenças",
];

const STATUS = ["pendente", "aprovado", "em_transporte", "entregue", "cancelado"];

const PALAVRAS = [
  "pedido", "cliente", "entrega", "estoque", "cadastro", "contrato", "relatório",
  "análise", "processo", "registro", "consulta", "histórico", "vendas", "suporte",
];

/* ------------------------------------------------------------------ */
/* Geradores                                                           */
/* ------------------------------------------------------------------ */

export interface GeneratorDef {
  key: string;
  label: string;
  group: string;
}

export const GENERATORS: GeneratorDef[] = [
  { key: "auto", label: "Automático (pelo nome e tipo)", group: "Geral" },
  { key: "sequence", label: "Sequência 1, 2, 3...", group: "Geral" },
  { key: "uuid", label: "UUID", group: "Geral" },
  { key: "codigo", label: "Código alfanumérico", group: "Geral" },
  { key: "nome_completo", label: "Nome completo", group: "Pessoa" },
  { key: "nome_pessoa", label: "Primeiro nome", group: "Pessoa" },
  { key: "sobrenome", label: "Sobrenome", group: "Pessoa" },
  { key: "email", label: "E-mail", group: "Pessoa" },
  { key: "telefone", label: "Telefone com DDD", group: "Pessoa" },
  { key: "cpf", label: "CPF válido", group: "Pessoa" },
  { key: "cnpj", label: "CNPJ válido", group: "Pessoa" },
  { key: "username", label: "Nome de usuário", group: "Pessoa" },
  { key: "senha_hash", label: "Hash de senha", group: "Pessoa" },
  { key: "cep", label: "CEP", group: "Endereço" },
  { key: "endereco", label: "Logradouro e número", group: "Endereço" },
  { key: "cidade", label: "Cidade", group: "Endereço" },
  { key: "estado", label: "UF", group: "Endereço" },
  { key: "empresa", label: "Razão social", group: "Negócio" },
  { key: "produto", label: "Produto", group: "Negócio" },
  { key: "categoria", label: "Categoria", group: "Negócio" },
  { key: "status", label: "Status de pedido", group: "Negócio" },
  { key: "preco", label: "Valor monetário", group: "Números" },
  { key: "quantidade", label: "Quantidade inteira", group: "Números" },
  { key: "percentual", label: "Percentual 0 a 100", group: "Números" },
  { key: "booleano", label: "Verdadeiro ou falso", group: "Números" },
  { key: "data_passado", label: "Data nos últimos 2 anos", group: "Tempo" },
  { key: "data_futuro", label: "Data nos próximos 6 meses", group: "Tempo" },
  { key: "timestamp_recente", label: "Timestamp recente", group: "Tempo" },
  { key: "hora", label: "Hora do dia", group: "Tempo" },
  { key: "semestre", label: "Semestre no formato 2026/1", group: "Tempo" },
  { key: "frase", label: "Frase curta", group: "Texto" },
  { key: "descricao", label: "Descrição longa", group: "Texto" },
  { key: "palavra", label: "Palavra única", group: "Texto" },
  { key: "url", label: "URL", group: "Texto" },
  { key: "json_objeto", label: "Objeto JSON", group: "Texto" },
];

const HEURISTICS: Array<[RegExp, string]> = [
  [/(^|_)(cpf)($|_)/, "cpf"],
  [/(^|_)(cnpj)($|_)/, "cnpj"],
  [/(^|_)(cep|zip)($|_)/, "cep"],
  [/(e_?mail)/, "email"],
  [/(telefone|celular|fone|phone|whats)/, "telefone"],
  [/(sobrenome|last_?name)/, "sobrenome"],
  [/(nome_completo|full_?name|razao_social)/, "nome_completo"],
  [/(^|_)(nome|name|titulo|title)($|_)/, "nome_completo"],
  [/(usuario|username|login|apelido)/, "username"],
  [/(senha|password|hash|token)/, "senha_hash"],
  [/(endereco|logradouro|rua|address)/, "endereco"],
  [/(cidade|municipio|city)/, "cidade"],
  [/(estado|uf|state)/, "estado"],
  [/(empresa|fornecedor|company)/, "empresa"],
  [/(produto|item|mercadoria)/, "produto"],
  [/(categoria|tipo|segmento)/, "categoria"],
  [/(status|situacao)/, "status"],
  [/(preco|valor|salario|custo|total|price|amount)/, "preco"],
  [/(quantidade|qtd|estoque|qty|count)/, "quantidade"],
  [/(percentual|desconto|taxa|percent)/, "percentual"],
  [/(descricao|observacao|comentario|obs|description)/, "descricao"],
  [/(url|site|link|imagem|foto|avatar)/, "url"],
  [/(nascimento|admissao|vencimento|data|date|dia)/, "data_passado"],
  [/(semestre|periodo)/, "semestre"],
  [/(criado|atualizado|created|updated|registro_em)/, "timestamp_recente"],
  [/(ativo|habilitado|is_|flag|aceita|possui)/, "booleano"],
  [/(codigo|sku|matricula|serie|numero)/, "codigo"],
];

function digits(rng: Random, count: number): string {
  let out = "";
  for (let i = 0; i < count; i += 1) out += rng.int(0, 9).toString();
  return out;
}

function cpf(rng: Random): string {
  const base: number[] = [];
  for (let i = 0; i < 9; i += 1) base.push(rng.int(0, 9));
  const digit = (slice: number[], start: number) => {
    const sum = slice.reduce((acc, value, index) => acc + value * (start - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = digit(base, 10);
  const d2 = digit([...base, d1], 11);
  const all = [...base, d1, d2].join("");
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`;
}

function cnpj(rng: Random): string {
  const base: number[] = [];
  for (let i = 0; i < 8; i += 1) base.push(rng.int(0, 9));
  base.push(0, 0, 0, 1);
  const calc = (slice: number[], weights: number[]) => {
    const sum = slice.reduce((acc, value, index) => acc + value * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const all = [...base, d1, d2].join("");
  return `${all.slice(0, 2)}.${all.slice(2, 5)}.${all.slice(5, 8)}/${all.slice(8, 12)}-${all.slice(12)}`;
}

function pad(value: number, size = 2): string {
  return value.toString().padStart(size, "0");
}

function dateShift(rng: Random, minDays: number, maxDays: number): Date {
  const base = new Date(2026, 0, 1);
  base.setDate(base.getDate() + rng.int(minDays, maxDays));
  return base;
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isoTimestamp(rng: Random, date: Date): string {
  return `${isoDate(date)} ${pad(rng.int(0, 23))}:${pad(rng.int(0, 59))}:${pad(rng.int(0, 59))}`;
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

type Primitive = string | number | boolean | null;

function runGenerator(key: string, rng: Random, index: number): Primitive {
  switch (key) {
    case "sequence":
      return index + 1;
    case "uuid": {
      const hex = "0123456789abcdef";
      let out = "";
      for (let i = 0; i < 32; i += 1) out += rng.pick(hex.split(""));
      return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-a${out.slice(17, 20)}-${out.slice(20, 32)}`;
    }
    case "codigo":
      return `${rng.pick(["AB", "CD", "EF", "GH", "JK"])}${digits(rng, 6)}`;
    case "nome_pessoa":
      return rng.pick(NOMES);
    case "sobrenome":
      return rng.pick(SOBRENOMES);
    case "nome_completo":
      return `${rng.pick(NOMES)} ${rng.pick(SOBRENOMES)}`;
    case "email":
      return `${slug(rng.pick(NOMES))}.${slug(rng.pick(SOBRENOMES))}${rng.int(1, 99)}@${rng.pick(["gmail.com", "outlook.com", "empresa.com.br", "uol.com.br"])}`;
    case "telefone":
      return `(${rng.pick(["45", "41", "44", "11", "51", "48"])}) 9${digits(rng, 4)}-${digits(rng, 4)}`;
    case "cpf":
      return cpf(rng);
    case "cnpj":
      return cnpj(rng);
    case "username":
      return `${slug(rng.pick(NOMES))}${rng.int(10, 999)}`;
    case "senha_hash":
      return `$2b$10$${digits(rng, 10)}${rng.pick(["abcdef", "ghijkl", "mnopqr"])}`;
    case "cep":
      return `${digits(rng, 5)}-${digits(rng, 3)}`;
    case "endereco":
      return `${rng.pick(LOGRADOUROS)}, ${rng.int(10, 2500)}`;
    case "cidade":
      return rng.pick(CIDADES);
    case "estado":
      return rng.pick(ESTADOS);
    case "empresa":
      return `${rng.pick(EMPRESAS)} ${rng.pick(["Ltda", "S.A.", "ME"])}`;
    case "produto":
      return rng.pick(PRODUTOS);
    case "categoria":
      return rng.pick(CATEGORIAS);
    case "status":
      return rng.pick(STATUS);
    case "preco":
      return Number((rng.int(500, 950000) / 100).toFixed(2));
    case "quantidade":
      return rng.int(1, 250);
    case "percentual":
      return Number((rng.next() * 100).toFixed(2));
    case "booleano":
      return rng.bool(0.7);
    case "data_passado":
      return isoDate(dateShift(rng, -730, 0));
    case "data_futuro":
      return isoDate(dateShift(rng, 1, 180));
    case "timestamp_recente":
      return isoTimestamp(rng, dateShift(rng, -180, 0));
    case "hora":
      return `${pad(rng.int(6, 22))}:${pad(rng.int(0, 59))}:00`;
    case "semestre":
      return `${rng.int(2023, 2026)}/${rng.int(1, 2)}`;
    case "frase":
      return `${rng.pick(PALAVRAS)} de ${rng.pick(PALAVRAS)} ${rng.int(1, 99)}`;
    case "descricao":
      return `Registro de ${rng.pick(PALAVRAS)} vinculado ao ${rng.pick(PALAVRAS)} numero ${rng.int(100, 9999)}, com acompanhamento de ${rng.pick(PALAVRAS)}.`;
    case "palavra":
      return rng.pick(PALAVRAS);
    case "url":
      return `https://www.${slug(rng.pick(EMPRESAS))}.com.br/${slug(rng.pick(PALAVRAS))}`;
    case "json_objeto":
      return JSON.stringify({ origem: rng.pick(PALAVRAS), peso: rng.int(1, 100) });
    default:
      return rng.pick(PALAVRAS);
  }
}

function heuristicFor(column: Column): string {
  const name = column.name.toLowerCase();
  for (const [pattern, generator] of HEURISTICS) {
    if (pattern.test(name)) return generator;
  }
  const kind = getType(column.type).kind;
  const byKind: Partial<Record<ValueKind, string>> = {
    int: "quantidade",
    float: "preco",
    money: "preco",
    text: "frase",
    bool: "booleano",
    date: "data_passado",
    time: "hora",
    timestamp: "timestamp_recente",
    uuid: "uuid",
    json: "json_objeto",
    array: "palavra",
    binary: "codigo",
    network: "codigo",
    geometric: "codigo",
    interval: "hora",
  };
  return byKind[kind] ?? "palavra";
}

/** limites de cada tipo inteiro do PostgreSQL */
const INT_RANGE: Record<string, number> = {
  smallint: 32767,
  smallserial: 32767,
  integer: 2147483647,
  serial: 2147483647,
  bigint: Number.MAX_SAFE_INTEGER,
  bigserial: Number.MAX_SAFE_INTEGER,
};

/**
 * Le restricoes CHECK simples da coluna para manter o valor gerado
 * dentro da faixa declarada. Cobre BETWEEN e comparacoes diretas.
 */
function checkBounds(column: Column): { min?: number; max?: number } {
  const check = column.check?.trim().toLowerCase();
  if (!check) return {};
  const name = column.name.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!name) return {};
  const number = String.raw`(-?\d+(?:\.\d+)?)`;
  const step = getType(column.type).kind === "int" ? 1 : 10 ** -(column.scale ?? 2);

  const between = check.match(new RegExp(`${name}\\s+between\\s+${number}\\s+and\\s+${number}`));
  if (between) return { min: Number(between[1]), max: Number(between[2]) };

  const bounds: { min?: number; max?: number } = {};
  const comparisons = check.matchAll(new RegExp(`${name}\\s*(>=|<=|>|<|=)\\s*${number}`, "g"));
  for (const match of comparisons) {
    const operator = match[1];
    const value = Number(match[2]);
    if (!Number.isFinite(value)) continue;
    if (operator === ">=") bounds.min = Math.max(bounds.min ?? value, value);
    else if (operator === ">") bounds.min = Math.max(bounds.min ?? value + step, value + step);
    else if (operator === "<=") bounds.max = Math.min(bounds.max ?? value, value);
    else if (operator === "<") bounds.max = Math.min(bounds.max ?? value - step, value - step);
    else if (operator === "=") {
      bounds.min = value;
      bounds.max = value;
    }
  }
  return bounds;
}

/** encaixa o valor na faixa mantendo variedade, em vez de grudar no limite */
function fitRange(value: number, bounds: { min?: number; max?: number }, isInt: boolean): number {
  const { min, max } = bounds;
  if (min !== undefined && max !== undefined && max > min) {
    const span = max - min;
    const wrapped = Math.abs(value) % (isInt ? span + 1 : span);
    return min + (isInt ? Math.round(wrapped) : wrapped);
  }
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

function coerce(value: Primitive, column: Column): Primitive {
  if (value === null) return null;
  const kind = getType(column.type).kind;

  if (kind === "int") {
    let parsed: number;
    if (typeof value === "number") parsed = Math.round(value);
    else if (typeof value === "boolean") parsed = value ? 1 : 0;
    else {
      const digits = Number(String(value).replace(/\D/g, "").slice(0, 6));
      parsed = Number.isFinite(digits) && digits > 0 ? digits : 1;
    }
    const limit = INT_RANGE[column.type] ?? 2147483647;
    parsed = Math.max(-limit, Math.min(limit, parsed));
    return Math.round(fitRange(parsed, checkBounds(column), true));
  }

  if (kind === "float" || kind === "money") {
    let parsed: number;
    if (typeof value === "number") parsed = value;
    else {
      const cleaned = Number(String(value).replace(/[^\d.]/g, ""));
      parsed = Number.isFinite(cleaned) ? cleaned : 0;
    }
    // numeric(p, s) so aceita valores abaixo de 10^(p - s)
    const type = getType(column.type);
    let scale = 2;
    if (type.args === "precision") {
      const precision = column.precision ?? type.defaultPrecision ?? 12;
      scale = column.scale ?? type.defaultScale ?? 2;
      const ceiling = 10 ** Math.max(1, precision - scale);
      parsed = Math.abs(parsed) % ceiling;
    }
    parsed = fitRange(parsed, checkBounds(column), false);
    return Number(parsed.toFixed(Math.max(0, scale)));
  }

  if (kind === "bool") {
    if (typeof value === "boolean") return value;
    return Boolean(value);
  }

  if (typeof value === "string" && column.length && value.length > column.length) {
    return value.slice(0, column.length);
  }

  return value;
}

/* ------------------------------------------------------------------ */
/* Geracao com integridade referencial                                 */
/* ------------------------------------------------------------------ */

export interface SimResult {
  data: SimData;
  warnings: string[];
}

export function simulate(diagram: Diagram, options: SimOptions): SimResult {
  const warnings: string[] = [];
  const { order, hasCycle } = topologicalOrder(diagram);
  if (hasCycle) {
    warnings.push(
      "O modelo tem ciclo de chaves estrangeiras. A ordem de geração pode não satisfazer todas as FKs.",
    );
  }

  const data: SimData = {};

  for (const table of order) {
    const rng = new Random(`${options.seed}:${table.schema}.${table.name}`);
    const rows: SimRow[] = [];
    const rowCount = Math.max(0, Math.min(2000, table.rowCount));

    // valores ja usados por coluna unica, para nao repetir
    const used = new Map<string, Set<string>>();
    // pool de valores do pai por coluna FK, consumido em 1:1
    const fkPools = new Map<string, Primitive[]>();

    for (const column of table.columns) {
      const relation = diagram.relations.find(
        (r) => r.targetTableId === table.id && r.targetColumnId === column.id,
      );
      if (!relation) continue;
      const parent = diagram.tables.find((t) => t.id === relation.sourceTableId);
      const parentRows = parent ? data[parent.id] : undefined;
      if (!parent || !parentRows || parentRows.length === 0) {
        warnings.push(
          `${table.name}.${column.name}: a tabela referenciada não tem linhas, a FK ficará nula.`,
        );
        fkPools.set(column.id, []);
        continue;
      }
      const values = parentRows.map((row) => row[relation.sourceColumnId] ?? null);
      if (relation.cardinality === "1:1") {
        const shuffled = [...values];
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
          const j = rng.int(0, i);
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        fkPools.set(column.id, shuffled);
        if (shuffled.length < rowCount) {
          warnings.push(
            `${table.name}: 1:1 com ${parent.name} permite no máximo ${shuffled.length} linhas.`,
          );
        }
      } else {
        fkPools.set(column.id, values);
      }
    }

    // gerador definitivo de cada coluna, resolvido uma vez por tabela
    const resolved = new Map<string, string>();
    for (const column of table.columns) {
      resolved.set(
        column.id,
        column.generator && column.generator !== "auto" ? column.generator : heuristicFor(column),
      );
    }
    const nameColumn = table.columns.find((column) => {
      const generator = resolved.get(column.id);
      return generator === "nome_completo" || generator === "nome_pessoa";
    });
    const emailColumn = table.columns.find((column) => resolved.get(column.id) === "email");

    const relationOf = (columnId: string) =>
      diagram.relations.find(
        (item) => item.targetTableId === table.id && item.targetColumnId === columnId,
      );
    const pkColumns = table.columns.filter((column) => column.isPrimary);
    const compositePk = pkColumns.length > 1;
    const seenPk = new Set<string>();
    const pkOf = (row: SimRow) => pkColumns.map((column) => String(row[column.id])).join("\u0001");

    for (let index = 0; index < rowCount; index += 1) {
      // identidade estavel da linha, usada pela grade e pelo cascade
      const row: SimRow = { [ROW_ID]: `${table.id}~${index}` };
      for (const column of table.columns) {
        const relation = diagram.relations.find(
          (r) => r.targetTableId === table.id && r.targetColumnId === column.id,
        );

        if (relation) {
          const pool = fkPools.get(column.id) ?? [];
          let value: Primitive;
          if (pool.length === 0) {
            value = null;
          } else if (relation.cardinality === "1:1") {
            value = index < pool.length ? pool[index] : null;
          } else {
            value = pool[rng.int(0, pool.length - 1)];
          }
          if (value === null && !column.nullable) {
            value = pool.length > 0 ? pool[0] : 1;
          }
          row[column.id] = value;
          continue;
        }

        const isSequential =
          column.isPrimary &&
          (isSerial(column.type) || column.identity || getType(column.type).kind === "int");

        if (isSequential) {
          row[column.id] = index + 1;
          continue;
        }

        const shouldBeNull =
          column.nullable &&
          !column.isPrimary &&
          !column.unique &&
          rng.next() < options.nullRate;

        if (shouldBeNull) {
          row[column.id] = null;
          continue;
        }

        const generatorKey = resolved.get(column.id) ?? heuristicFor(column);

        let value = coerce(runGenerator(generatorKey, rng, index), column);

        // numa PK composta a unicidade e do conjunto, nao de cada coluna
        if (column.unique || (column.isPrimary && !compositePk)) {
          const set = used.get(column.id) ?? new Set<string>();
          let attempt = 0;
          while (value !== null && set.has(String(value)) && attempt < 25) {
            value = coerce(runGenerator(generatorKey, rng, index + attempt + 1), column);
            attempt += 1;
          }
          if (value !== null && set.has(String(value))) {
            value =
              typeof value === "number"
                ? value + index + 1
                : `${value}_${index + 1}`;
          }
          set.add(String(value));
          used.set(column.id, set);
        }

        row[column.id] = value;
      }

      if (compositePk) {
        let attempts = 0;
        while (seenPk.has(pkOf(row)) && attempts < 60) {
          for (const column of pkColumns) {
            const relation = relationOf(column.id);
            if (relation) {
              const pool = fkPools.get(column.id) ?? [];
              if (pool.length > 0 && relation.cardinality !== "1:1") {
                row[column.id] = pool[rng.int(0, pool.length - 1)];
              }
            } else {
              row[column.id] = coerce(
                runGenerator(resolved.get(column.id) ?? "palavra", rng, index + attempts + 1),
                column,
              );
            }
          }
          attempts += 1;
        }
        if (seenPk.has(pkOf(row))) {
          warnings.push(
            `${table.name}: as combinações de chave primária se esgotaram, foram geradas ${rows.length} linhas.`,
          );
          break;
        }
        seenPk.add(pkOf(row));
      }

      // o e-mail nasce do nome da propria linha, senao a tabela fica incoerente
      if (nameColumn && emailColumn) {
        const person = row[nameColumn.id];
        const mail = row[emailColumn.id];
        if (typeof person === "string" && typeof mail === "string") {
          const domain = mail.split("@")[1] ?? "empresa.com.br";
          row[emailColumn.id] = coerce(`${slug(person)}${index + 1}@${domain}`, emailColumn);
        }
      }

      rows.push(row);
    }

    data[table.id] = rows;
  }

  for (const table of diagram.tables) {
    if (!data[table.id]) data[table.id] = [];
  }

  return { data, warnings };
}

/* ------------------------------------------------------------------ */
/* Linha avulsa                                                        */
/* ------------------------------------------------------------------ */

/**
 * Monta uma linha isolada para a tabela, usada quando o usuario clica em
 * "nova linha" na grade. Segue as mesmas regras da simulacao: FK sorteada
 * entre as linhas que ja existem no pai e PK inteira continuando a contagem.
 */
export function suggestRow(
  diagram: Diagram,
  data: SimData,
  table: Table,
  salt: string,
): SimRow {
  const rng = new Random(`${salt}:${table.name}:${(data[table.id] ?? []).length}`);
  const existing = data[table.id] ?? [];
  const row: SimRow = {};

  for (const column of table.columns) {
    const relation = diagram.relations.find(
      (item) => item.targetTableId === table.id && item.targetColumnId === column.id,
    );

    if (relation) {
      const parentRows = data[relation.sourceTableId] ?? [];
      if (parentRows.length === 0) {
        row[column.id] = null;
        continue;
      }
      if (relation.cardinality === "1:1") {
        // 1:1 nao pode reaproveitar um pai que ja foi consumido
        const taken = new Set(existing.map((item) => String(item[column.id])));
        const free = parentRows
          .map((item) => item[relation.sourceColumnId] ?? null)
          .filter((value) => !taken.has(String(value)));
        row[column.id] = free.length > 0 ? free[rng.int(0, free.length - 1)] : null;
        continue;
      }
      const pool = parentRows.map((item) => item[relation.sourceColumnId] ?? null);
      row[column.id] = pool[rng.int(0, pool.length - 1)];
      continue;
    }

    const sequential =
      column.isPrimary &&
      (isSerial(column.type) || column.identity || getType(column.type).kind === "int");

    if (sequential) {
      const max = existing.reduce((top, item) => {
        const value = Number(item[column.id]);
        return Number.isFinite(value) && value > top ? value : top;
      }, 0);
      row[column.id] = max + 1;
      continue;
    }

    const generator =
      column.generator && column.generator !== "auto" ? column.generator : heuristicFor(column);
    let value = coerce(runGenerator(generator, rng, existing.length), column);

    // repete o sorteio enquanto colidir com algum valor unico ja gravado
    if (column.unique || column.isPrimary) {
      const taken = new Set(existing.map((item) => String(item[column.id])));
      let attempt = 0;
      while (value !== null && taken.has(String(value)) && attempt < 25) {
        value = coerce(runGenerator(generator, rng, existing.length + attempt + 1), column);
        attempt += 1;
      }
    }

    row[column.id] = value;
  }

  return row;
}

/* ------------------------------------------------------------------ */
/* Exportacao                                                          */
/* ------------------------------------------------------------------ */

function literal(value: SimRow[string], column: Column): string {
  if (value === null) return "NULL";
  const kind = getType(column.type).kind;
  if (kind === "int" || kind === "float") return String(value);
  if (kind === "bool") return value ? "TRUE" : "FALSE";
  if (kind === "money") return `${quoteLiteral(String(value))}::money`;
  return quoteLiteral(String(value));
}

export function toInsertSql(diagram: Diagram, data: SimData): string {
  const { order } = topologicalOrder(diagram);
  const blocks: string[] = [
    `-- Dados simulados para ${diagram.name}`,
    "-- Ordem de inserção respeita as dependências de chave estrangeira",
  ];
  const sequences: string[] = [];

  for (const table of order) {
    const rows = data[table.id] ?? [];
    if (rows.length === 0) continue;
    const fq = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
    const columns = table.columns;
    const names = columns.map((c) => quoteIdent(c.name)).join(", ");
    const overriding = columns.some((c) => c.identity && !isSerial(c.type))
      ? " OVERRIDING SYSTEM VALUE"
      : "";
    const values = rows
      .map((row) => `  (${columns.map((c) => literal(row[c.id] ?? null, c)).join(", ")})`)
      .join(",\n");
    blocks.push(`INSERT INTO ${fq} (${names})${overriding} VALUES\n${values};`);

    for (const column of columns) {
      if (isSerial(column.type) || column.identity) {
        sequences.push(
          `SELECT setval(pg_get_serial_sequence('${table.schema}.${table.name}', '${column.name}'), COALESCE((SELECT MAX(${quoteIdent(column.name)}) FROM ${fq}), 1), true);`,
        );
      }
    }
  }

  if (sequences.length > 0) {
    blocks.push("-- Ajuste das sequences após a carga");
    blocks.push(sequences.join("\n"));
  }

  return `${blocks.join("\n\n")}\n`;
}

export function toCsv(table: Table, rows: SimRow[]): string {
  const header = table.columns.map((c) => c.name).join(",");
  const body = rows.map((row) =>
    table.columns
      .map((column) => {
        const value = row[column.id];
        if (value === null || value === undefined) return "";
        const text = String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(","),
  );
  return [header, ...body].join("\n");
}
