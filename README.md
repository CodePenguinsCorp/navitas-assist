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

## Garantia dos produtos no RMA

Cada produto é avaliado individualmente. O vencimento corresponde à data de compra informada no RMA mais o prazo de garantia do produto, em meses. A cobertura considera a data de entrada do atendimento e inclui o dia do vencimento.

O enum `WarrantyStatus`, usado no backend e no frontend, representa três situações:

| Valor | Situação | Regra |
| --- | --- | --- |
| `PENDING` | Pendente | Data de compra desconhecida. |
| `IN_WARRANTY` | Em garantia | Entrada até o vencimento, inclusive. |
| `OUT_OF_WARRANTY` | Fora de garantia | Entrada após o vencimento. |

O prazo é registrado em cada novo item para preservar a garantia quando o cadastro do produto mudar. A API disponibiliza prazo, vencimento e situação em `items[]`; as telas exibem esses dados por produto. O cálculo é automático, sem edição manual da situação.

## Responsáveis pelos RMAs

O número da nota fiscal permanece disponível na abertura e nos detalhes do RMA. Não há campo de arquivo da NF nem de “Recebido por” na interface. O backend registra automaticamente o nome de usuário autenticado como recebedor na criação e preserva esse registro nas edições; `receivedBy` é somente leitura na API.

Cada RMA pode ter um técnico responsável ou permanecer sem responsável. ADMIN e SERVICE_DESK podem atribuir, trocar ou remover o responsável diretamente no Kanban; somente usuários ativos com perfil TECHNICIAN aparecem como novas opções. A inativação posterior não apaga a atribuição existente.

Toda alteração registra o responsável anterior, o novo responsável, o autor e o horário. O Kanban permite filtrar por técnico ativo ou por RMAs sem responsável, e os detalhes do RMA exibem o histórico completo de atribuições.

## Visualizações salvas do Kanban

Cada usuário autenticado pode salvar combinações dos filtros avançados do Kanban, reaplicá-las, renomeá-las, excluí-las e escolher uma visualização padrão. A preferência fica associada à conta e é restaurada ao abrir o quadro em uma nova sessão.

As rotas em `/api/kanban-views` usam sempre o usuário da sessão; o cliente não informa nem escolhe o proprietário. Nomes são únicos por usuário, e falhas de persistência não alteram os filtros que já estão aplicados na tela.

## Ações em lote no Kanban (NAV-15)

Marque cards em qualquer coluna e use **Selecionar visíveis** para incluir os itens mostrados pelos filtros. A seleção permanece ao mudar os filtros; o contador informa quantos selecionados estão ocultos. Use **Limpar seleção** para começar de novo. Antes de aplicar, a confirmação mostra a ação, a quantidade e os RMAs envolvidos. O resultado de cada RMA aparece separadamente; falhas continuam selecionadas para revisão. O quadro atualiza somente os itens afetados.

ADMIN e SERVICE_DESK podem alterar status, prioridade e responsável em lote. TECHNICIAN pode alterar somente status. VIEWER não pode selecionar nem alterar. Cada atualização passa pelas permissões da API e registra o histórico do RMA: etapas e prioridades no histórico de status; atribuições no histórico de responsáveis.

Na alteração de **status em lote**, qualquer etapa pode ser escolhida para os RMAs selecionados, inclusive uma etapa anterior ou a reabertura de um RMA encerrado. O histórico registra cada mudança. A API ainda confere a etapa atual de cada card para evitar sobrescrever uma alteração feita em outra sessão depois da seleção; nesse caso, somente o card desatualizado falha e é recarregado.

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

O frontend possui duas suítes: a Angular usa Vitest com DOM emulado por happy-dom, e a de SLA usa Node 22. Para instalar as dependências e executar ambas uma vez:

```powershell
cd .\frontend
npm ci
npm test -- --watch=false
npm run test:sla
```

Para desenvolvimento, `npm test` mantém o runner em modo interativo quando o terminal oferece TTY. A suíte de SLA valida os limites de prazo e os filtros. O workflow `Frontend CI` executa ambas as suítes e valida o build de produção em pushes e pull requests que alterem o frontend.

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
- `APP_ADMIN_USERNAME`
- `APP_ADMIN_PASSWORD`
- `APP_ADMIN_FULL_NAME`

Sem sobrescrever nada:

- o setup padrão do Docker usa `navitas_app / navitas123`
- o frontend Docker consome a API por proxy interno em `/api`
- o profile `local` continua disponável para rodar o backend manualmente contra o MySQL do Docker

## Autenticação e Sessão

A aplicação usa sessão criada no backend. O frontend envia usuário e senha somente para `POST /api/auth/login`; credenciais reutilizáveis não são persistidas no `localStorage` nem no `sessionStorage`.

- `JSESSIONID` é `HttpOnly` e `SameSite=Strict`; em ambientes não locais também é `Secure`
- requisições de escrita usam token CSRF no cookie `XSRF-TOKEN` e no header `X-XSRF-TOKEN`
- a sessão é restaurada após recarregar a página por `GET /api/auth/me`
- a expiração padrão por inatividade é de 30 minutos e pode ser alterada com `SESSION_TIMEOUT`
- `POST /api/auth/logout` invalida a sessão e remove os cookies de sessão e CSRF
- respostas de autenticação e autorização permanecem em JSON, com `401` e `403`
- a tela de login indica credenciais inválidas somente para `401` do endpoint de login; falhas de rede, serviço ou preparação do CSRF exibem uma mensagem genérica para nova tentativa, sem mostrar detalhes do servidor

## Admin Inicial

No profile `local`, no primeiro boot e apenas se ainda não existir usuário no banco, a aplicação cria:

