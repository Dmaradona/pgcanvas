-- Vendas
-- DDL PostgreSQL gerado pelo pgcanvas
-- Tabelas: 5 | Relacionamentos: 4

-- --------------------------------------------------------------------
-- Tabelas
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cliente (
  id_cliente  integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome        varchar(120) NOT NULL,
  email       varchar(160) NOT NULL,
  cpf         char(14) NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_cliente PRIMARY KEY (id_cliente),
  CONSTRAINT uq_cliente_email UNIQUE (email),
  CONSTRAINT uq_cliente_cpf UNIQUE (cpf)
);

CREATE TABLE IF NOT EXISTS public.endereco (
  id_endereco  integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_cliente   integer NOT NULL,
  logradouro   varchar(160) NOT NULL,
  cidade       varchar(80) NOT NULL,
  uf           char(2) NOT NULL,
  cep          char(9) NOT NULL,
  CONSTRAINT pk_endereco PRIMARY KEY (id_endereco)
);

CREATE TABLE IF NOT EXISTS public.pedido (
  id_pedido    integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_cliente   integer NOT NULL,
  data_pedido  date NOT NULL DEFAULT CURRENT_DATE,
  status       varchar(20) NOT NULL DEFAULT 'pendente',
  valor_total  numeric(12, 2) NOT NULL DEFAULT 0,
  CONSTRAINT pk_pedido PRIMARY KEY (id_pedido)
);

CREATE TABLE IF NOT EXISTS public.item_pedido (
  id_pedido       integer NOT NULL,
  id_produto      integer NOT NULL,
  quantidade      integer NOT NULL,
  preco_unitario  numeric(12, 2) NOT NULL,
  CONSTRAINT pk_item_pedido PRIMARY KEY (id_pedido, id_produto),
  CONSTRAINT ck_item_pedido_quantidade CHECK (quantidade > 0)
);

CREATE TABLE IF NOT EXISTS public.produto (
  id_produto  integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome        varchar(120) NOT NULL,
  categoria   varchar(60),
  preco       numeric(12, 2) NOT NULL,
  estoque     integer NOT NULL DEFAULT 0,
  CONSTRAINT pk_produto PRIMARY KEY (id_produto)
);

-- --------------------------------------------------------------------
-- Chaves estrangeiras
-- --------------------------------------------------------------------

ALTER TABLE public.endereco
  ADD CONSTRAINT fk_endereco_cliente FOREIGN KEY (id_cliente)
  REFERENCES public.cliente (id_cliente)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.pedido
  ADD CONSTRAINT fk_pedido_cliente FOREIGN KEY (id_cliente)
  REFERENCES public.cliente (id_cliente)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.item_pedido
  ADD CONSTRAINT fk_item_pedido FOREIGN KEY (id_pedido)
  REFERENCES public.pedido (id_pedido)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.item_pedido
  ADD CONSTRAINT fk_item_produto FOREIGN KEY (id_produto)
  REFERENCES public.produto (id_produto)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- --------------------------------------------------------------------
-- Índices
-- --------------------------------------------------------------------

CREATE INDEX idx_endereco_id_cliente ON public.endereco (id_cliente);
CREATE INDEX idx_pedido_id_cliente ON public.pedido (id_cliente);

-- --------------------------------------------------------------------
-- Documentação
-- --------------------------------------------------------------------

COMMENT ON TABLE public.cliente IS 'Pessoa física que realiza pedidos';
COMMENT ON TABLE public.pedido IS 'Cabeçalho do pedido';
COMMENT ON TABLE public.item_pedido IS 'Resolve o N:N entre pedido e produto';

-- Dados simulados para Vendas

-- Ordem de inserção respeita as dependências de chave estrangeira

