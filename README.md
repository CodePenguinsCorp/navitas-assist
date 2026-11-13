# Navitas Assist

Sistema web para diagnóstico técnico e acompanhamento de RMAs.

## Integrantes

- André Schultz - Frontend
- José Henrique Brühmüller - PO
- Lucas Monich Nunes - Backend
- Matheus Büsemayer - QA

## Problema Atendido

O processo de assistência técnica enfrenta dificuldades como:
- Falta de rastreabilidade dos produtos
- Controle manual de informações
- Dificuldade em localizar histórico de atendimentos
- Falta de padronização no processo de RMA
- Retrabalho e perda de informações

## Objetivo do Sistema

Desenvolver um sistema digital que permita o controle e rastreamento de produtos da Navitas que retornam para assistência técnica ou reparo, consolidando o processo de RMA no sistema Navitas Assist e facilitando o registro, acompanhamento e geração de relatórios relacionados aos atendimentos.

## Público Beneficiado

O projeto beneficia diretamente dois principais públicos. O primeiro e mais diretamente beneficiado é a empresa Navitas Tecnologia, uma vez que o produto pretende otimizar os processos de RMA da empresa proporcionando maior competitividade e eficiência interna, um diferencial necessário nos setores de tecnologia.
O segundo público beneficiado será composto pelos clientes e parceiros da Navitas Tecnologia, que poderão usufruir de uma experiência mais eficiente, organizada e transparente no atendimento de reparos e assistência dos produtos Navitas, resultando em benefícios diretos, como maior agilidade e confiabilidade no serviço, e indiretos, como aumento da satisfação, fortalecimento do relacionamento e maior credibilidade da marca.

## Visão Geral

O projeto foi dividido em duas aplicações:

- `frontend/`: SPA em Angular
- `backend/`: API REST em Spring Boot

## Stack

- Frontend: Angular 21
- Backend: Spring Boot 3.2
- Java: 17+
- Banco: MySQL 8

## Datas e fuso horário

- Regras de negócio que dependem de "hoje" e o ano do código do RMA usam `America/Sao_Paulo`, independentemente do fuso do navegador ou servidor.
- Datas sem horário (`YYYY-MM-DD` / `LocalDate`) preservam o dia informado, sem conversão de fuso.
- No frontend, reutilize os utilitários de `core/utils/date.ts` para calcular o dia atual e exibir datas civis.
- Instantes de auditoria, atualizações de cadastros e entradas nas etapas são exibidos em `America/Sao_Paulo`, com data/hora curta `pt-BR`, independentemente do fuso do dispositivo. Use `formatBusinessDateTime` do mesmo utilitário; os valores da API não são alterados.

## Garantia dos produtos no RMA

Cada produto é avaliado individualmente. O vencimento corresponde à data de compra informada no RMA mais o prazo de garantia do produto, em meses. A cobertura considera a data de entrada do atendimento e inclui o dia do vencimento.

O enum `WarrantyStatus`, usado no backend e no frontend, representa três situações:

| Valor | Situação | Regra |
| --- | --- | --- |
| `PENDING` | Pendente | Data de compra desconhecida. |
| `IN_WARRANTY` | Em garantia | Entrada até o vencimento, inclusive. |
| `OUT_OF_WARRANTY` | Fora de garantia | Entrada após o vencimento. |

O prazo é registrado em cada novo item para preservar a garantia quando o cadastro do produto mudar. Em `items[]`, `warrantyStatus` é a situação efetiva (ajuste manual, quando existe; caso contrário, cálculo automático). `calculatedWarrantyStatus` mantém a situação calculada e `warrantyOverride` contém `{ status, reason, changedBy, changedAt }`, ou `null`. O cálculo do vencimento permanece automático.

Quem tem `rma.editar` pode ajustar um item com `PUT /api/rmas/{rmaId}/items/{itemId}/warranty`:

```json
{ "override": "IN_WARRANTY", "reason": "Cortesia" }
```

`override` aceita `IN_WARRANTY`, `OUT_OF_WARRANTY` ou `null` (voltar ao automático). Ao definir o ajuste, o motivo é obrigatório, com até 255 caracteres após remover espaços das extremidades; na remoção ele é opcional, com o mesmo limite. RMAs encerrados (`COMPLETED`, `RETURNED`, `IRREPARABLE`) retornam 400, e item que não pertence ao RMA retorna 404. Valores e motivos inválidos retornam 400 com mensagem em português.

Cada ajuste ou remoção é registrado na mesma transação e exposto em `RmaResponse.warrantyHistory[]`, do mais recente para o mais antigo, com `itemId`, `previousOverride`, `newOverride`, `reason`, `changedBy` e `changedAt`. A edição geral preserva o ajuste e o prazo original dos itens reconhecidos por produto, lote e série; não permite remover ou substituir um item com histórico de ajuste, para preservar a auditoria.

O Kanban (inclusive filtros de visões salvas), listagens e relatórios consomem a situação efetiva em `items[].warrantyStatus`. Esses filtros e os indicadores de garantia são aplicados pelos consumidores da API; não há fórmula paralela em SQL/JPQL. O backend carrega o histórico de garantia em lote nas listagens e relatórios. A migração aditiva `V3__rma_item_warranty_override.sql` adiciona as colunas anuláveis e a tabela de auditoria, preservando V1/V2 e os itens existentes.

## Responsáveis pelos RMAs

