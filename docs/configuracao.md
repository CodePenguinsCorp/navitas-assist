# Configuração

Fontes: `backend/src/main/resources/application.yml`, `application-local.yml`, `compose.yaml`, `compose.prod.yaml`, `.env.example` e `.env.prod.example`. O Spring não lê arquivos `.env`: o Docker Compose lê o `.env` da raiz (ou `--env-file`) e repassa ao contêiner; ao rodar o backend à mão, exporte as variáveis no shell.

## Perfis do Spring

| Profile | Uso | Efeito |
| --- | --- | --- |
| `local` | Docker de desenvolvimento e `mvn spring-boot:run` | Padrões de banco locais, cookie sem `Secure`, SQL nos logs, `ddl-auto=update`. |
| `test` | Testes automatizados | H2 em memória, porta aleatória. |
| `prod` | `compose.prod.yaml` | Sem padrões de banco; valida schema (`ddl-auto=validate`), não imprime SQL. |

Fora de `local` e `test`, `DB_URL`, `DB_USER` e `DB_PASSWORD` são obrigatórias e a aplicação recusa, em `DB_PASSWORD`, as senhas publicadas nos exemplos (`admin123`, `navitas123`, `root123`, `troque-esta-senha`, `troque-esta-senha-root`). A mensagem cita só o nome da variável. Essa checagem não altera contas nem senhas dos usuários da aplicação.

## Banco de dados

| Variável | Padrão | Obrigatória | Observação |
| --- | --- | --- | --- |
| `DB_URL` | local: `jdbc:mysql://127.0.0.1:3306/navitas_assist?...` | Fora de `local`/`test` | URL JDBC do MySQL. |
| `DB_USER` | local: `navitas_app` | Fora de `local`/`test` | |
| `DB_PASSWORD` | local: `navitas123` | Fora de `local`/`test` | Não pode ser senha de exemplo. |

Só do Docker Compose (não chegam ao Spring diretamente; o Compose monta `DB_URL`, `DB_USER` e `DB_PASSWORD` a partir delas):

| Variável | Padrão (`compose.yaml`) | Observação |
| --- | --- | --- |
| `MYSQL_DATABASE` | `navitas_assist` | Obrigatória em `compose.prod.yaml`. |
| `MYSQL_USER` | `navitas_app` | Obrigatória em produção. |
| `MYSQL_PASSWORD` | `navitas123` | Obrigatória em produção; troque. |
| `MYSQL_ROOT_PASSWORD` | `root123` | Obrigatória em produção; troque. |
| `MYSQL_PORT` | `3306` | Porta publicada no host (só `compose.yaml`). |
| `BACKEND_PORT` | `8080` | Porta publicada do backend (só `compose.yaml`; em produção o backend não é publicado). |
| `FRONTEND_PORT` | `4200` (dev) / `80` (prod) | Porta publicada do frontend. |
| `BACKEND_IMAGE`, `FRONTEND_IMAGE` | sem padrão | Obrigatórias em `compose.prod.yaml`. |

## Servidor, sessão e segurança

| Variável | Padrão | Observação |
| --- | --- | --- |
| `SERVER_PORT` | `8080` | Porta do processo do backend. |
| `SESSION_TIMEOUT` | `30m` | Expiração da sessão por inatividade. |
| `SESSION_COOKIE_SECURE` | `true` | Define `Secure` nos cookies `JSESSIONID` e `XSRF-TOKEN`. O profile `local` força `false`; `compose.yaml` usa `false` e `compose.prod.yaml` usa `true` (fixos no arquivo). |

Os cookies são `HttpOnly` (sessão) e `SameSite=Strict`. Detalhes de sessão e CSRF em [acesso-e-permissoes.md](acesso-e-permissoes.md). Uploads multipart: 2 MB por arquivo e 3 MB por requisição (`spring.servlet.multipart`, não configurável por variável).

## Prazo

| Variável | Padrão | Observação |
| --- | --- | --- |
| `DEADLINE_WARNING_DAYS` | `7` | Janela "Perto do limite" da data limite, de 0 a 90 dias. Valor inválido impede a inicialização. Em Docker, vai no `environment` do backend (já previsto nos dois Compose). Ver [prazo-e-garantia.md](prazo-e-garantia.md). |

## E-mail e notificações

Detalhes de comportamento em [notificacoes-e-emails.md](notificacoes-e-emails.md). O canal é desligado por padrão.