INSERT INTO public.cliente (id_cliente, nome, email, cpf, criado_em) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Henrique Barbosa', 'henrique.barbosa1@outlook.com', '902.255.746-40', '2025-11-28 12:16:57'),
  (2, 'Nicolas Lopes', 'nicolas.lopes2@empresa.com.br', '818.863.848-00', '2025-07-24 18:22:05'),
  (3, 'Henrique Rodrigues', 'henrique.rodrigues3@empresa.com.br', '547.458.771-61', '2025-07-23 18:26:40'),
  (4, 'Lucas Lopes', 'lucas.lopes4@gmail.com', '616.970.072-60', '2025-12-14 01:37:51'),
  (5, 'Vanessa Almeida', 'vanessa.almeida5@empresa.com.br', '325.412.196-10', '2025-10-17 15:22:19'),
  (6, 'Sofia Gomes', 'sofia.gomes6@uol.com.br', '786.863.263-15', '2025-10-23 20:16:14'),
  (7, 'Karina Lopes', 'karina.lopes7@gmail.com', '026.169.472-34', '2025-10-25 06:50:52'),
  (8, 'Henrique Lima', 'henrique.lima8@uol.com.br', '524.564.054-63', '2025-07-17 00:28:05'),
  (9, 'Sofia Soares', 'sofia.soares9@uol.com.br', '682.967.554-59', '2025-09-12 15:50:13'),
  (10, 'Lucas Barbosa', 'lucas.barbosa10@outlook.com', '449.792.022-41', '2025-09-28 17:15:32'),
  (11, 'Otávio Pereira', 'otavio.pereira11@empresa.com.br', '757.461.939-50', '2025-07-25 01:47:25'),
  (12, 'Felipe Ferreira', 'felipe.ferreira12@uol.com.br', '587.136.217-69', '2025-10-08 19:04:18'),
  (13, 'Vanessa Almeida', 'vanessa.almeida13@outlook.com', '490.493.290-04', '2025-10-23 00:02:57'),
  (14, 'Eduarda Costa', 'eduarda.costa14@outlook.com', '451.694.762-56', '2025-11-26 20:52:29'),
  (15, 'Thiago Fernandes', 'thiago.fernandes15@outlook.com', '009.615.961-80', '2025-08-09 22:35:24');

INSERT INTO public.produto (id_produto, nome, categoria, preco, estoque) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Ana Carvalho', 'Informática', 5542.16, 112),
  (2, 'Mariana Fernandes', 'Manutenção', 533.64, 28),
  (3, 'Otávio Vieira', 'Manutenção', 971.26, 117),
  (4, 'Nicolas Gomes', 'Informática', 9181.85, 132),
  (5, 'Vanessa Vieira', 'Licenças', 3001.68, 195),
  (6, 'Sofia Barbosa', NULL, 9083.08, 26),
  (7, 'Beatriz Santos', 'Periféricos', 8110.01, 113),
  (8, 'João Costa', 'Licenças', 286.61, 135),
  (9, 'Diego Rodrigues', 'Informática', 3986.61, 93),
  (10, 'Vanessa Oliveira', 'Serviços', 4179.87, 103),
  (11, 'Felipe Silva', 'Papelaria', 4861.35, 86),
  (12, 'William Gomes', 'Manutenção', 1357.49, 125);

INSERT INTO public.endereco (id_endereco, id_cliente, logradouro, cidade, uf, cep) OVERRIDING SYSTEM VALUE VALUES
  (1, 15, 'Rua das Palmeiras, 2169', 'Maringá', 'RS', '74437-774'),
  (2, 1, 'Rua Paraná, 1208', 'Paranaguá', 'CE', '74123-923'),
  (3, 11, 'Rua Sete de Setembro, 1140', 'Toledo', 'PE', '86623-962'),
  (4, 7, 'Travessa Ipe, 702', 'Paranaguá', 'RS', '39001-588'),
  (5, 7, 'Rua Paraná, 1658', 'Guarapuava', 'PE', '17507-370'),
  (6, 11, 'Travessa Ipe, 1444', 'Marechal Cândido Rondon', 'MT', '25144-960'),
  (7, 11, 'Rua Paraná, 1045', 'Umuarama', 'BA', '15653-737'),
  (8, 14, 'Rua Sete de Setembro, 787', 'Pato Branco', 'SP', '28611-427'),
  (9, 14, 'Rua Sao Paulo, 1354', 'Toledo', 'BA', '83208-998'),
  (10, 15, 'Rua Paraná, 983', 'Maringá', 'BA', '80077-210'),
  (11, 5, 'Avenida Brasil, 1157', 'Marechal Cândido Rondon', 'MT', '93621-076'),
  (12, 3, 'Rua Paraná, 734', 'Campo Mourão', 'CE', '48588-802'),
  (13, 7, 'Rua das Palmeiras, 1601', 'Paranaguá', 'MS', '83528-750'),
  (14, 4, 'Rua das Palmeiras, 33', 'Ponta Grossa', 'MT', '37232-657'),
  (15, 4, 'Rua Paraná, 838', 'Guarapuava', 'RS', '52919-412');

