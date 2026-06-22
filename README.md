# Navitas Assist

Sistema web para diagnostico tecnico e acompanhamento de RMAs.

## Visao Geral

O projeto foi dividido em duas aplicacoes:

- `frontend/`: SPA em Angular
- `navitas-assist-backend/`: API REST em Spring Boot

## Stack

- Frontend: Angular 21
- Backend: Spring Boot 3.2
- Java: 17+
- Banco: MySQL 8

## Estrutura do Projeto

- `frontend/`: interface web
- `navitas-assist-backend/`: API e regras de negocio
- `run-local.ps1`: sobe a stack local via Docker
- `stop-local.ps1`: para a stack local via Docker
- `compose.yaml`: sobe frontend, backend e MySQL via Docker
- `compose.prod.yaml`: stack de producao usando imagens publicadas

## Requisitos

### Para rodar com Docker

- Docker Desktop

### Para rodar backend/frontend manualmente

- Java 17 ou superior
- Maven 3.9+
- Node.js e npm
- PowerShell

## Portas Padrao

- frontend: `4200`
- backend: `8080`
- banco: `3306`

## Rodando com Docker

Esse e o caminho padrao do projeto agora.

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

Voce tambem pode usar o Compose diretamente:

```powershell
docker compose up --build -d
```

Se a stack ja estiver rodando, o `run-local.ps1` derruba e sobe novamente os servicos alvo automaticamente.
Quando houver mudanca de codigo no backend ou frontend, prefira usar `-Build` para reconstruir as imagens locais antes de subir.

### 3. Acesse

- frontend: `http://localhost:4200`
- backend: `http://localhost:8080`
- healthcheck: `http://localhost:8080/health`

### 4. Comandos uteis

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
- usuario: `navitas_app`
- senha: `navitas123`

Esse fluxo usa o MySQL publicado pelo Docker na porta `3306`.

## Frontend Manual

Para subir apenas o frontend:

```powershell
cd .\frontend
npm install
npm start
```

## Variaveis de Ambiente

O setup local reconhece estas variaveis principais:

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

- o setup padrao do Docker usa `navitas_app / navitas123`
- o frontend Docker consome a API por proxy interno em `/api`
- o profile `local` continua disponivel para rodar o backend manualmente contra o MySQL do Docker

## Admin Inicial

No primeiro boot, se ainda nao existir usuario no banco, a aplicacao cria:

- usuario: `admin`
- senha: `admin123`

## Producao

O projeto agora possui os mesmos artefatos basicos de deploy do `Reserva-Plus`:

- `compose.prod.yaml`: stack de producao usando imagens publicadas
- `scripts/init-prod-env.ps1` e `scripts/init-prod-env.sh`: geram `.env.prod` com segredos fortes
- `scripts/deploy-prod.ps1` e `scripts/deploy-prod.sh`: fazem pull e sobem a stack de producao
- `.env.prod.example`: exemplo de variaveis para producao

Exemplo para gerar um `.env.prod`:

```powershell
.\scripts\init-prod-env.ps1
```

Exemplo para deploy manual:

```powershell
.\scripts\deploy-prod.ps1
```

## Troubleshooting

Se o MySQL Docker nao subir, provavelmente ja existe outro banco ocupando a porta `3306`.
Nesse caso:

- encerre o XAMPP/MySQL local
- ou altere `MYSQL_PORT` no `.env`

Para inspecionar a stack:

```powershell
docker compose ps
```
