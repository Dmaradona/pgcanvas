-- Acadêmico
-- DDL PostgreSQL gerado pelo pgcanvas
-- Tabelas: 4 | Relacionamentos: 3

-- --------------------------------------------------------------------
-- Tabelas
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.aluno (
  id_aluno   integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  matricula  char(10) NOT NULL,
  nome       varchar(120) NOT NULL,
  email      varchar(160) NOT NULL,
  ingresso   date NOT NULL,
  CONSTRAINT pk_aluno PRIMARY KEY (id_aluno),
  CONSTRAINT uq_aluno_matricula UNIQUE (matricula),
  CONSTRAINT uq_aluno_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.professor (
  id_professor  integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome          varchar(120) NOT NULL,
  titulacao     varchar(40),
  CONSTRAINT pk_professor PRIMARY KEY (id_professor)
);

CREATE TABLE IF NOT EXISTS public.disciplina (
  id_disciplina  integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_professor   integer,
  codigo         char(8) NOT NULL,
  nome           varchar(120) NOT NULL,
  carga_horaria  smallint NOT NULL,
  CONSTRAINT pk_disciplina PRIMARY KEY (id_disciplina),
  CONSTRAINT uq_disciplina_codigo UNIQUE (codigo),
  CONSTRAINT ck_disciplina_carga_horaria CHECK (carga_horaria > 0)
);

CREATE TABLE IF NOT EXISTS public.matricula_disciplina (
  id_aluno       integer NOT NULL,
  id_disciplina  integer NOT NULL,
  semestre       char(6) NOT NULL,
  nota           numeric(4, 2),
  frequencia     smallint,
  CONSTRAINT pk_matricula_disciplina PRIMARY KEY (id_aluno, id_disciplina, semestre),
  CONSTRAINT ck_matricula_disciplina_nota CHECK (nota between 0 and 10)
);

-- --------------------------------------------------------------------
-- Chaves estrangeiras
-- --------------------------------------------------------------------

ALTER TABLE public.disciplina
  ADD CONSTRAINT fk_disciplina_professor FOREIGN KEY (id_professor)
  REFERENCES public.professor (id_professor)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.matricula_disciplina
  ADD CONSTRAINT fk_matricula_aluno FOREIGN KEY (id_aluno)
  REFERENCES public.aluno (id_aluno)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.matricula_disciplina
  ADD CONSTRAINT fk_matricula_disciplina FOREIGN KEY (id_disciplina)
  REFERENCES public.disciplina (id_disciplina)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- --------------------------------------------------------------------
-- Índices
-- --------------------------------------------------------------------

CREATE INDEX idx_disciplina_id_professor ON public.disciplina (id_professor);

-- --------------------------------------------------------------------
-- Documentação
-- --------------------------------------------------------------------

COMMENT ON TABLE public.matricula_disciplina IS 'Resolve o N:N entre aluno e disciplina';

-- Dados simulados para Acadêmico

-- Ordem de inserção respeita as dependências de chave estrangeira

INSERT INTO public.aluno (id_aluno, matricula, nome, email, ingresso) OVERRIDING SYSTEM VALUE VALUES
  (1, 'CD512825', 'Bruno Fernandes', 'bruno.fernandes1@empresa.com.br', '2025-03-30'),
  (2, 'CD882038', 'Nicolas Silva', 'nicolas.silva2@uol.com.br', '2025-08-03'),
  (3, 'JK573962', 'Felipe Pereira', 'felipe.pereira3@empresa.com.br', '2025-02-03'),
  (4, 'JK432397', 'Mariana Oliveira', 'mariana.oliveira4@empresa.com.br', '2024-03-27'),
  (5, 'GH599201', 'Gabriela Pereira', 'gabriela.pereira5@uol.com.br', '2024-03-14'),
  (6, 'JK333061', 'Paula Rodrigues', 'paula.rodrigues6@empresa.com.br', '2025-01-25'),
  (7, 'GH073476', 'Nicolas Souza', 'nicolas.souza7@uol.com.br', '2025-07-05'),
  (8, 'GH612749', 'Felipe Lopes', 'felipe.lopes8@outlook.com', '2024-04-07'),
  (9, 'JK233201', 'Yasmin Almeida', 'yasmin.almeida9@uol.com.br', '2025-01-22'),
  (10, 'EF925307', 'Isabela Soares', 'isabela.soares10@gmail.com', '2024-08-01'),
  (11, 'GH512099', 'Paula Souza', 'paula.souza11@empresa.com.br', '2025-01-20'),
  (12, 'AB309005', 'Bruno Rodrigues', 'bruno.rodrigues12@empresa.com.br', '2024-04-21'),
  (13, 'GH606525', 'João Silva', 'joao.silva13@outlook.com', '2024-08-31'),
  (14, 'GH906365', 'Ana Gomes', 'ana.gomes14@uol.com.br', '2025-09-22'),
  (15, 'EF466566', 'Nicolas Lopes', 'nicolas.lopes15@outlook.com', '2025-02-07'),
  (16, 'CD881512', 'Yasmin Souza', 'yasmin.souza16@empresa.com.br', '2025-11-16'),
  (17, 'EF300273', 'Lucas Lopes', 'lucas.lopes17@empresa.com.br', '2025-10-12'),
  (18, 'EF555117', 'Nicolas Silva', 'nicolas.silva18@uol.com.br', '2025-05-29'),
  (19, 'JK218895', 'Yasmin Santos', 'yasmin.santos19@uol.com.br', '2024-02-08'),
  (20, 'CD730824', 'Lucas Santos', 'lucas.santos20@gmail.com', '2024-09-04');

INSERT INTO public.professor (id_professor, nome, titulacao) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Paula Lima', 'histórico de cadastro 54'),
  (2, 'William Gomes', 'contrato de relatório 13'),
  (3, 'Gabriela Pereira', 'entrega de análise 82'),
  (4, 'Diego Ribeiro', 'estoque de estoque 44'),
  (5, 'Thiago Fernandes', 'pedido de consulta 97'),
  (6, 'Nicolas Silva', 'cadastro de relatório 79'),
  (7, 'Thiago Costa', 'estoque de vendas 89'),
  (8, 'Thiago Lopes', 'vendas de entrega 67');

INSERT INTO public.disciplina (id_disciplina, id_professor, codigo, nome, carga_horaria) OVERRIDING SYSTEM VALUE VALUES
  (1, 4, 'GH346520', 'Thiago Souza', 67),
  (2, 8, 'AB431222', 'Vanessa Santos', 98),
  (3, 2, 'EF990550', 'João Almeida', 146),
  (4, 1, 'GH334731', 'João Soares', 143),
  (5, 1, 'CD018186', 'Lucas Carvalho', 238),
  (6, 4, 'EF187632', 'William Souza', 159),
  (7, 8, 'AB875281', 'Felipe Alves', 244),
  (8, 5, 'GH645770', 'João Rodrigues', 156),
  (9, 6, 'JK519984', 'Ana Oliveira', 175),
  (10, 6, 'GH656683', 'Thiago Ribeiro', 183);

INSERT INTO public.matricula_disciplina (id_aluno, id_disciplina, semestre, nota, frequencia) VALUES
  (10, 3, '2024/2', 0.99, 206),
  (8, 7, '2024/2', 4.44, 27),
  (13, 4, '2023/2', 7.88, 174),
  (11, 10, '2025/2', 4.81, 28),
  (14, 1, '2023/1', 0.03, 46),
  (20, 7, '2026/2', 4.11, 2),
  (1, 3, '2024/1', 2.59, 25),
  (18, 9, '2026/2', 4.08, 143),
  (4, 6, '2023/1', 8.16, 160),
  (7, 3, '2026/2', NULL, NULL),
  (20, 4, '2026/1', 8.61, 137),
  (8, 4, '2023/1', 7.13, 158),
  (11, 4, '2024/1', NULL, 65),
  (19, 4, '2026/2', 1.54, 2),
  (19, 7, '2025/2', NULL, 217),
  (6, 1, '2026/2', 6.13, 2),
  (7, 6, '2026/2', 5.47, 229),
  (4, 2, '2023/2', 1.9, 237),
  (1, 10, '2024/1', 8.96, 146),
  (8, 3, '2026/1', 9.27, NULL),
  (18, 6, '2023/1', 4.95, 142),
  (20, 5, '2023/1', 0.05, 8),
  (5, 3, '2024/1', 6.7, 55),
  (6, 6, '2025/2', NULL, 79),
  (7, 9, '2023/2', 1.39, 230),
  (4, 2, '2024/2', 9.09, 159),
  (5, 4, '2025/1', 4.33, 96),
  (1, 7, '2024/2', NULL, 154),
  (15, 9, '2023/2', 1.29, 210),
  (19, 1, '2026/1', 8.27, 16),
  (19, 5, '2025/2', 4.15, 112),
  (1, 5, '2026/1', 3.03, 60),
  (5, 2, '2026/2', 8.79, 195),
  (12, 5, '2026/1', NULL, NULL),
  (13, 8, '2023/2', 3.6, 136),
  (20, 5, '2026/2', 3.33, 151),
  (19, 10, '2026/2', 6.3, 99),
  (1, 6, '2023/1', 9.76, 173),
  (17, 8, '2024/2', 6.84, 37),
  (3, 10, '2023/2', 7.44, 18),
  (12, 2, '2024/1', 4.51, 151),
  (18, 1, '2026/1', 6.13, 173),
  (6, 1, '2026/1', NULL, 92),
  (11, 2, '2026/1', 3.72, 222),
  (18, 8, '2026/1', 0.19, NULL);

-- Ajuste das sequences após a carga

SELECT setval(pg_get_serial_sequence('public.aluno', 'id_aluno'), COALESCE((SELECT MAX(id_aluno) FROM public.aluno), 1), true);
SELECT setval(pg_get_serial_sequence('public.professor', 'id_professor'), COALESCE((SELECT MAX(id_professor) FROM public.professor), 1), true);
SELECT setval(pg_get_serial_sequence('public.disciplina', 'id_disciplina'), COALESCE((SELECT MAX(id_disciplina) FROM public.disciplina), 1), true);