O número da nota fiscal permanece disponível na abertura e nos detalhes do RMA. Não há campo de arquivo da NF nem de “Recebido por” na interface. O backend registra automaticamente o nome de usuário autenticado como recebedor na criação e preserva esse registro nas edições; `receivedBy` é somente leitura na API.

Cada RMA pode ter um técnico responsável ou permanecer sem responsável. Quem tem a permissão `rma.responsavel` pode atribuir, trocar ou remover o responsável diretamente no Kanban; somente usuários ativos com a permissão efetiva `rma.atribuivel` (do perfil ou extra) aparecem como novas opções. A inativação posterior, ou a perda da permissão, não apaga a atribuição existente.

Toda alteração registra o responsável anterior, o novo responsável, o autor e o horário. O Kanban permite filtrar por técnico ativo ou por RMAs sem responsável, e os detalhes do RMA exibem o histórico completo de atribuições.

## Visualizações salvas do Kanban

Cada usuário autenticado pode salvar combinações dos filtros avançados do Kanban, reaplicá-las, renomeá-las, excluí-las e escolher uma visualização padrão. A preferência fica associada à conta e é restaurada ao abrir o quadro em uma nova sessão.

As rotas em `/api/kanban-views` usam sempre o usuário da sessão; o cliente não informa nem escolhe o proprietário. Nomes são únicos por usuário, e falhas de persistência não alteram os filtros que já estão aplicados na tela.

## Relatórios, laudo em PDF e exportação CSV

A tela Relatórios exige `relatorios.ver` (Administrador, Técnico e Consulta). Sem sessão a API responde `401`; sem a permissão, `403`. Todas as rotas usam os mesmos filtros opcionais: `entryFrom` e `entryTo` (`YYYY-MM-DD`, inclusivos, sobre a **data de entrada**; sem período, os **últimos 90 dias** até hoje em America/Sao_Paulo; com uma só data, a outra é completada; máximo **366 dias**), `status` e `clientId`. Parâmetros inválidos, intervalo invertido ou período maior retornam `400`. Cada resposta traz o período aplicado e um `generatedAt` único.

- `GET /api/reports/rmas/summary`: total de RMAs e itens; RMAs por status atual; itens por garantia **efetiva** (`items[].warrantyStatus`, com ajuste manual); RMAs por mês de entrada; top 10 de falhas por produto, por lote e por cliente (quantidade de itens) e por tipo de falha do diagnóstico; recorrência; e tempo médio e maior tempo na etapa atual dos RMAs em andamento, medidos em `generatedAt` (encerrados ficam fora).
- **Recorrência:** um item **retornou** quando o mesmo produto e número de série têm 2 ou mais RMAs com entrada até o fim do período, inclusive RMAs anteriores ao período e de outros clientes. A taxa é itens que retornaram ÷ itens com série no período, no total, por modelo e por lote (top 10), mais a lista dos seriais. Série vazia fica fora da base; RMAs legados sem `rma_items` não entram na busca de RMAs anteriores.
- `GET /api/reports/rmas?page&size`: lista paginada no servidor (página padrão 20, máximo 100), em ordem de entrada e ID decrescentes, com `{ generatedAt, entryFrom, entryTo, rmas: { content, page, size, totalElements, totalPages } }`. Cada linha traz código, entrada, status, cliente, produto, SKU, série e lote do item principal, quantidade de itens, situações de garantia efetiva distintas e tipo de falha.
- `GET /api/reports/rmas/export.csv`: uma linha por item de RMA (código, entrada, status, cliente, produto, SKU, lote, série, garantia, ajuste manual, falha relatada, falha encontrada, tipo, causa, responsável, expedição). Limite de **5.000 RMAs**; acima disso responde `400` pedindo para reduzir o período ou os filtros.
- `GET /api/reports/rmas/summary/export.csv`: o resumo em tabela longa `Seção;Item;Quantidade;Base;Percentual;Tempo médio (h);Maior tempo (h)`.

Os CSV saem em UTF-8 **com BOM**, separador `;` e fim de linha CRLF, para abrir direto no Excel. Campos com `;`, aspas ou quebra de linha vão entre aspas. Texto que começa com `=`, `+`, `-`, `@`, tab ou CR recebe um apóstrofo na frente, para a planilha não executar fórmulas. Datas em `dd/MM/aaaa` e decimais com vírgula.

**Laudo final:** `GET /api/rmas/{id}/report.pdf` (`rma.ver`) gera o PDF do RMA com código, cliente, entrada, status, produtos (lote, série e garantia efetiva), falha relatada, diagnóstico (falha encontrada, tipo, causa, técnico, data e notas), ações executadas (reparo e testes), peças trocadas (resumo em texto e reservas consumidas, sem custo) e observações (estado físico e acessórios). Usa OpenPDF com a fonte Helvetica padrão (Cp1252, cobre os acentos), sem baixar nada em tempo de execução. O nome do arquivo é `laudo-<código>.pdf` com o código reduzido a letras, números, `_` e `-`. Na interface, o link "Laudo (PDF)" fica no cabeçalho do detalhe do RMA, no modal e na tela RMAs, e na lista do relatório.

Não há custo por RMA nos relatórios nem no laudo.

## Impedimentos dos RMAs (NAV-33)

