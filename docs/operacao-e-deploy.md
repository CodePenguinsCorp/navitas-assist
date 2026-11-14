# Operação e deploy

Só o que existe hoje no repositório.

## Integração contínua

Dois workflows em `.github/workflows`, disparados em `push` e `pull_request` por caminho:

| Workflow | Dispara quando muda | O que roda |
| --- | --- | --- |
| `Backend CI` | `backend/**` ou o próprio workflow | Em contêiner Maven 3.9.9 / Java 17: `mvn -B -ntp verify` (testes com H2 e JAR); depois, contra um MySQL 8 de serviço, `mvn test -Dtest=EnumPersistenceIntegrationTest`. Não precisa de credenciais da aplicação. |
| `Frontend CI` | `frontend/**`, o próprio workflow, `Permission.java`, `PermissionModule.java` e `V1__baseline.sql` (lidos por `permissions.spec.ts`) | Node 22: `npm ci`, `npm test -- --watch=false` e `npm run build`. |

Não há workflow de entrega (CD) no repositório: nada publica as imagens Docker. O `compose.prod.yaml` espera que `BACKEND_IMAGE` e `FRONTEND_IMAGE` apontem para imagens já publicadas em algum registro.

## Build de produção

- **Backend** (`backend/Dockerfile`): build com `maven:3.9.9-eclipse-temurin-17` (`mvn package -DskipTests`) e execução em `eclipse-temurin:17-jre`, porta 8080.
- **Frontend** (`frontend/Dockerfile`): `ng build --configuration production` em `node:20-alpine` e entrega por `nginx:1.27-alpine`, porta 80. O `nginx.conf` serve a SPA (com fallback para `index.html`) e faz proxy de `/api/` e `/health` para `backend:8080`.

## Stack de produção

`compose.prod.yaml` sobe MySQL 8.0, backend (profile `prod`, cookie `Secure`, porta 8080 apenas exposta na rede interna) e frontend (porta `FRONTEND_PORT`, padrão 80). Os dados do MySQL ficam no volume `mysql_data`. Como o cookie é `Secure`, o acesso real precisa de HTTPS na frente do Nginx (por exemplo, um proxy reverso com TLS); isso não é provisionado pelo repositório.

1. Gere o `.env.prod` com segredos fortes (não sobrescreve arquivo existente; PowerShell aceita `-Force`, `-OutputPath`, `-BackendImage` e `-FrontendImage`):

   ```powershell
   .\scripts\init-prod-env.ps1        # ou: sh scripts/init-prod-env.sh
   ```

   O script grava `FRONTEND_PORT`, `MYSQL_*` e as duas imagens (padrão `navitas-assist-*:ci`; ajuste para as imagens publicadas). As demais variáveis têm padrão no Compose; use `.env.prod.example` como referência ([configuracao.md](configuracao.md)).

2. Faça o deploy (pull das imagens e `up -d`; parâmetros `-ComposeFile` e `-EnvFile` no PowerShell, argumentos posicionais no `sh`):

   ```powershell
   .\scripts\deploy-prod.ps1          # ou: sh scripts/deploy-prod.sh
   ```

3. Insira o primeiro administrador no banco novo ([banco-de-dados.md](banco-de-dados.md#primeiro-administrador)). O deploy não cria contas.

## Checklist de ambiente (testes ou produção)

- [ ] `DB_URL`, `DB_USER`, `DB_PASSWORD` definidos; senha própria, nunca a dos exemplos (o backend recusa).
- [ ] `MYSQL_PASSWORD` e `MYSQL_ROOT_PASSWORD` trocadas; `.env.prod` fora do Git (`.env.*` está no `.gitignore`).
- [ ] HTTPS na frente do frontend (cookies `Secure`); `SESSION_COOKIE_SECURE=true`.
- [ ] Backup do banco antes de implantar versão com migração nova (o Flyway não tem *undo*).
- [ ] Banco migrado e primeiro administrador criado; login conferido.
- [ ] `GET /health` responde pelo frontend e pelo backend.
- [ ] E-mail: canal desligado, ou `resend` com `MAIL_FROM`, `APP_BASE_URL` em HTTPS e `RESEND_API_KEY`; tetos diário e mensal conforme o plano do provedor; uma única instância do backend ([notificacoes-e-emails.md](notificacoes-e-emails.md)).
- [ ] `DEADLINE_WARNING_DAYS` e `SESSION_TIMEOUT` conferidos.
- [ ] Roteiro de conferência manual percorrido no ambiente ([ux/2026-11-07-roteiro-conferencia-manual.md](ux/2026-11-07-roteiro-conferencia-manual.md)).

Limitação conhecida: o registro de sessões é em memória, por instância; reiniciar o backend encerra as sessões e a revogação não é sincronizada entre réplicas ([acesso-e-permissoes.md](acesso-e-permissoes.md)).

## Desempenho do navegador

- P17: o resumo do sino é consultado a cada 60 segundos somente enquanto a aba está visível. Ao voltar, a consulta ocorre imediatamente; ocultar a aba cancela o temporizador e a consulta pendente. Isso reduz chamadas sem atrasar a atualização na volta.
- P18: removidos os dois PNGs antigos da marca de `frontend/public`, sem uso em `src` (incluindo `index.html`) ou `angular.json`. Login e lateral usam `brand/*.svg`. A única referência em `docs` estava no plano histórico de conferência de 9/11, preservado como registro; o build deixa de copiar 75.940 bytes sem uso.
