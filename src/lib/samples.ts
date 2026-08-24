import type { Column, Diagram, Relation, Table } from "./types";

type ColumnSeed = Partial<Column> & { name: string; type: string };

function col(tableId: string, seed: ColumnSeed): Column {
  return {
    id: `${tableId}.${seed.name}`,
    name: seed.name,
    type: seed.type,
    length: seed.length,
    precision: seed.precision,
    scale: seed.scale,
    isPrimary: seed.isPrimary ?? false,
    isForeign: seed.isForeign ?? false,
    nullable: seed.nullable ?? !(seed.isPrimary ?? false),
    unique: seed.unique ?? false,
    identity: seed.identity ?? false,
    defaultValue: seed.defaultValue,
    check: seed.check,
    comment: seed.comment,
    generator: seed.generator,
  };
}

function table(
  id: string,
  name: string,
  color: string,
  position: { x: number; y: number },
  columns: ColumnSeed[],
  extra: Partial<Table> = {},
): Table {
  return {
    id,
    name,
    schema: "public",
    color,
    position,
    rowCount: extra.rowCount ?? 12,
    comment: extra.comment,
    columns: columns.map((seed) => col(id, seed)),
  };
}

function relation(seed: Partial<Relation> & Pick<Relation, "id" | "sourceTableId" | "sourceColumnId" | "targetTableId" | "targetColumnId">): Relation {
  return {
    name: seed.name ?? "",
    cardinality: seed.cardinality ?? "1:N",
    identifying: seed.identifying ?? false,
    onDelete: seed.onDelete ?? "RESTRICT",
    onUpdate: seed.onUpdate ?? "CASCADE",
    ...seed,
  };
}

const vendas: Diagram = {
  name: "Vendas",
  tables: [
    table("t_cliente", "cliente", "#336791", { x: 40, y: 60 }, [
      { name: "id_cliente", type: "integer", isPrimary: true, identity: true },
      { name: "nome", type: "varchar", length: 120, nullable: false },
      { name: "email", type: "varchar", length: 160, nullable: false, unique: true },
      { name: "cpf", type: "char", length: 14, nullable: false, unique: true },
      { name: "criado_em", type: "timestamptz", nullable: false, defaultValue: "now()" },
    ], { comment: "Pessoa física que realiza pedidos", rowCount: 15 }),

    table("t_endereco", "endereco", "#2F6E7A", { x: 40, y: 380 }, [
      { name: "id_endereco", type: "integer", isPrimary: true, identity: true },
      { name: "id_cliente", type: "integer", isForeign: true, nullable: false },
      { name: "logradouro", type: "varchar", length: 160, nullable: false },
      { name: "cidade", type: "varchar", length: 80, nullable: false },
      { name: "uf", type: "char", length: 2, nullable: false },
      { name: "cep", type: "char", length: 9, nullable: false },
    ], { rowCount: 15 }),

    table("t_pedido", "pedido", "#B5642B", { x: 470, y: 60 }, [
      { name: "id_pedido", type: "integer", isPrimary: true, identity: true },
      { name: "id_cliente", type: "integer", isForeign: true, nullable: false },
      { name: "data_pedido", type: "date", nullable: false, defaultValue: "CURRENT_DATE" },
      { name: "status", type: "varchar", length: 20, nullable: false, defaultValue: "'pendente'" },
      { name: "valor_total", type: "numeric", precision: 12, scale: 2, nullable: false, defaultValue: "0" },
    ], { comment: "Cabeçalho do pedido", rowCount: 25 }),

    table("t_item", "item_pedido", "#6B4FBB", { x: 470, y: 380 }, [
      { name: "id_pedido", type: "integer", isPrimary: true, isForeign: true },
      { name: "id_produto", type: "integer", isPrimary: true, isForeign: true },
      { name: "quantidade", type: "integer", nullable: false, check: "quantidade > 0" },
      { name: "preco_unitario", type: "numeric", precision: 12, scale: 2, nullable: false },
    ], { comment: "Resolve o N:N entre pedido e produto", rowCount: 40 }),

    table("t_produto", "produto", "#1F7A5C", { x: 900, y: 380 }, [
      { name: "id_produto", type: "integer", isPrimary: true, identity: true },
      { name: "nome", type: "varchar", length: 120, nullable: false },
      { name: "categoria", type: "varchar", length: 60 },
      { name: "preco", type: "numeric", precision: 12, scale: 2, nullable: false },
      { name: "estoque", type: "integer", nullable: false, defaultValue: "0" },
    ], { rowCount: 12 }),
  ],
  relations: [
    relation({
      id: "r_cliente_endereco",
      name: "fk_endereco_cliente",
      sourceTableId: "t_cliente",
      sourceColumnId: "t_cliente.id_cliente",
      targetTableId: "t_endereco",
      targetColumnId: "t_endereco.id_cliente",
      onDelete: "CASCADE",
    }),
    relation({
      id: "r_cliente_pedido",
      name: "fk_pedido_cliente",
      sourceTableId: "t_cliente",
      sourceColumnId: "t_cliente.id_cliente",
      targetTableId: "t_pedido",
      targetColumnId: "t_pedido.id_cliente",
    }),
    relation({
      id: "r_pedido_item",
      name: "fk_item_pedido",
      sourceTableId: "t_pedido",
      sourceColumnId: "t_pedido.id_pedido",
      targetTableId: "t_item",
      targetColumnId: "t_item.id_pedido",
      identifying: true,
      onDelete: "CASCADE",
    }),
    relation({
      id: "r_produto_item",
      name: "fk_item_produto",
      sourceTableId: "t_produto",
      sourceColumnId: "t_produto.id_produto",
      targetTableId: "t_item",
      targetColumnId: "t_item.id_produto",
      identifying: true,
    }),
  ],
};