Use **Ver impedimentos** no card para consultar o bloqueio atual e todos os episódios anteriores, sem sair do quadro. Quem tem a permissão `rma.impedimentos` pode bloquear com motivo obrigatório (até 1000 caracteres) e categoria opcional (até 80), ou desbloquear com nota de resolução obrigatória (até 1000). Quem tem só `rma.ver` pode consultar. A API aplica as mesmas permissões e exige CSRF nas alterações.

Bloquear não muda a coluna nem impede movimentação. O tempo da etapa continua correndo; uma eventual pausa depende de decisão de produto. Cards mostram texto, motivo resumido e tempo bloqueado. O filtro de impedimentos combina com os demais filtros e é preservado nas visualizações salvas. Fechar o painel mantém os filtros e a seleção. Os detalhes do RMA também apresentam o histórico completo.

Cada episódio registra autor e instante de início e de resolução, mantendo as notas anteriores. Instantes são apresentados em `America/Sao_Paulo`. A API retorna `currentBlock` e `blockHistory`; POST `/api/rmas/{id}/blocks` inicia um episódio e PATCH `/api/rmas/{id}/blocks/{blockId}` resolve somente aquele episódio. Bloqueios concorrentes são serializados pelo lock do RMA; uma resolução desatualizada não encerra um episódio posterior.

A tabela de episódios e o filtro salvo foram incluídos na V1, conforme o banco recriável do projeto. Um banco de desenvolvimento criado com a V1 anterior precisa ser recriado antes de aplicar a nova versão; este fluxo não remove bancos ou volumes. O painel geral da NAV-21 ainda não está na main; seu desenvolvimento pode reutilizar `RmaBlockHistoryComponent` e `RmaBlockPanelComponent`.

## Alterações de um RMA pelo Kanban

O Kanban não tem edição em massa: cada RMA é alterado individualmente. O status muda ao arrastar o card para outra coluna ou pelo seletor do detalhe (`rma.status`); o responsável, pelo seletor do detalhe (`rma.responsavel`). A prioridade também é escolhida no detalhe, no Kanban e na tela de RMAs, por quem tem `rma.editar`, enquanto o RMA não está encerrado; a troca é salva na hora com `PUT /api/rmas/{id}` enviando só `{ "priority": ... }`, e a API registra no histórico de status a nota `Priority changed from X to Y`. O card atualiza assim que a API responde, e cada alteração registra o histórico do RMA. A rota `PATCH /api/rmas/{id}/bulk-status`, usada pela antiga seleção em lote (NAV-15), foi removida.

## Paginação das consultas (NAV-28)

`GET /api/rmas`, `/api/clients`, `/api/products` e `/api/users` retornam uma página:

```json
{ "content": [], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }
```

| Parâmetro | Regra |
|:---|:---|
| `page` | Índice a partir de 0 (padrão `0`). Valores negativos ou não numéricos retornam `400`. Uma página além do fim retorna `content` vazio com os totais corretos. |
| `size` | Padrão `20`, mínimo `1`, máximo `100`. Fora do intervalo retorna `400`. |

A ordem é fixa e estável (desempate por `id`): RMAs na ordem da fila (prioridade alta, média e demais; depois a entrada mais antiga); clientes, produtos e usuários por nome. Os filtros são aplicados no backend antes de paginar e `totalElements` considera apenas os registros filtrados:

| Recurso | Filtros |
|:---|:---|
| `/api/rmas` | `query`, `status` |
| `/api/clients` | `query`, `hasDocument`, `hasEmail` |
| `/api/products` | `query`, `category`, `hasFirmware` |
| `/api/users` (`usuarios.gerir`) | `query`, `profileId`, `active` |

Para dados que não podem ficar incompletos há rotas sem paginação: `GET /api/rmas/board` (Kanban e dashboard, aceita `query` e `status`), `GET /api/clients/options` e `GET /api/products/options` (seletores do formulário de RMA, ordenados por nome). Os totais dos cartões das telas vêm de `GET /api/clients/summary`, `/api/products/summary` (inclui `categories` para o filtro) e `/api/users/summary`, calculados sobre todos os registros. As autorizações são as mesmas dos demais `GET` do recurso.

No frontend, as telas de RMAs, clientes, produtos e usuários mostram o total filtrado e navegam por página (10, 20, 50 ou 100 por página). Alterar busca, filtro ou tamanho volta para a primeira página; a busca por texto aguarda 300 ms. Após excluir o último item de uma página, a tela volta para a última página existente.
## Numeração dos RMAs

A criação usa o formato `RMA-AAAA-NNNNNN`, com ano em `America/Sao_Paulo` e sequência iniciada em `000001` a cada ano. O banco serializa a alocação e a inserção para que criações concorrentes recebam códigos distintos. Uma criação revertida não consome número. Ao atingir `999999`, novas criações desse ano recebem erro de negócio `400`.

A linha de bloqueio é criada pela migração-base (`V1__baseline.sql`) em banco vazio. Alterações incompatíveis da V1 seguem a política de recriação local descrita em **Schema do banco**. O bloqueio é compartilhado pelos processos que usam o mesmo banco e serializa as criações; escritas diretas fora da API não seguem esse controle.

## Estrutura do Projeto

- `frontend/`: interface web
- `backend/`: API e regras de negócio
- `run-local.ps1`: sobe a stack local via Docker
- `stop-local.ps1`: para a stack local via Docker
- `compose.yaml`: sobe frontend, backend e MySQL via Docker
- `compose.prod.yaml`: stack de produção usando imagens publicadas

## Requisitos

