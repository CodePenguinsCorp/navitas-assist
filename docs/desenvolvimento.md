# Desenvolvimento

## Pré-requisitos

- **Com Docker**: Docker Desktop (e PowerShell para os scripts `run-local.ps1` e `stop-local.ps1`).
- **Sem Docker para backend/frontend**: Java 17+, Maven 3.9+, Node.js (o CI usa 22; a imagem Docker usa 20) com npm 10, e um MySQL 8 acessível (pode ser só o contêiner do banco).
- Dados de demonstração: Node.js 18+.

## Portas

| Serviço | Porta padrão | Variável |
| --- | --- | --- |
| Frontend | `4200` | `FRONTEND_PORT` |
| Backend | `8080` | `BACKEND_PORT` (Docker) / `SERVER_PORT` (processo) |
| MySQL | `3306` | `MYSQL_PORT` |

Healthcheck do backend: `GET /health`. Para duas cópias ao mesmo tempo, use portas diferentes no `.env` de cada uma.

## Subir com Docker

```powershell
Copy-Item .env.example .env
.\run-local.ps1 -Build
```

Isso sobe MySQL 8.0, o backend (profile `local`) e o frontend (Nginx). Equivalente direto: `docker compose up --build -d`. Se a stack já existe, o script derruba e sobe de novo os serviços alvo; use `-Build` quando houver mudança de código.

| Comando | Efeito |
| --- | --- |
| `.\run-local.ps1 -DatabaseOnly` | Só o MySQL. |
| `.\run-local.ps1 -BackendOnly` | Backend e MySQL (dependência). |
| `.\run-local.ps1 -FrontendOnly` | Só o frontend. |
| `.\stop-local.ps1` | Para a stack. Aceita `-DatabaseOnly`, `-BackendOnly`, `-FrontendOnly` e `-RemoveVolumes` (apaga os dados do MySQL). |
| `docker compose logs -f` / `docker compose ps` | Logs e estado. |

Acesse `http://localhost:4200` (frontend), `http://localhost:8080` (API) e `http://localhost:8080/health`. O frontend Docker consome a API pelo proxy interno em `/api`.

Se o MySQL não subir, provavelmente outro banco usa a `3306`: encerre o XAMPP/MySQL local ou altere `MYSQL_PORT` no `.env`.

## Subir sem Docker (backend e frontend)

Banco: suba só o MySQL (`.\run-local.ps1 -DatabaseOnly`) ou, com XAMPP, crie o banco e o usuário com `scripts/setup-xampp-db.ps1` (parâmetros `-MysqlExe`, `-RootUser`, `-RootPassword`).

```powershell
# backend
cd .\backend
$env:SPRING_PROFILES_ACTIVE = "local"
mvn spring-boot:run

# frontend (outro terminal)
cd .\frontend
npm install
npm start
```

O profile `local` (`backend/src/main/resources/application-local.yml`) assume `127.0.0.1:3306`, banco `navitas_assist`, usuário `navitas_app`, senha `navitas123`, cookie de sessão sem `Secure` e SQL nos logs. `DB_URL`, `DB_USER` e `DB_PASSWORD` sobrescrevem esses valores. `npm start` roda `ng serve` com `proxy.conf.json`, que encaminha `/api` e `/health` para `http://localhost:8080`.

Em banco novo não há usuário nenhum: insira o primeiro administrador conforme [banco-de-dados.md](banco-de-dados.md).

## Testes

### Backend

```powershell
cd .\backend
mvn -B -ntp verify                                   # suíte completa e JAR
mvn -B -ntp -Dtest=NomeDaClasse test                 # uma classe
```

Os testes usam o profile `test` com H2 em modo MySQL; não precisam de banco externo. O CI também roda `EnumPersistenceIntegrationTest` contra um MySQL real.

### Frontend

Vitest com DOM emulado por happy-dom, via builder `@angular/build:unit-test`:

```powershell
cd .\frontend
npm ci
npm test -- --watch=false                            # suíte uma vez (igual ao CI)
npm test                                             # modo interativo, quando há TTY
npm test -- --watch=false --include src/app/core/utils   # só um arquivo ou pasta (relativo a frontend/)
```

`--runner-config <arquivo>` passa um arquivo de configuração ao Vitest. Em algumas máquinas Windows o comando padrão pode travar ("Timeout starting forks runner"); nesses casos usa-se um arquivo fora do repositório que limita os workers, por exemplo `export default { test: { maxWorkers: 2 } };` salvo como `vitest-runner.config.mjs`:

```powershell
npm test -- --watch=false --runner-config C:\caminho\vitest-runner.config.mjs
```

Esse arquivo não faz parte do repositório; ele é opcional.

## Build

```powershell
cd .\backend ; mvn -B -ntp -DskipTests package       # JAR em backend/target
cd .\frontend ; npm run build                        # saída em frontend/dist
```

As imagens Docker usam `mvn package` (backend) e `ng build --configuration production` (frontend).

## Convenções

- **Commits**: mensagens em português, no formato `tipo(escopo): resumo` (ex.: `feat(rmas): ...`, `fix(rmas): ...`, `test(cadastros): ...`). Um commit por mudança coesa; `git add` por caminho, sem commitar arquivos de outras tarefas.
- **Migrações**: arquivos `V<n>__descricao.sql` em `backend/src/main/resources/db/migration`, sempre novos e aditivos; nunca edite uma migração já aplicada (o Flyway valida o histórico). Escreva SQL que funcione em MySQL 8 e no H2 em modo MySQL dos testes. Detalhes em [banco-de-dados.md](banco-de-dados.md).
- **Permissões**: o catálogo é `Permission.java`; o frontend tem `core/permissions.ts` e um teste (`permissions.spec.ts`) que confere os dois e a baseline. Mudou o catálogo, mude os dois.
- **Autorização**: checagens no código usam `Authentication.getAuthorities()`, nunca o principal.

## Dados de demonstração

`scripts/dev-seed/seed.mjs` popula um ambiente **local** já iniciado (sem dependências; requer os perfis Atendimento, Técnico e Consulta e uma conta administradora):

```powershell
node scripts/dev-seed/seed.mjs
# opcionais, definidos ANTES de executar:
$env:SEED_BASE_URL = 'http://localhost:4200'
$env:SEED_USER = 'admin'
$env:SEED_PASSWORD = '<senha do administrador>'
```

Sem variáveis, usa `http://localhost:4201` e `admin` / `admin123`; para a stack padrão (porta 4200), defina `SEED_BASE_URL`. O script só aceita origens de loopback.

Cria 3 clientes, 3 produtos, 3 peças (20 unidades cada), 7 ordens de serviço em etapas e prioridades variadas, 2 impedimentos, 2 reservas e um modelo de protocolo com 3 execuções, além de 3 usuários: `demo.atendimento`, `demo.tecnico` e `demo.consulta`. Os nomes de clientes e produtos levam `[DEMO]`; SKUs, códigos, lotes e séries levam `DEMO-`. A senha inicial dos usuários criados é impressa ao final.

Pode ser repetido após falha (reutiliza o que já existe), mas rode uma instância por vez; não há limpeza automática. Mais detalhes em `scripts/dev-seed/README.md`.