const academico: Diagram = {
  name: "Acadêmico",
  tables: [
    table("a_aluno", "aluno", "#336791", { x: 40, y: 60 }, [
      { name: "id_aluno", type: "integer", isPrimary: true, identity: true },
      { name: "matricula", type: "char", length: 10, nullable: false, unique: true },
      { name: "nome", type: "varchar", length: 120, nullable: false },
      { name: "email", type: "varchar", length: 160, nullable: false, unique: true },
      { name: "ingresso", type: "date", nullable: false },
    ], { rowCount: 20 }),

    table("a_professor", "professor", "#8E2F4A", { x: 900, y: 60 }, [
      { name: "id_professor", type: "integer", isPrimary: true, identity: true },
      { name: "nome", type: "varchar", length: 120, nullable: false },
      { name: "titulacao", type: "varchar", length: 40 },
    ], { rowCount: 8 }),

    table("a_disciplina", "disciplina", "#1F7A5C", { x: 470, y: 60 }, [
      { name: "id_disciplina", type: "integer", isPrimary: true, identity: true },
      { name: "id_professor", type: "integer", isForeign: true },
      { name: "codigo", type: "char", length: 8, nullable: false, unique: true },
      { name: "nome", type: "varchar", length: 120, nullable: false },
      { name: "carga_horaria", type: "smallint", nullable: false, check: "carga_horaria > 0" },
    ], { rowCount: 10 }),

    table("a_matricula", "matricula_disciplina", "#6B4FBB", { x: 250, y: 400 }, [
      { name: "id_aluno", type: "integer", isPrimary: true, isForeign: true },
      { name: "id_disciplina", type: "integer", isPrimary: true, isForeign: true },
      { name: "semestre", type: "char", length: 6, isPrimary: true },
      { name: "nota", type: "numeric", precision: 4, scale: 2, check: "nota between 0 and 10" },
      { name: "frequencia", type: "smallint" },
    ], { comment: "Resolve o N:N entre aluno e disciplina", rowCount: 45 }),
  ],
  relations: [
    relation({
      id: "a_r_prof_disc",
      name: "fk_disciplina_professor",
      sourceTableId: "a_professor",
      sourceColumnId: "a_professor.id_professor",
      targetTableId: "a_disciplina",
      targetColumnId: "a_disciplina.id_professor",
      onDelete: "SET NULL",
    }),
    relation({
      id: "a_r_aluno_mat",
      name: "fk_matricula_aluno",
      sourceTableId: "a_aluno",
      sourceColumnId: "a_aluno.id_aluno",
      targetTableId: "a_matricula",
      targetColumnId: "a_matricula.id_aluno",
      identifying: true,
      onDelete: "CASCADE",
    }),
    relation({
      id: "a_r_disc_mat",
      name: "fk_matricula_disciplina",
      sourceTableId: "a_disciplina",
      sourceColumnId: "a_disciplina.id_disciplina",
      targetTableId: "a_matricula",
      targetColumnId: "a_matricula.id_disciplina",
      identifying: true,
    }),
  ],
};

export const TEMPLATES: Array<{ key: string; label: string; description: string; diagram: Diagram }> = [
  {
    key: "vendas",
    label: "Vendas",
    description: "Cliente, pedido, produto e item com PFK composta",
    diagram: vendas,
  },
  {
    key: "academico",
    label: "Acadêmico",
    description: "Aluno, disciplina, professor e matrícula com PK de três colunas",
    diagram: academico,
  },
];

export function emptyDiagram(): Diagram {
  return { name: "Novo modelo", tables: [], relations: [] };
}

export function cloneTemplate(key: string): Diagram {
  const template = TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];
  return structuredClone(template.diagram);
}