### Para rodar com Docker

- Docker Desktop

### Para rodar backend/frontend manualmente

- Java 17 ou superior
- Maven 3.9+
- Node.js e npm
- PowerShell

## Portas Padrão

- frontend: `4200`
- backend: `8080`
- banco: `3306`

## Rodando com Docker

### 1. Crie o arquivo `.env`

Na raiz do projeto:

```powershell
Copy-Item .env.example .env
```

### 2. Suba a stack

```powershell
.\run-local.ps1 -Build
```

Esse comando sobe:

- frontend Angular servido por Nginx
- backend Spring Boot
- MySQL 8.0

Você também pode usar o Compose diretamente:

```powershell
docker compose up --build -d
```

Se a stack já estiver rodando, o `run-local.ps1` derruba e sobe novamente os serviços alvo automaticamente.
Quando houver mudança de código no backend ou frontend, prefira usar `-Build` para reconstruir as imagens locais antes de subir.

### 3. Acesse

- frontend: `http://localhost:4200`
- backend: `http://localhost:8080`
- healthcheck: `http://localhost:8080/health`

### 4. Comandos úteis

Parar toda a stack:

```powershell
.\stop-local.ps1
```

Subir apenas o banco:

```powershell
.\run-local.ps1 -DatabaseOnly
```

Subir apenas backend e banco:

```powershell
.\run-local.ps1 -BackendOnly
```

Ver logs:

```powershell
docker compose logs -f
```

## Backend Manual com Profile Local

Se quiser subir o backend manualmente:

```powershell
.\run-local.ps1 -DatabaseOnly
cd .\backend
$env:SPRING_PROFILES_ACTIVE="local"
mvn spring-boot:run
```

O profile `local` fica em:

- `backend/src/main/resources/application-local.yml`

Esse profile usa:

- host: `127.0.0.1`
- banco: `navitas_assist`
- usuário: `navitas_app`
- senha: `navitas123`

Esse fluxo usa o MySQL publicado pelo Docker na porta `3306`.

## Frontend Manual

Para subir apenas o frontend:

```powershell
cd .\frontend
npm install
npm start
```

### Testes automatizados do frontend

O frontend usa Vitest com DOM emulado por happy-dom. Para instalar as dependências e executar a suíte uma vez:

```powershell
cd .\frontend
npm ci
npm test -- --watch=false
```

Para desenvolvimento, `npm test` mantém o runner em modo interativo quando o terminal oferece TTY. O workflow `Frontend CI` executa a suíte e valida o build de produção em pushes e pull requests que alterem o frontend.

## Testes automatizados do backend

A partir da raiz do projeto, execute a suíte de testes e o build do JAR com Maven 3.9.9 e Java 17:

```powershell
cd .\backend
mvn -B -ntp verify
```

O workflow `Backend CI` executa o mesmo comando em um contêiner Maven 3.9.9/Java 17 para pushes e pull requests que alterem `backend/` ou o próprio workflow. Os testes usam o profile `test` com H2; o CI não precisa de banco externo nem de credenciais da aplicação. Alterações somente no frontend não acionam esse workflow.

## Variáveis de Ambiente

O setup local reconhece estas variáveis principais:

- `FRONTEND_PORT`
- `BACKEND_PORT`
- `MYSQL_PORT`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `DB_URL`
- `DB_USER`
- `DB_PASSWORD`
- `SERVER_PORT`
- `SESSION_TIMEOUT`
- `SESSION_COOKIE_SECURE`
- `DEADLINE_WARNING_DAYS` (janela "Perto do limite" da data limite, de 0 a 90 dias, padrão 7)

Sem sobrescrever nada:

- o setup padrão do Docker usa `navitas_app / navitas123`
- o frontend Docker consome a API por proxy interno em `/api`
- o profile `local` continua disponável para rodar o backend manualmente contra o MySQL do Docker

Os nomes dos contêineres locais são gerados pelo Docker Compose a partir do projeto. Para executar duas cópias ao mesmo tempo, configure portas diferentes em `FRONTEND_PORT`, `BACKEND_PORT` e `MYSQL_PORT` no `.env` de cada cópia.

## Autenticação e Sessão

A aplicação usa sessão criada no backend. O frontend envia usuário e senha somente para `POST /api/auth/login`; credenciais reutilizáveis não são persistidas no `localStorage` nem no `sessionStorage`.

- `JSESSIONID` é `HttpOnly` e `SameSite=Strict`; em ambientes não locais também é `Secure`
- requisições de escrita usam token CSRF no cookie `XSRF-TOKEN` e no header `X-XSRF-TOKEN`
- `GET /api/auth/csrf` retorna `204` sem corpo e cria o cookie CSRF somente quando ausente; consultas de outras abas preservam o token existente
- a sessão é restaurada após recarregar a página por `GET /api/auth/me`
- a expiração padrão por inatividade é de 30 minutos e pode ser alterada com `SESSION_TIMEOUT`
- `POST /api/auth/logout` invalida a sessão e remove os cookies de sessão e CSRF
- respostas de autenticação e autorização permanecem em JSON, com `401` e `403`
- a tela de login indica credenciais inválidas somente para `401` do endpoint de login; falhas de rede, serviço ou preparação do CSRF exibem uma mensagem genérica para nova tentativa, sem mostrar detalhes do servidor

