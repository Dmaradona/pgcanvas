# pgcanvas

Construtor visual de modelos de dados PostgreSQL, com geração de DDL e simulação de dados que respeita integridade referencial. Roda inteiro no navegador, sem backend e sem conta.

Ao abrir, você escolhe por onde começar: modelo em branco, um modelo pronto ou um script DDL que já existe. Nada é imposto e nada precisa de conta.

Três modos de trabalho:

- **Modelador**: canvas estilo quadro branco para desenhar tabelas, atributos e relacionamentos.
- **Simulação**: gera linhas realistas a partir do modelo, na ordem correta das chaves estrangeiras, e deixa editar tudo à mão.
- **Demonstração**: canvas com os dados dentro dos cards, cinco linhas por tabela, para apagar uma linha e ver o cascade acontecer.

## Como rodar

Precisa de Node 20.9 ou superior.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

Outros comandos:

```bash
npm run build   # build de produção
npm start       # sobe o build
npm run lint    # ESLint
```

O trabalho fica salvo no próprio navegador, sem conta e sem servidor. Para levar para outra máquina, exporte JSON, DDL, `INSERT` ou CSV.

## Modelador

**Criar tabela**: botão "Nova tabela" na lateral, na barra do canvas, ou duplo clique no canvas.

**Criar coluna**: o botão `+ Adicionar coluna` no pé do card, o `+` no cabeçalho do card, o `+` que aparece ao passar o mouse na lista lateral, ou o botão "Nova coluna" no painel da tabela. A coluna nova já nasce selecionada, com o editor aberto.

**Criar relacionamento**: passe o mouse sobre a coluna que será referenciada (normalmente a PK), arraste da bolinha lateral até a coluna que vai receber a FK. A direção importa: sai do lado 1, chega no lado N. Vale qualquer lado do card, porque a direção vem do gesto: quem começa o arrasto é a coluna referenciada.

**Inverter relacionamento**: no painel do relacionamento, "Inverter direção" troca quem referencia por quem recebe a FK. Serve para consertar uma ligação feita ao contrário sem apagar e refazer, e devolve a marca de PK para a coluna que tinha virado PFK sem querer.

**Editor de coluna** (clique numa coluna do card): o topo do painel mostra de cara o que a coluna é, com as etiquetas de chave, tipo, `NOT NULL`, `UNIQUE`, `IDENTITY`, `DEFAULT` e `CHECK`, mais a linha de DDL que ela vai gerar. Logo abaixo tem a navegação entre as colunas da tabela, sem precisar voltar para a lista.

O corpo do painel é dividido em seções:

- **Identificação**: nome e catálogo completo de tipos PostgreSQL agrupado por família, com parâmetros de `varchar(n)` e `numeric(p, s)`
- **Papel na chave**: **Comum**, **PK**, **FK** ou **PFK**, com o atalho para o relacionamento quando a coluna é FK
- **Restrições**: `NOT NULL`, `UNIQUE`, `GENERATED ALWAYS AS IDENTITY`, valor padrão e expressão `CHECK`
- **Documentação e dados**: comentário e gerador usado na simulação

**Notação no canvas**: pé de galinha no lado N, traço simples no lado 1. Linha cheia é relacionamento identificador (a FK compõe a PK), linha tracejada é relacionamento comum.

**N:N**: escolha a cardinalidade N:N no painel do relacionamento e clique em "Criar tabela associativa". O app gera a tabela do meio com as duas colunas PFK e as duas FKs identificadoras.

**Atalhos**: `Ctrl+Z` desfaz, `Ctrl+Shift+Z` refaz, `Delete` remove a tabela ou o relacionamento selecionado.

### DDL gerado

O painel DDL produz script PostgreSQL pronto para rodar:

- `CREATE TABLE` com colunas alinhadas, PK composta, `UNIQUE` e `CHECK` nomeados
- FKs como `ALTER TABLE ... ADD CONSTRAINT` separados, o que evita problema de ordem entre tabelas
- Índices nas colunas de FK
- `COMMENT ON TABLE` e `COMMENT ON COLUMN`
- Opções de `IF NOT EXISTS`, bloco `DROP` e schemas

### Importar DDL

O botão de código na barra superior abre a leitura de DDL: cole o script ou abra um arquivo `.sql` e o app monta o diagrama. Serve tanto para trazer um banco que já existe quanto para conferir um script de prova.

O leitor entende:

- `CREATE TABLE` com schema, `IF NOT EXISTS` e identificadores entre aspas
- Tipos com os apelidos do PostgreSQL: `character varying`, `int4`, `int8`, `bool`, `timestamp with time zone`, `float8`, `text[]` e companhia
- `NOT NULL`, `PRIMARY KEY`, `UNIQUE`, `CHECK`, `DEFAULT`, `GENERATED ALWAYS AS IDENTITY`
- Constraints de tabela e de coluna, inclusive `REFERENCES` na própria coluna
- `ALTER TABLE ... ADD CONSTRAINT` de PK, UNIQUE, CHECK e FOREIGN KEY, no formato que o `pg_dump` usa
- `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` e `SET DEFAULT`
- `CREATE UNIQUE INDEX` de uma coluna, que vira `UNIQUE`
- `COMMENT ON TABLE` e `COMMENT ON COLUMN`
- `integer DEFAULT nextval(...)`, que volta a ser `serial`

O que não cabe no modelo vira aviso na tela antes de você confirmar: FK composta (que é quebrada em um relacionamento por coluna), `UNIQUE` composto, tipo desconhecido (que entra como `text`), coluna gerada e instrução ignorada. As tabelas são posicionadas por profundidade de dependência, pai à esquerda e filho à direita.

O caminho de ida e volta é fechado: o DDL que o pgcanvas gera é lido de volta sem perder nada.

### Validação

O painel de validação aponta, entre outros:

- Tabela sem chave primária
- Tipos incompatíveis entre a PK referenciada e a FK
- Coluna referenciada que não é PK nem UNIQUE
- `ON DELETE SET NULL` em coluna `NOT NULL`
- Cardinalidade 1:1 sem UNIQUE na FK
- Identificador inválido ou palavra reservada do PostgreSQL

## Simulação de dados

Clique em "Gerar dados". A geração é determinística: a mesma semente sempre produz o mesmo conjunto, o que serve bem para prova e para material de aula.

O que a simulação respeita:

- **Ordem topológica das FKs**: as tabelas pai são geradas antes das filhas
- **Integridade referencial**: valores de FK são sorteados entre as PKs que realmente existem no pai
- **1:1**: consome as PKs do pai sem repetição
- **PK composta**: garante unicidade da tupla, não de cada coluna isolada
- **`NOT NULL`, `UNIQUE`, tamanho de `varchar`**
- **`numeric(p, s)`**: valor cabe na precisão declarada
- **`CHECK` numérico**: entende `BETWEEN`, `>`, `>=`, `<`, `<=` e mantém o valor dentro da faixa

Os geradores são pt-BR: nomes, cidades do Paraná, CPF e CNPJ com dígitos verificadores válidos, CEP, telefone com DDD. O gerador é escolhido pelo nome da coluna e pelo tipo, e pode ser trocado à mão no editor de coluna. O e-mail é derivado do nome da própria linha, para a tabela não ficar incoerente.

**Explorar integridade**: clique numa linha da grade. O painel da direita mostra de qual linha do pai ela veio e quantas linhas dependem dela em cada tabela filha, com o `ON DELETE` de cada uma. É a forma mais direta de mostrar em aula o que uma FK significa na prática.

**Preencher à mão**: com a linha selecionada, clique de novo na célula (ou dê um duplo clique direto) para editar o valor. A escrita passa pelas mesmas regras do banco:

- O texto digitado é convertido para o tipo declarado, e um valor fora do tipo é recusado com a explicação
- `NOT NULL`, `UNIQUE`, tamanho de `varchar` e chave primária duplicada barram a gravação
- Coluna FK abre uma lista com as linhas que existem no pai, então não dá para apontar para o vazio
- Mudar uma chave referenciada arrasta os filhos junto quando o `ON UPDATE` é `CASCADE`, e é bloqueada quando é `RESTRICT`

O botão "Nova linha" insere um registro já preenchido pelos geradores, com a FK sorteada entre os pais existentes. Se a tabela pai estiver vazia, a inserção é recusada com o motivo, que é o mesmo que o banco faria.

**Exportar**: script de `INSERT` na ordem correta, com `OVERRIDING SYSTEM VALUE` para colunas identity e `setval` nas sequences no final. Também exporta CSV por tabela.

## Demonstração

A aba de demonstração serve para a hora de mostrar o que uma chave estrangeira faz com os dados. Ao entrar, se ainda não existir nada gerado, o app monta um conjunto pequeno: **cinco linhas por tabela**, sem nulos e com todas as FKs apontando para linhas que existem de verdade.

**Canvas de dados**: cada tabela vira um card com as próprias linhas dentro. Clique numa linha e as linhas ligadas a ela acendem nos outros cards, sobem para o topo e a aresta do relacionamento fica destacada. As arestas mostram o `ON DELETE` de cada FK.