INSERT INTO public.pedido (id_pedido, id_cliente, data_pedido, status, valor_total) OVERRIDING SYSTEM VALUE VALUES
  (1, 10, '2025-05-31', 'cancelado', 7506.25),
  (2, 10, '2025-04-26', 'pendente', 2072.69),
  (3, 6, '2024-02-28', 'aprovado', 825.84),
  (4, 7, '2024-12-11', 'aprovado', 8660.44),
  (5, 14, '2025-09-23', 'cancelado', 6610.56),
  (6, 11, '2024-09-15', 'em_transporte', 1193.76),
  (7, 15, '2024-01-13', 'aprovado', 3122.28),
  (8, 11, '2024-02-05', 'pendente', 7625.12),
  (9, 9, '2025-05-11', 'entregue', 8450.56),
  (10, 8, '2024-06-22', 'em_transporte', 4386.22),
  (11, 14, '2025-08-08', 'aprovado', 1642.84),
  (12, 3, '2025-02-18', 'em_transporte', 7654.32),
  (13, 14, '2025-04-25', 'cancelado', 5714.64),
  (14, 4, '2025-06-15', 'cancelado', 1774.32),
  (15, 7, '2025-12-20', 'em_transporte', 2955.78),
  (16, 8, '2024-08-13', 'cancelado', 2816.91),
  (17, 4, '2025-06-07', 'aprovado', 8777.39),
  (18, 14, '2025-08-10', 'entregue', 8752.83),
  (19, 15, '2024-05-15', 'pendente', 5177.86),
  (20, 3, '2025-06-20', 'entregue', 3338.22),
  (21, 8, '2025-05-24', 'em_transporte', 2165.12),
  (22, 9, '2025-06-11', 'cancelado', 4657.37),
  (23, 7, '2024-04-19', 'em_transporte', 3098.71),
  (24, 12, '2024-06-20', 'entregue', 2806.79),
  (25, 15, '2025-07-02', 'cancelado', 1277.04);

INSERT INTO public.item_pedido (id_pedido, id_produto, quantidade, preco_unitario) VALUES
  (20, 7, 176, 3190.35),
  (17, 8, 110, 8922.84),
  (18, 2, 92, 895.04),
  (14, 11, 217, 9280.68),
  (8, 6, 214, 5245.19),
  (7, 8, 91, 9177.78),
  (8, 11, 141, 913.09),
  (9, 11, 107, 9362.74),
  (12, 1, 122, 1135.68),
  (5, 3, 143, 2587.74),
  (15, 11, 52, 7845.1),
  (9, 9, 105, 4212.4),
  (25, 5, 63, 1403.94),
  (23, 6, 205, 413.01),
  (18, 1, 230, 1338.76),
  (16, 6, 242, 1356.05),
  (7, 10, 134, 1267.28),
  (7, 11, 80, 6413.61),
  (16, 1, 226, 8211.14),
  (21, 1, 5, 6233.25),
  (21, 10, 61, 3587.76),
  (8, 12, 235, 6920.69),
  (10, 3, 154, 9346.95),
  (14, 5, 189, 5320.61),
  (24, 7, 2, 7474.4),
  (18, 8, 125, 2422.91),
  (4, 2, 74, 9424.21),
  (23, 12, 214, 3207.62),
  (25, 11, 74, 5410.83),
  (6, 12, 221, 8631.01),
  (3, 11, 139, 3835.17),
  (15, 9, 172, 603.12),
  (1, 7, 194, 5665.95),
  (15, 2, 181, 7492.68),
  (25, 4, 161, 2099.03),
  (5, 1, 18, 1250.76),
  (4, 12, 173, 1468.88),
  (22, 11, 246, 5343.33),
  (9, 7, 236, 5230.6),
  (20, 9, 43, 7633.13);

-- Ajuste das sequences após a carga

SELECT setval(pg_get_serial_sequence('public.cliente', 'id_cliente'), COALESCE((SELECT MAX(id_cliente) FROM public.cliente), 1), true);
SELECT setval(pg_get_serial_sequence('public.produto', 'id_produto'), COALESCE((SELECT MAX(id_produto) FROM public.produto), 1), true);
SELECT setval(pg_get_serial_sequence('public.endereco', 'id_endereco'), COALESCE((SELECT MAX(id_endereco) FROM public.endereco), 1), true);
SELECT setval(pg_get_serial_sequence('public.pedido', 'id_pedido'), COALESCE((SELECT MAX(id_pedido) FROM public.pedido), 1), true);