Alterar usuário, senha ou situação ativa, ou excluir uma conta, revoga todas as suas sessões após o commit. Na próxima requisição, o backend invalida a sessão e responde `401`; é necessário entrar novamente. Alterar o perfil ou as permissões extras de um usuário, ou as permissões de um perfil, não encerra sessões: as permissões são recalculadas a cada requisição e a mudança vale já na próxima requisição de cada usuário afetado. Alterar apenas o nome completo não encerra sessões, e operações recusadas ou revertidas não revogam o acesso. O registro usa o ID da conta, portanto reutilizar um nome de usuário excluído não recupera sessões antigas.

O recálculo também lê a conta pelo ID gravado no login: se ela foi excluída ou desativada fora da API (por exemplo, direto no banco), a sessão é encerrada nessa mesma requisição, que segue como anônima (`401` nas rotas protegidas). No código, as checagens de acesso usam sempre `Authentication.getAuthorities()`, nunca o principal: só as authorities são recalculadas a cada requisição, e o principal guarda as permissões do momento do login.

O registro de sessões é mantido em memória por instância, assim como as sessões HTTP atuais. A revogação atende a execução em uma única instância; não sincroniza réplicas nem cancela requisições que já passaram pela autorização. Logout, expiração e troca do ID da sessão removem os registros correspondentes.

Senhas novas ou alteradas exigem ao menos 6 caracteres e no máximo 72 bytes em UTF-8, limite do BCrypt. Acentos e emojis podem ocupar mais de um byte. O backend rejeita excesso no cadastro e na edição; o login retorna `401` para credenciais acima desse limite. Senhas não são aparadas nem truncadas.

Hashes BCrypt existentes permanecem inalterados. Caso exista uma senha histórica acima de 72 bytes, ela precisa ser redefinida: o hash antigo não distingue o conteúdo que ultrapassou esse limite. Não há migração automática ou redefinição de contas.

## Contas de acesso

A aplicação não cria, recria ou altera usuários durante a inicialização. As contas e os hashes de senha ficam exclusivamente no banco. Em um banco novo, o primeiro administrador deve ser inserido explicitamente com um hash BCrypt, vinculado ao perfil pronto Administrador (`legacy_code = 'ADMIN'`); depois, o cadastro e a manutenção das contas são feitos pelas telas Usuários e Perfis. Recriar o banco não recria uma conta padrão.

```sql
INSERT INTO user_accounts (username, full_name, password_hash, active, created_at, updated_at, profile_id)
VALUES ('admin', 'Administrador', '<hash BCrypt>', TRUE, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6),
        (SELECT id FROM access_profiles WHERE legacy_code = 'ADMIN'));
```

Não há coluna de role em `user_accounts`: o acesso vem só do perfil (`profile_id`) e das permissões extras.

Fora dos profiles `local` e `test`, somente `DB_URL`, `DB_USER` e `DB_PASSWORD` são obrigatórios. O ambiente de produção usa validação de schema e não imprime SQL nem credenciais nos logs.

Fora dos profiles `local` e `test`, o backend recusa senhas de banco publicadas nos exemplos em `DB_PASSWORD`. A aplicação informa somente o nome da variável que precisa ser corrigida, sem modificar seu valor. Essa verificação não altera contas nem senhas dos usuários da aplicação.

## Autorização da API

A API autoriza por **permissão**, não por perfil. As permissões efetivas de um usuário são as do seu perfil mais as permissões extras dele; são recalculadas a cada requisição (ver **Autenticação e Sessão**).

| Recurso/operação | Permissão |
|:---|:---|
| Consultar clientes, produtos, peças e protocolos (`GET`) | qualquer usuário autenticado |
| Consultar RMAs, Kanban e dashboard (`GET /api/rmas/**`) | `rma.ver` |
| Criar, alterar ou excluir clientes e produtos | `cadastros.editar` |
| Abrir RMA | `rma.abrir` |
| Alterar dados gerais de RMA e ajustar garantia dos itens | `rma.editar` |
| Alterar o status de RMA | `rma.status` |
| Atribuir ou remover responsável do RMA | `rma.responsavel` |
| Registrar ou alterar diagnóstico | `rma.diagnosticar` |
| Registrar e resolver impedimentos | `rma.impedimentos` |
| Cadastrar peças e movimentar estoque | `pecas.movimentar` |
| Reservar, alocar, consumir e cancelar peças nos RMAs | `pecas.reservar` |
| Executar protocolos nos RMAs | `protocolos.executar` |
| Gerenciar modelos de protocolo | `protocolos.catalogo` |
| Relatórios e exportação CSV (`GET /api/reports/rmas/**`) | `relatorios.ver` |
| Laudo final em PDF (`GET /api/rmas/{id}/report.pdf`) | `rma.ver` |
| Gerenciar usuários (`/api/users/**`) | `usuarios.gerir` |
| Gerenciar perfis (`/api/profiles/**`) | `perfis.gerir` |
| Regras de notificação (`/api/notification-rules/**`) | `notificacoes.regras` |
| Opções de perfil (`GET /api/profiles/options`) | qualquer uma de `perfis.gerir`, `usuarios.gerir`, `notificacoes.regras` |
| Catálogo de permissões (`GET /api/permissions`) | qualquer uma de `perfis.gerir`, `usuarios.gerir` |
| Visualizações do Kanban, notificações pessoais, técnicos atribuíveis, `/api/auth/me` e logout | qualquer usuário autenticado |