| Variável | Padrão | Obrigatória quando | Validação |
| --- | --- | --- | --- |
| `NOTIFICATIONS_EMAIL_ENABLED` | `false` | | Desligado pausa a fila sem aplicar tentativas. |
| `NOTIFICATIONS_EMAIL_PROVIDER` | `fake` | | `fake` ou `resend`. Com o canal ligado, `fake` só é aceito nos perfis `local` e `test`. |
| `MAIL_FROM` | vazio | Canal ligado | Um único endereço de e-mail válido. |
| `APP_BASE_URL` | vazio | Canal ligado | URL absoluta sem credenciais, query ou fragmento; HTTPS com Resend; HTTP só no fake e em `localhost`, `127.0.0.1` ou `[::1]`. |
| `RESEND_API_KEY` | vazio | Canal ligado com `resend` | Sem quebras de linha. |
| `NOTIFICATIONS_EMAIL_POLL_MS` | `5000` | | Positivo. Intervalo da varredura da fila. |
| `NOTIFICATIONS_EMAIL_BATCH_SIZE` | `50` | | De 1 a 100. |
| `NOTIFICATIONS_EMAIL_DAILY_LIMIT` | `100` | | `0` = sem limite. Teto de envios ao provedor real por dia civil de São Paulo. |
| `NOTIFICATIONS_EMAIL_MONTHLY_LIMIT` | `3000` | | `0` = sem limite. Teto por mês civil de São Paulo. |
| `NOTIFICATIONS_EMAIL_SEND_INTERVAL_MS` | `500` | | `0` desliga o espaçamento (500 ms = até 2 envios por segundo). |
| `NOTIFICATIONS_ASYNC_CORE_POOL_SIZE` | `2` | | Pool que distribui as notificações. Não consta nos exemplos `.env`. |
| `NOTIFICATIONS_ASYNC_MAX_POOL_SIZE` | `4` | | Idem. |
| `NOTIFICATIONS_ASYNC_QUEUE_CAPACITY` | `500` | | Idem. |

Configuração inválida falha na inicialização, sem mostrar segredos. Os exemplos e ambos os Compose mantêm o canal desligado (os três `NOTIFICATIONS_ASYNC_*` não são repassados pelo Compose).

## Exemplo para desenvolvimento com e-mail simulado

```
NOTIFICATIONS_EMAIL_ENABLED=true
NOTIFICATIONS_EMAIL_PROVIDER=fake
MAIL_FROM=notificacoes@example.invalid
APP_BASE_URL=http://localhost:4200
```

O provedor fake guarda só as últimas 100 mensagens em memória (limpas ao reiniciar) e não há endpoint de captura.

## Persistência e consultas (P1 e P7)

`spring.jpa.open-in-view: false` mantém o acesso lazy dentro das transações dos serviços, evitando consultas durante a serialização HTTP. O Hibernate usa `default_batch_fetch_size: 50` para agrupar carregamentos de relações; o teste de regressão limita uma página de 20 OS a 30 statements, com contexto de persistência limpo e clientes/produtos distintos.

O Hikari usa `maximum-pool-size: 10` e `connection-timeout: 10000` ms explicitamente para limitar concorrência no banco e espera por conexão. São valores fixos da aplicação, sem novas variáveis de ambiente.

## Resumo de usuários (P9)

O resumo usa contagens no banco, inclusive administradores com permissões combinadas entre perfil e extras, ativos ou inativos. Isso evita hidratar todas as contas apenas para exibir totais. O teste verifica as permissões divididas e extras, inclui uma conta inativa e exige zero entidades carregadas.

## Limites de autenticação e entrada

S1: o atraso do login usa constantes da aplicação, sem novas variáveis de ambiente: terceira falha com 1 segundo, crescimento até 30 segundos e no máximo 10.000 pares de usuário/origem em memória por instância. O sucesso limpa o par; reinício e descarte do par mais antigo também removem seu histórico. Isso reduz tentativas repetidas sem permitir bloqueio de uma conta. A origem é `request.getRemoteAddr()`, sem confiar em `X-Forwarded-For` enviado pelo cliente; atrás do nginx, pode representar a conexão do proxy. O limite adicional de 10 requisições/minuto por IP fica no nginx (ver [operação e deploy](operacao-e-deploy.md)).

S9: cada login renova o cookie CSRF para trocar o segredo usado antes da autenticação; o cabeçalho das próximas escritas deve acompanhar o novo cookie. S12: `items` tem teto de 20 na criação e edição de Ordem de Serviço (OS), e `query` tem teto de 100 caracteres nas buscas e filtros salvos do Kanban. A validação recusa cargas excessivas antes do serviço, sem alterar o schema, o teto da paginação ou a senha mínima.