**Apagar com cascade**: o ícone de lixeira na linha, ou o botão do painel da direita, abre a confirmação com o efeito calculado antes de qualquer coisa sumir:

- O `DELETE` equivalente em SQL
- A árvore do efeito, tabela por tabela: quantas linhas somem por `CASCADE`, quantas FKs viram `NULL` por `SET NULL`, quantas voltam ao `SET DEFAULT`
- O que o `RESTRICT` ou o `NO ACTION` impede, com o atalho para trocar aquele relacionamento para `CASCADE` e ver a diferença na hora

Enquanto a confirmação está aberta, as linhas condenadas já aparecem riscadas em vermelho nos cards, e as que teriam a FK zerada ficam em âmbar.

**Registro**: toda inclusão, edição e exclusão entra no painel "O que aconteceu", com o texto do que ocorreu e o SQL equivalente. É o material para colar no quadro depois da aula.

A aba tem também a visão de tabela, que é a mesma grade editável da simulação, para quem prefere olhar os dados em grade.

Os dados são compartilhados entre a simulação e a demonstração: o que você gera de um lado aparece do outro. O botão "Restaurar exemplo" recria o conjunto pequeno a qualquer momento.

## Onde o trabalho fica salvo

Tudo no `localStorage` do navegador, por máquina e por perfil. Três coisas são guardadas:

- **O modelo aberto**, salvo sozinho a cada mudança. Fechar a aba e voltar depois devolve a tela como estava.
- **A biblioteca**, em "Meus modelos" na barra superior: salve quantos quiser, abra, renomeie e remova. Serve para manter o modelo de cada aula separado.
- **Os dados preenchidos**, das abas de simulação e demonstração, incluindo o que você editou célula a célula. Volumes grandes não cabem no navegador; nesse caso o app avisa na lateral e o modelo continua salvo, só os dados é que não.

Em aba anônima ou com o armazenamento cheio, a gravação falha em silêncio no navegador. O app detecta e avisa em vez de fingir que salvou.

**Exportar é o que leva o trabalho para fora**: JSON do modelo e DDL na barra superior, script de `INSERT` e CSV na aba de simulação. Nenhum dado sai da sua máquina em nenhum outro momento.

## Tela de início

Aparece na primeira visita, e volta pelo botão "Tela de início" dentro de "Meus modelos". De lá dá para:

- Começar um **modelo em branco**
- Abrir um **modelo pronto** (Vendas ou Acadêmico)
- **Importar DDL** ou abrir um **JSON** exportado antes
- Retomar um modelo salvo neste navegador, ou continuar de onde parou

## Conta e nuvem

**Em breve.** Entrar com e-mail para abrir seus modelos de qualquer máquina está a caminho; o botão "Entrar" na barra superior explica a situação. Por enquanto o aluno acessa, faz o que precisa, e leva embora exportando. Quando a conta existir, nada do que está salvo hoje se perde.