- usuario: `admin`
- senha: `admin123`

Esses valores também são usados somente nos testes automatizados. Fora dos profiles `local` e `test`, `DB_URL`, `DB_USER`, `DB_PASSWORD`, `APP_ADMIN_USERNAME`, `APP_ADMIN_PASSWORD` e `APP_ADMIN_FULL_NAME` são obrigatórios; a aplicação falha na inicialização se algum deles não for informado. O ambiente de produção usa validação de schema e não imprime SQL nem credenciais nos logs.

## Autorização da API

| Recurso/operação | ADMIN | SERVICE_DESK | TECHNICIAN | VIEWER |
|:---|:---:|:---:|:---:|:---:|
| Consultar clientes, produtos e RMAs | Sim | Sim | Sim | Sim |
| Criar, alterar ou excluir clientes e produtos | Sim | Sim | Não | Não |
| Abrir ou alterar dados gerais de RMA | Sim | Sim | Não | Não |
| Alterar o status de RMA | Sim | Sim | Sim | Não |
| Atribuir ou remover responsável do RMA | Sim | Sim | Não | Não |
| Registrar ou alterar diagnóstico | Sim | Não | Sim | Não |
| Gerenciar as próprias visualizações do Kanban | Sim | Sim | Sim | Sim |
| Gerenciar usuários | Sim | Não | Não | Não |

Requisições sem autenticação recebem `401`; usuários autenticados sem permissão recebem `403`. Operações de API não classificadas explicitamente ficam restritas a `ADMIN`.

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

O projeto ainda não possui banco de produção nem dados que precisem ser preservados. O Flyway cria o schema inicial em um banco vazio e o Hibernate apenas valida o resultado (`ddl-auto=validate`). Não existe migração ou backfill de dados legados.

Quando o schema local ficar incompatível, descarte o volume de desenvolvimento e recrie a stack. O primeiro comando remove todos os dados locais:

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


## SLA do Kanban (NAV-10)

O backend calcula o SLA de cada RMA e o inclui no campo `sla` das respostas de consulta e atualização. Os cards mostram situação por texto e cor, tempo decorrido na etapa, limite e data/hora do prazo. O filtro de SLA combina-se com o de responsável. A tela recalcula situação e tempo a cada 30 segundos sem recarregar; datas são exibidas no fuso do navegador, a partir de instantes UTC.

### Regras e valores iniciais

Os valores abaixo são padrões operacionais iniciais, ajustáveis pelo administrador da implantação. São **minutos corridos**, incluindo noites, fins de semana e feriados; `WAITING_PART` também conta tempo.

| Etapa | Prazo padrão | Variável do backend |
| --- | --- | --- |
| RECEIVED | 1440 min (24h) | SLA_RECEIVED_MINUTES |
| TRIAGE | 1440 min (24h) | SLA_TRIAGE_MINUTES |
| IN_DIAGNOSIS | 2880 min (48h) | SLA_DIAGNOSIS_MINUTES |
| WAITING_PART | 7200 min (120h) | SLA_WAITING_PART_MINUTES |
| IN_REPAIR | 4320 min (72h) | SLA_REPAIR_MINUTES |
| IN_TESTS | 1440 min (24h) | SLA_TESTS_MINUTES |

- `NORMAL`: antes de 80% do prazo; `WARNING`: a partir de 80%, inclusive; `OVERDUE`: no instante do prazo e depois dele. `SLA_WARNING_PERCENT` pode variar de 1 a 99.
- A entrada na etapa é a primeira ocorrência do bloco mais recente dessa etapa no histórico. Observações repetindo o status não reiniciam o relógio. Sair e voltar inicia um novo prazo. Empates de timestamp usam o ID do histórico.
- `COMPLETED`, `RETURNED` e `IRREPARABLE` retornam `CLOSED`, sem prazo e sem acumular tempo (zero na etapa encerrada). O card mostra a data de entrada no estado encerrado. Reabrir reinicia o SLA da nova etapa.
- Legados sem histórico da etapa usam `createdAt`; se ausente, `entryDate` à meia-noite de America/Sao_Paulo. Esse fallback é aproximado; registros com histórico usam os instantes reais. Tempos futuros nunca produzem duração negativa.
- Não há pausa automática, calendário comercial ou SLA total do atendimento. A regra atual é aplicada a todos os registros, sem snapshots de políticas antigas.

### Configuração por etapa e prioridade

Configure `navitas.sla` em um arquivo Spring externo (ou `SPRING_APPLICATION_JSON`). Por padrão todas as prioridades usam o prazo da etapa. Uma substituição afeta apenas a prioridade informada:

```yaml
navitas:
  sla:
    warning-percent: 80
    stages:
      IN_DIAGNOSIS:
        minutes: 2880
        priority-minutes:
          HIGH: 1440
```

As demais etapas preservam os padrões. Prazos e substituições aceitam de 1 a 5256000 minutos; configuração inválida impede a inicialização. Reinicie o backend após alterar a configuração e recarregue o Kanban. Em Docker, as variáveis precisam estar no ambiente do **container backend** (por `environment`/`env_file` de um override Compose); apenas adicionar ao `.env` do host não as injeta automaticamente. Não há endpoint de edição nem alteração de permissões.

### Validação

- Backend: `mvn test` em `backend/` (limiares, notas, reentrada, encerramento/reabertura, prioridade, configuração e contrato HTTP).
- Filtros e apresentação: `npm run test:sla` em `frontend/`, com Node 22.14+ (runner nativo, sem framework adicional).
- Templates e tipos Angular: `npm run build` em `frontend/`.