Requisições sem autenticação recebem `401`; usuários autenticados sem permissão recebem `403`. Operações de API não classificadas explicitamente exigem `usuarios.gerir` **e** `perfis.gerir`.

### Perfis e permissões

Um perfil é um nome mais um conjunto de permissões de um catálogo fixo; cada usuário tem um perfil e, opcionalmente, permissões extras. Perfis são gerenciados na tela **Perfis** (`perfis.gerir`), e o perfil e as extras de cada usuário na tela **Usuários**. Ninguém concede permissão que não tem, e o sistema não permite ficar sem um usuário ativo com `usuarios.gerir` e `perfis.gerir`.

A migração-base `V1__baseline.sql` cria os 4 perfis prontos abaixo (A = Administrador/`ADMIN`, S = Atendimento/`SERVICE_DESK`, T = Técnico/`TECHNICIAN`, V = Consulta/`VIEWER`; o código fica em `access_profiles.legacy_code`), com o mesmo acesso dos antigos roles fixos. Esses perfis prontos não podem ser excluídos.

| Código | Módulo | Rótulo | A | S | T | V |
|:---|:---|:---|:-:|:-:|:-:|:-:|
| `rma.ver` | RMAs | Ver RMAs, Kanban e dashboard | ✓ | ✓ | ✓ | ✓ |
| `rma.abrir` | RMAs | Abrir RMAs | ✓ | ✓ | | |
| `rma.editar` | RMAs | Alterar dados gerais e prioridade | ✓ | ✓ | | |
| `rma.status` | RMAs | Alterar status | ✓ | ✓ | ✓ | |
| `rma.responsavel` | RMAs | Atribuir responsável | ✓ | ✓ | | |
| `rma.atribuivel` | RMAs | Pode ser responsável por RMAs | | | ✓ | |
| `rma.diagnosticar` | RMAs | Registrar diagnóstico | ✓ | | ✓ | |
| `rma.impedimentos` | RMAs | Registrar e resolver impedimentos | ✓ | ✓ | ✓ | |
| `cadastros.ver` | Clientes e produtos | Consultar clientes e produtos | ✓ | ✓ | ✓ | ✓ |
| `cadastros.editar` | Clientes e produtos | Criar, alterar e excluir clientes e produtos | ✓ | ✓ | | |
| `pecas.ver` | Peças | Consultar peças e estoque | ✓ | ✓ | ✓ | ✓ |
| `pecas.movimentar` | Peças | Cadastrar peças e movimentar estoque | ✓ | ✓ | | |
| `pecas.reservar` | Peças | Reservar e aplicar peças nos RMAs | ✓ | | ✓ | |
| `protocolos.ver` | Protocolos técnicos | Consultar protocolos e execuções | ✓ | ✓ | ✓ | ✓ |
| `protocolos.executar` | Protocolos técnicos | Executar protocolos nos RMAs | ✓ | | ✓ | |
| `protocolos.catalogo` | Protocolos técnicos | Gerenciar modelos de protocolo | ✓ | | | |
| `relatorios.ver` | Relatórios | Ver relatórios | ✓ | | ✓ | ✓ |
| `usuarios.gerir` | Administração | Gerenciar usuários | ✓ | | | |
| `perfis.gerir` | Administração | Gerenciar perfis e permissões | ✓ | | | |
| `notificacoes.regras` | Administração | Configurar regras de notificação | ✓ | | | |

Totais: Administrador 19 (todas menos `rma.atribuivel`), Atendimento 11, Técnico 11, Consulta 5. `cadastros.ver`, `pecas.ver` e `protocolos.ver` controlam telas e menus; as leituras `GET` correspondentes na API continuam abertas a qualquer usuário autenticado.

**Tabelas.** `access_profiles` (nome e `legacy_code` dos perfis prontos), `access_profile_permissions` (permissões de cada perfil), `user_account_extra_permissions` (extras por usuário, além de `user_accounts.profile_id`) e `notification_rule_recipient_profiles` (perfis destinatários das regras de notificação). Os seeds das regras enviam `RMA_CREATED` para Administrador e Atendimento e `RMA_ASSIGNED` apenas ao responsável. As regras `SLA_*` semeadas na V1 são apagadas pela V2 (ver "Tempo por etapa e data limite").

## Produção

- `compose.prod.yaml`: stack de produção usando imagens publicadas
- `scripts/init-prod-env.ps1` e `scripts/init-prod-env.sh`: geram `.env.prod` com segredos fortes
- `scripts/deploy-prod.ps1` e `scripts/deploy-prod.sh`: fazem pull e sobem a stack de produção
- `.env.prod.example`: exemplo de variáveis para produção

Exemplo para gerar um `.env.prod`:

```powershell
.\scripts\init-prod-env.ps1
```

Exemplo para deploy manual:

```powershell
.\scripts\deploy-prod.ps1
```

## Schema do banco

O Flyway cria o schema em um banco vazio e aplica as migrations seguintes; o Hibernate apenas valida o resultado (`ddl-auto=validate`).

As migrations foram zeradas em 13 nov 2026, porque não havia dados em produção (só dados de teste): as antigas V1 a V10 deram lugar a uma única migração-base, `backend/src/main/resources/db/migration/V1__baseline.sql`, que cria todas as tabelas, índices e constraints e os seeds (trava de numeração dos RMAs, os 4 perfis prontos com suas permissões e as regras de notificação com destinatários por perfil). As colunas legadas `user_accounts.role` e `notification_rules.recipient_roles` deixaram de existir. As próximas migrations partem da V2. O PostgreSQL/Supabase do ambiente de testes terá baseline própria, no projeto desse ambiente.