Para quem hospeda a própria cópia, a base já está no repositório e liga sem escrever código:

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode `supabase/schema.sql`. Ele cria a tabela `pgcanvas_diagrams`, o índice, o gatilho de `updated_at` e as quatro políticas de RLS.
3. Em **Settings → API**, copie o `Project URL` e a chave `anon public`.
4. `cp .env.example .env.local`, preencha, e acrescente `NEXT_PUBLIC_ENABLE_CLOUD=true`.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
NEXT_PUBLIC_ENABLE_CLOUD=true
```

Sem `NEXT_PUBLIC_ENABLE_CLOUD=true`, a tela continua dizendo "em breve" mesmo com o Supabase configurado.

### Sobre as chaves

As variáveis são `NEXT_PUBLIC_`, ou seja, vão para o bundle do navegador. Isso é o desenho da Supabase: a chave anônima identifica o projeto, e **quem protege os dados é o RLS**. As políticas do `schema.sql` restringem tudo a `auth.uid() = user_id`, então uma conta nunca enxerga o modelo de outra, e visitante anônimo não enxerga nada.

O que nunca pode entrar no front é a chave `service_role` (ou `sb_secret_...`): ela ignora o RLS. O app checa isso ao subir e, se encontrar uma chave secreta no lugar da anônima, se recusa a conectar e explica o problema em vez de expor o banco. Se isso acontecer com uma chave real, gire a chave no painel da Supabase.

`.env.local` está no `.gitignore`. Só o `.env.example`, sem valores, é versionado.

## Deploy

O app é estático do ponto de vista do servidor: sem banco, sem sessão, sem rota de API. Os dois caminhos abaixo usam o mesmo build, e **nenhuma variável de ambiente é necessária** enquanto a nuvem estiver desligada.

**Vercel**

1. Importe o repositório. O Next.js é detectado sozinho, sem configuração.
2. Deploy.

**Railway**

1. Novo projeto a partir do repositório. O Nixpacks reconhece o Next.js e usa `npm run build` e `npm start`.
2. `next start` já escuta na porta que o Railway injeta em `PORT`, não precisa mexer.

Se e quando ligar a nuvem: cadastre as variáveis no painel **antes de buildar**, porque as `NEXT_PUBLIC_` são embutidas no bundle durante o build, e depois de mudar qualquer uma refaça o deploy. Cadastre também a URL pública em **Authentication → URL Configuration** na Supabase.

## Modelos prontos

- **Vendas**: cliente, endereço, pedido, produto e item_pedido, com PK composta de duas colunas
- **Acadêmico**: aluno, professor, disciplina e matrícula, com PK de três colunas

Os dois estão em `exemplos/`, já gerados e testados contra PostgreSQL 16.

```bash
createdb minha_base
psql -d minha_base -f exemplos/vendas.sql
```

## Estrutura

```
src/
  app/                     layout, página e tokens de design
  components/
    canvas/                nó de tabela, aresta com pé de galinha, canvas
    demo/                  canvas de dados, card com linhas, diálogo de cascade
    inspector/             editores de tabela, coluna e relacionamento
    shell/                 barra superior, tela de início, biblioteca, painéis e importação
    simulation/            controles, grade editável e inspetor de integridade
    ui/                    botões, campos, toggle, modal, etiquetas
  lib/
    types.ts               modelo de domínio
    pg-types.ts            catálogo de tipos PostgreSQL
    store.ts               estado, histórico de undo e persistência
    sql.ts                 geração de DDL e ordem topológica
    parse-sql.ts           leitura de DDL PostgreSQL para dentro do modelo
    simulate.ts            geradores e simulação com integridade referencial
    dataops.ts             edição de linha, validação e plano de cascade
    validate.ts            regras de validação do modelo
    library.ts             biblioteca local, persistência do modelo e dos dados
    supabase.ts            cliente do navegador e checagem das chaves
    cloud.ts               sessão e biblioteca na conta, atrás de NEXT_PUBLIC_ENABLE_CLOUD
    samples.ts             modelos de exemplo
supabase/
  schema.sql               tabela, índice, gatilho e políticas de RLS
```

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, React Flow 12, Zustand, lucide-react.

## Onde mexer primeiro

- **Novo tipo de dado**: adicione uma entrada em `PG_TYPES` em `src/lib/pg-types.ts`. O editor de coluna e o DDL passam a reconhecer sozinhos.
- **Novo gerador de dados**: adicione em `GENERATORS` e trate a chave em `runGenerator`, ambos em `src/lib/simulate.ts`. Para ele ser escolhido automaticamente, inclua um padrão em `HEURISTICS`.
- **Nova regra de validação**: `validateDiagram` em `src/lib/validate.ts`.
- **Comportamento novo de FK ao apagar ou alterar**: `planDelete` e `planCellUpdate` em `src/lib/dataops.ts`. Os dois devolvem um plano, e a tela só aplica depois de mostrar o efeito.
- **Novo modelo de exemplo**: `TEMPLATES` em `src/lib/samples.ts`.
- **Apelido de tipo aceito na importação**: `TYPE_ALIASES` em `src/lib/parse-sql.ts`.
- **O que é guardado no navegador**: as chaves e os limites ficam no topo de `src/lib/library.ts`.
- **Novo campo salvo na nuvem**: coluna em `supabase/schema.sql` e no `select` de `src/lib/cloud.ts`.

## Limitações conhecidas

- A importação de DDL lê estrutura, não dados: `INSERT`, funções, triggers, views, partições e tipos criados por você são ignorados, com aviso.
- FK composta é quebrada em um relacionamento por coluna, porque o modelo liga uma coluna de cada vez.
- Sem exportação de imagem do diagrama.
- O que está salvo vive em um navegador só: outro computador, outro perfil ou limpar os dados do site começa do zero. Enquanto a conta não existe, exportar é o backup.
- `CHECK` com texto, data ou expressão composta não é interpretado pela simulação, apenas os numéricos simples.
- Ciclo de chaves estrangeiras é detectado e avisado, mas a ordem de inserção não é resolvida.
- Os dados gerados e editados vivem só na memória da aba. O modelo é salvo no navegador, os dados não. Exporte os `INSERT` ou o CSV antes de fechar.
- Apagar e editar linhas não entra no `Ctrl+Z`, que continua sendo só do modelo. Para voltar ao começo, gere os dados de novo.
