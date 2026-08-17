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
- `navitas-assist-backend/`: API REST em Spring Boot

## Stack

- Frontend: Angular 21
- Backend: Spring Boot 3.2
- Java: 17+
- Banco: MySQL 8

## Estrutura do Projeto

- `frontend/`: interface web
- `navitas-assist-backend/`: API e regras de negócio
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
- MySQL 8.4

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
cd .\navitas-assist-backend
$env:SPRING_PROFILES_ACTIVE="local"
mvn spring-boot:run
```

O profile `local` fica em:

- `navitas-assist-backend/src/main/resources/application-local.yml`

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
- `APP_ADMIN_USERNAME`
- `APP_ADMIN_PASSWORD`
- `APP_ADMIN_FULL_NAME`

Sem sobrescrever nada:

- o setup padrão do Docker usa `navitas_app / navitas123`
- o frontend Docker consome a API por proxy interno em `/api`
- o profile `local` continua disponável para rodar o backend manualmente contra o MySQL do Docker

## Admin Inicial

No primeiro boot, se ainda não existir usuário no banco, a aplicação cria:

- usuario: `admin`
- senha: `admin123`

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
| **10/08 a 24/08** | Ponto de partida mínimo concluído | README, arquitetura, stack, backlog, estrutura inicial e repositório | Todos |
| **24/08 a 21/09** | Sprint 1 em desenvolvimento | Primeiro incremento funcional, commits e tarefas registradas | Todos |
| **21/09 a 05/10** | Sprint 1 revisada e Sprint 2 planejada | Demonstração parcial e backlog ajustado | Todos |
| **05/10 a 19/10** | Versão Alpha em implementação | Funcionalidades principais integradas | Todos |
| **19/10 a 16/11** | Preparação para implementação/validação | Versão testável, feedback do parceiro ou plano de homologação | Todos |
| **Novembro** | Implementação, validação e evolução da entrega | Evidências de uso, testes, homologação ou deploy | Todos |

## Próximos Passos

- [ ] **Interface Kanban para RMAs:** Fazer com que a gestão de status do chamado seja feita de forma visual, melhorando a experiência do usuário.
- [ ] **Ampliação da Cobertura de Testes:** Criar novos testes de integração para as regras de negócio de RMAs e Garantias.
- [ ] **Homologação e Deploy:** Validar os scripts de ambiente de produção, preparando o sistema para o primeiro ciclo de uso e feedback do cliente.