Um banco criado pelas migrations antigas não é compatível com a baseline (o Flyway recusa o histórico divergente). Para recriar o banco local, apague o volume do MySQL no projeto do repositório e suba a stack de novo; depois, insira o primeiro administrador (ver **Contas de acesso**). O primeiro comando remove todos os dados locais:

```powershell
docker compose down -v
docker compose up --build -d
```

## Troubleshooting

Se o MySQL Docker não subir, provavelmente já existe outro banco ocupando a porta `3306`.
Nesse caso:

- encerre o XAMPP/MySQL local
- ou altere `MYSQL_PORT` no `.env`

Para inspecionar a stack:

```powershell
docker compose ps
```

## Projeto Mínimo Viável (MVP)

Disponibilizar um fluxo funcional de gerenciamento de assistência técnica, permitindo registrar uma assistência, acompanhar sua evolução e consultar as principais informações do atendimento.

### Funcionalidades incluídas no MVP:

- Cadastro e consulta de clientes
- Cadastro e consulta de produtos
- Abertura de assistência técnica
- Identificação da assistência
- Registro do diagnóstico
- Atualização do status
- Registro de reparo e testes
- Consulta do histórico básico da assistência

## Backlog

| ID | Item | Tipo | Prioridade | Responsável |
|:---|:---|:---|:---|:---|
| **1** | Revisar e finalizar estrutura inicial do projeto | Técnico | Alta | André e Matheus |
| **2** | Modelar e configurar o banco de dados | Técnico | Alta | José e Lucas |
| **3** | Implementar autenticação e autorização | Requisito técnico | Alta | José e Lucas |
| **4** | Implementar cadastro de clientes | Requisito funcional | Alta | André e Lucas |
| **5** | Implementar cadastro de produtos | Requisito funcional | Alta | André e Lucas |
| **6** | Implementar abertura da assistência | Requisito funcional | Alta | José e Lucas |
| **7** | Implementar fluxo e status da assistência | Requisito funcional | Alta | José e Matheus |
| **8** | Implementar registro de diagnóstico, reparo e testes | Requisito funcional | Alta | André e Matheus |
| **9** | Integrar frontend e backend do fluxo principal | Técnico | Alta | André, José e Lucas |
| **10** | Validar primeiro incremento com a Navitas | Validação | Média | José e Matheus |

## Cronograma de Desenvolvimento

| Período | Marco esperado | Evidência de entrega | Resp. |
| :--- | :--- | :--- | :--- |
| **10/08 a 24/08** | Ponto de partida mínimo concluído | README, arquitetura, stack, backlog, estrutura inicial e repositório | André e Matheus |
| **24/08 a 21/09** | Sprint 1 em desenvolvimento | Primeiro incremento funcional, commits e tarefas registradas | José |
| **21/09 a 05/10** | Sprint 1 revisada e Sprint 2 planejada | Demonstração parcial e backlog ajustado | Todos |
| **05/10 a 19/10** | Versão Alpha em implementação | Funcionalidades principais integradas | José e Lucas |
| **19/10 a 16/11** | Preparação para implementação/validação | Versão testável, feedback do parceiro ou plano de homologação | Todos |
| **Novembro** | Implementação, validação e evolução da entrega | Evidências de uso, testes, homologação ou deploy | Todos |

## Próximos Passos

- [ ] **Interface Kanban para RMAs:** Fazer com que a gestão de status do chamado seja feita de forma visual, melhorando a experiência do usuário.
- [ ] **Ampliação da Cobertura de Testes:** Criar novos testes de integração para as regras de negócio de RMAs e Garantias.
- [ ] **Homologação e Deploy:** Validar os scripts de ambiente de produção, preparando o sistema para o primeiro ciclo de uso e feedback do cliente.


## Tempo por etapa e data limite

Substitui o antigo SLA por etapa (prazos de 24/48/72/120 h e alertas `SLA_WARNING`/`SLA_OVERDUE`), retirado por decisão do dono do produto em 13 nov 2026. O sistema mostra duas coisas: quanto tempo o RMA está em cada etapa e uma data limite opcional do atendimento inteiro.

### Tempo por etapa

- O backend devolve `stagePeriods` em cada RMA: os períodos em ordem cronológica, cada um com `status`, `enteredAt`, `leftAt` (nulo na etapa atual) e `durationSeconds`. O último item é a etapa atual.
- Registros consecutivos com o mesmo status formam um período só: notas e trocas de prioridade não reiniciam a etapa. Sair e voltar abre um período novo. Empates de instante usam o ID do histórico.
- Legados sem histórico começam em `createdAt`; se faltar, em `entryDate` à meia-noite de `America/Sao_Paulo`. Durações nunca são negativas.
- Cards do Kanban mostram "há 2 d 4 h nesta etapa" para RMAs abertos. Os detalhes mostram "Nesta etapa" (ou "Encerrado em ..." para RMAs encerrados) e, no Histórico, a lista "Tempo por etapa". O tempo do impedimento continua contando na etapa.
- A tela recalcula os tempos a cada 30 segundos (`ClockService`), sem recarregar.

### Data limite

