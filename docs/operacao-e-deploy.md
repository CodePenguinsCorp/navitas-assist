# Operação e deploy

Só o que existe hoje no repositório.

## Integração contínua

Dois workflows em `.github/workflows`, disparados em `push` e `pull_request` por caminho:

| Workflow | Dispara quando muda | O que roda |
| --- | --- | --- |
| `Backend CI` | `backend/**` ou o próprio workflow | Em contêiner Maven 3.9.9 / Java 17: `mvn -B -ntp verify` (testes e JAR) contra um PostgreSQL 16 de serviço, passado por `TEST_DB_URL`/`TEST_DB_USER`/`TEST_DB_PASSWORD` (o job roda dentro de contêiner, sem Docker para o Testcontainers). Não precisa de credenciais da aplicação. |
| `Frontend CI` | `frontend/**`, o próprio workflow, `Permission.java`, `PermissionModule.java` e `V1__baseline.sql` (lidos por `permissions.spec.ts`) | Node 22: `npm ci`, `npm test -- --watch=false` e `npm run build`. |

Não há workflow de entrega (CD) no repositório: nada publica as imagens Docker. O `compose.prod.yaml` espera que `BACKEND_IMAGE` e `FRONTEND_IMAGE` apontem para imagens já publicadas em algum registro.

## Build de produção

- **Backend** (`backend/Dockerfile`): build com `maven:3.9.9-eclipse-temurin-17` (`mvn package -DskipTests`) e execução em `eclipse-temurin:17-jre`, porta 8080.
- **Frontend** (`frontend/Dockerfile`): `ng build --configuration production` em `node:20-alpine` e entrega por `nginx:1.27-alpine`, porta 80. O `nginx.conf` serve a SPA (com fallback para `index.html`) e faz proxy de `/api/` e `/health` para `backend:8080`.

## Stack de produção

`compose.prod.yaml` sobe PostgreSQL 16, backend (profile `prod`, cookie `Secure`, porta 8080 apenas exposta na rede interna) e frontend (porta `FRONTEND_PORT`, padrão 80). Os dados do PostgreSQL ficam no volume `postgres_data`. Como o cookie é `Secure`, o acesso real precisa de HTTPS na frente do Nginx (por exemplo, um proxy reverso com TLS); isso não é provisionado pelo repositório.

1. Gere o `.env.prod` com segredos fortes (não sobrescreve arquivo existente; PowerShell aceita `-Force`, `-OutputPath`, `-BackendImage` e `-FrontendImage`):

   ```powershell
   .\scripts\init-prod-env.ps1        # ou: sh scripts/init-prod-env.sh
   ```

   O script grava `FRONTEND_PORT`, `POSTGRES_*` e as duas imagens (padrão `navitas-assist-*:ci`; ajuste para as imagens publicadas). As demais variáveis têm padrão no Compose; use `.env.prod.example` como referência ([configuracao.md](configuracao.md)).

2. Faça o deploy (pull das imagens e `up -d`; parâmetros `-ComposeFile` e `-EnvFile` no PowerShell, argumentos posicionais no `sh`):

   ```powershell
   .\scripts\deploy-prod.ps1          # ou: sh scripts/deploy-prod.sh
   ```