- Opcional e só data (`dueDate`, `YYYY-MM-DD`). Quem abre o RMA (`rma.abrir`, `POST /api/rmas`) pode preenchê-la; depois, quem tem `rma.editar` altera ou remove pelo botão "Alterar" dos detalhes (`PUT /api/rmas/{id}` com `{"dueDate": "..."}` ou `{"clearDueDate": true}`; mandar os dois dá 400). Não há endpoint nem permissão novos.
- A data limite não pode ser anterior à entrada, inclusive quando a edição muda só a entrada. Datas no passado são aceitas, porque um RMA antigo pode já estar atrasado.
- Cada mudança fica em `dueDateHistory` (tabela `rma_due_date_history`) com autor, instante, valor anterior e novo, e aparece no Histórico dos detalhes.
- A situação vem em `deadline` (`status`, `dueSoonFrom`, `daysUntilDue`), com "hoje" sempre na data civil de `America/Sao_Paulo`:

| Situação | Código | Regra |
| --- | --- | --- |
| Atrasado | `OVERDUE` | RMA não encerrado e hoje depois da data limite |
| Perto do limite | `DUE_SOON` | RMA não encerrado e hoje entre `dataLimite - N` e a data limite, inclusive |
| No prazo | `ON_TRACK` | RMA não encerrado e hoje antes de `dataLimite - N` |
| Sem data limite | `NO_DUE_DATE` | RMA não encerrado e sem data limite |
| Encerrado | `CLOSED` | `COMPLETED`, `RETURNED` ou `IRREPARABLE`, com ou sem data limite; nunca é atrasado |

- `N` é `navitas.deadline.warning-days` (variável `DEADLINE_WARNING_DAYS`), de 0 a 90, padrão 7. Com 0, só o próprio dia fica "Perto do limite". Valor inválido impede a inicialização. Em Docker, a variável vai no `environment` do container backend (já previsto em `compose.yaml` e `compose.prod.yaml`).
- O frontend recalcula a situação a cada tique do relógio, a partir de `dueDate` e `dueSoonFrom`, então a virada da meia-noite não exige recarga.
- A data limite só destaca e filtra: **não gera notificação**. O card mostra "Atrasado há N dias" ou "Vence em N dias"/"Vence hoje" só nesses dois casos.
- O Kanban tem o filtro "Prazo" (Todos, Atrasados, Perto do limite, No prazo, Sem data limite). Encerrados aparecem só em "Todos". O filtro é salvo nas visualizações (`kanban_views.deadline_status`); visualizações antigas sem o campo abrem com "Todos". O dashboard mostra o indicador "Atrasados", com o detalhe "perto do limite".

### Migração

`V2__rma_due_date_and_remove_stage_sla.sql` acrescenta `rmas.due_date`, a tabela `rma_due_date_history` e `kanban_views.deadline_status` (com CHECK), e apaga todas as linhas `SLA_WARNING`/`SLA_OVERDUE` de `notification_rules` (destinatários junto), `notification_mutes`, `notifications` e `notification_events`, porque esses tipos saíram do código. Não havia dados em produção. Sessões, perfis e permissões não são tocados. O Flyway Community não tem undo: para voltar, restaure o backup anterior à implantação.

### Validação

- Backend: `RmaStageTimeServiceTest`, `RmaDeadlineServiceTest`, `RmaDeadlinePropertiesTest`, `DeadlineMigrationTest` e os testes de integração de RMA, relatório, visualizações e notificações (`mvn -B -ntp verify` em `backend/`).
- Frontend: `duration.spec.ts`, `rma-stage.spec.ts`, `rma-deadline.spec.ts` e os specs dos componentes, na suíte Vitest normal (`npm test -- --watch=false` em `frontend/`).

## Protocolos técnicos e checklists (NAV-45)

Modelos versionados de protocolo por produto ou categoria, executados durante o RMA. A migração-base (`V1__baseline.sql`) cria `protocol_templates`, `protocol_template_versions`, `protocol_template_items`, `rma_protocol_executions` e `rma_protocol_item_results`.

- **Modelos** (`/api/protocols/templates`, escrita com `protocolos.catalogo`): etapas, instruções, itens obrigatórios, verificação, texto ou medição (unidade, casas decimais, mínimo e máximo), resultado esperado e exigência de evidência. Cada alteração cria uma nova versão imutável; execuções já iniciadas continuam na versão em que começaram.
- **Execução** (`/api/protocols/rmas/{rmaId}/executions`, com `protocolos.executar`): vincula a versão atual ao RMA e registra, por item, executor, início, conclusão, resultado, medição (`BigDecimal`, devolvida como texto com a precisão configurada), texto e evidência (texto ou referência).
- **Validações no backend**: obrigatórios pendentes impedem a conclusão; medições com mais casas que o configurado ou fora da faixa não podem ser aprovadas; evidência exigida e texto obrigatório são verificados.
- **Reprovação e repetição**: reprovar ou marcar como não aplicável exige justificativa; repetir um item cria uma nova tentativa (também com justificativa) e o histórico das anteriores é mantido.
- **Bloqueio de status**: cada versão define as etapas do RMA (`blockedStatuses`) bloqueadas enquanto a execução mais recente daquele protocolo tiver itens obrigatórios não aprovados.
- **Laudo (NAV-27)**: `GET /api/protocols/rmas/{rmaId}/executions` expõe protocolo, versão, executor e todas as tentativas de cada item; é o ponto de integração do laudo técnico.