3. Insira o primeiro administrador no banco novo ([banco-de-dados.md](banco-de-dados.md#primeiro-administrador)). O deploy não cria contas.

## Checklist de ambiente (testes ou produção)

- [ ] `DB_URL`, `DB_USER`, `DB_PASSWORD` definidos; senha própria, nunca a dos exemplos (o backend recusa).
- [ ] `POSTGRES_PASSWORD` trocada; `.env.prod` fora do Git (`.env.*` está no `.gitignore`).
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

## Proteção do arquivo de ambiente

S13: `init-prod-env.sh` usa `umask 077` antes de criar o arquivo e confirma modo `600` após a escrita. No Windows, `init-prod-env.ps1` cria o arquivo vazio, remove herança e regras de acesso anteriores e concede controle total somente ao SID do usuário atual antes de gravar segredos, inclusive com `-Force`. Isso evita leitura das credenciais por outros usuários locais. Os testes `scripts/test-init-prod-env.ps1` e `scripts/test-init-prod-env.sh` verificam a ACL e o modo reais, sem exibir valores.

## Entrega HTTP do frontend

P15: o nginx comprime JavaScript, CSS, JSON e SVG a partir de 1 kB, com `Vary: Accept-Encoding`. Arquivos com hash no nome recebem `Cache-Control: public, max-age=31536000, immutable`; `index.html` e o fallback das rotas recebem `no-cache`, para permitir atualização da SPA sem baixar novamente assets já versionados.

As respostas incluem `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` e `Permissions-Policy: camera=(), microphone=(), geolocation=()`. `server_tokens off` oculta a versão do nginx. Não foi adicionada CSP; TLS e HSTS continuam a cargo do ambiente.

S1: o caminho exato `/api/auth/login` aplica limite por IP de 10 requisições por minuto, com `burst=5` sem espera; excesso retorna 429. O IP usado é o endereço remoto da conexão ao nginx. Ambientes com proxy na frente precisam tratar a origem confiável no próprio ambiente, sem confiar cegamente em cabeçalhos enviados pelo cliente.

Após `npm --prefix frontend run build`, `powershell -File scripts/test-nginx.ps1` monta o `dist` e a configuração em um nginx isolado na porta 18080, verifica gzip, cache, cabeçalhos, fallback e limitação e remove o contêiner ao terminar. A porta pode ser alterada com `-Port`; nenhuma pilha do repositório é usada.

## Privilégios de execução e CI

S14: a imagem backend executa o JAR como `USER 10001`. O JAR pertence a esse UID, `/app` permite escrita por ele e `/tmp` mantém a área temporária da JVM, evitando execução como root. A imagem foi construída e iniciada com `docker run --rm` em porta isolada 18081, conectada ao banco de validação `navitas-mig` (então MySQL; hoje o compose de validação sobe PostgreSQL); `/health` respondeu 200. O contêiner temporário foi removido ao fim.

O workflow `frontend-ci.yml` declara `permissions: contents: read`, limitando o token do GitHub ao acesso de leitura necessário ao checkout.

## Verificação da retomada de segurança (13/11/2026)

S1, S9 e S12 foram conferidos com testes de atraso e reset por usuário/origem, senha antes da situação ativa, erro uniforme, renovação do CSRF e limites HTTP de 100/101 caracteres e 20/21 itens. Desativar temporariamente as proteções produziu falhas nas verificações correspondentes; o código foi restaurado antes da validação final.

- `mvn -B -ntp -f backend/pom.xml verify`: 1.131 testes, nenhuma falha, erro ou teste ignorado; JAR gerado. O log mantém avisos existentes de Hibernate e compatibilidade Flyway/H2.
- Frontend com `TZ=UTC` e o `--runner-config` indicado em [desenvolvimento](desenvolvimento.md): 1.560 testes em 112 arquivos aprovados, saída zero. Duas execuções também imprimiram `ECONNRESET` sem teste associado; há evidência compatível com requisições nativas do Happy DOM, mas o disparador não foi confirmado.
- `npm --prefix frontend run build`: concluído sem avisos.
- `scripts/test-nginx.ps1 -Port 18080`: cache, gzip, cabeçalhos, fallback da SPA e limite de login com `429` aprovados em container isolado, removido ao fim.

A única correção fora de S1/S9/S12 foi no teste de idempotência da V14, que precisava distinguir a V15 já existente (ver [banco de dados](banco-de-dados.md)). Não houve alteração de schema. As provas anteriores de MySQL real e da imagem backend sem root não foram repetidas nesta retomada; as implementações comitadas foram preservadas. Nenhuma pilha em uso foi alterada. Não houve conferência visual em navegador nesta retomada.

Na troca para PostgreSQL (14/11/2026), a V14 (prefixo `OS-`) e a V15 (índices compostos) foram incorporadas à baseline única `V1__baseline.sql`; os testes passaram a rodar em PostgreSQL real, sem H2 (ver [banco de dados](banco-de-dados.md)).
