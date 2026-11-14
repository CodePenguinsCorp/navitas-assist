# Ambiente de testes para o dono do produto

Frontend na Vercel, backend Docker no Render e PostgreSQL gerenciado (Neon ou Supabase). Este guia prepara uma demonstração com dados fictícios. A publicação e o login nas contas são feitos pelo responsável pelo ambiente.

O navegador acessa somente `https://SEU-SITE.vercel.app/api/...`. A Vercel encaminha essas chamadas ao Render sem mudar a URL do navegador. Assim, sessão e CSRF permanecem na mesma origem; não configure URL absoluta no Angular nem habilite CORS para contornar erros.

## Tenha em mãos

- Acesso ao repositório remoto com a migração PostgreSQL concluída e estes artefatos disponíveis na branch escolhida. A publicação do código no remoto é uma etapa manual do responsável.
- Contas no GitHub, Render, Vercel e Neon **ou** Supabase, com acesso ao repositório autorizado pelo usuário.
- E-mail para entrar nos provedores; nome de usuário do administrador (ex.: `admin`) e senha própria, escolhida pelo usuário (6 a 72 bytes UTF-8; prefira uma senha forte e exclusiva).
- Node.js 22 para a carga de demonstração; Docker Desktop para gerar o hash BCrypt, sem iniciar nenhuma pilha local.
- Um gerenciador de senhas para guardar as credenciais do banco e do administrador. Não cole senhas em arquivos versionados, capturas de tela ou chamados.

## Checklist de publicação

1. **Confira a versão do código.** Use a branch com driver PostgreSQL, baseline Flyway e suporte a `DB_POOL_MAX`/`MIGRATION_DB_*`. A versão anterior MySQL não serve para este ambiente. Não reutilize banco MySQL nem execute os comandos de recriação do banco local. Consulte [banco de dados](banco-de-dados.md).

2. **Crie um banco vazio.** No Neon, crie um projeto Free, escolha PostgreSQL 16 quando disponível e região próxima de Virginia (US East), onde ficará o backend. Abra **Connect**, desative o pooler para começar e copie host, porta, banco, usuário e senha. No Supabase, crie um projeto Free, guarde a senha do banco e abra **Connect → Direct connection**. Use só o PostgreSQL; o login da aplicação não usa Supabase Auth. Confirme que `unaccent` é permitido e que o usuário das migrações pode criar essa extensão.

   Separe a conexão em três campos no Render:

   ```text
   DB_URL=jdbc:postgresql://HOST:5432/DB?sslmode=require
   DB_USER=USUARIO_DO_BANCO
   DB_PASSWORD=SENHA_DO_BANCO
   ```

   A URL JDBC não recebe usuário nem senha embutidos; copie a senha original para o campo separado, sem codificação de URL. Se o painel oferecer `postgresql://USUARIO:SENHA@HOST/DB`, extraia os campos; apenas acrescentar `jdbc:` a essa string inteira não basta. Não use a senha do administrador da aplicação como senha do banco.

   Comece com conexão direta tanto para o app quanto para o Flyway. O pooler é opcional: em modo **transaction**, acrescente `&prepareThreshold=0` ao `DB_URL` do app e cadastre `MIGRATION_DB_URL`, `MIGRATION_DB_USER` e `MIGRATION_DB_PASSWORD` com a conexão direta para o Flyway; não deixe essas variáveis vazias. No Supabase a conexão direta pode exigir IPv6: se houver erro de rede no Render, use o **Session pooler**, porta 5432, compatível com IPv4 e sessões persistentes, inclusive para o Flyway. Não troque o Flyway para transaction pooler. Veja [conexões do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres) e [configuração do banco](banco-de-dados.md#conexão-em-provedor-gerenciado).

3. **Prepare o projeto da Vercel para reservar o endereço.** Em **Add New → Project**, importe o repositório e escolha **Root Directory: frontend**, framework Angular, Node.js 22, build `npm run build` e saída `dist/navitas-assist-frontend/browser`. Anote o endereço estável previsto (`https://SEU-SITE.vercel.app`). Caso ele só seja conhecido após o primeiro deploy, ajuste `APP_BASE_URL` no Render quando obtiver a URL definitiva. A primeira publicação ainda não terá API enquanto o placeholder não for trocado.

4. **Crie o backend no Render.** Escolha **New → Blueprint**, conecte o repositório/branch e selecione `render.yaml` da raiz. Confira **Free**, Docker, região **Virginia**, contexto `backend`, Dockerfile `backend/Dockerfile`, health check `/health`. Não crie PostgreSQL do Render por este Blueprint. Ele contém apenas um web service, sem autoscaling; mantenha **uma instância**, pois sessões, limitação de login e tarefas de e-mail usam memória local. O Dockerfile existente compila com Maven/Java 17 e executa como usuário sem privilégios.

   Preencha os campos solicitados (`sync: false`): `DB_URL`, `DB_USER`, `DB_PASSWORD` e `APP_BASE_URL` (URL HTTPS estável da Vercel, sem barra final). Guarde segredos apenas no painel. `DB_PASSWORD` não pode ser `admin123`, `navitas123`, `root123`, `troque-esta-senha` ou `troque-esta-senha-root`: a aplicação recusa esses exemplos em `prod`.

   Os demais valores já estão no Blueprint:

   | Configuração | Valor e motivo |
   | --- | --- |
   | `SPRING_PROFILES_ACTIVE` | `prod`, nunca `local` nem `test` |
   | `SERVER_PORT` | `10000`, porta HTTP interna detectada pelo Render |
   | `SERVER_FORWARD_HEADERS_STRATEGY` | `framework`, trata esquema, host e origem encaminhados pelos proxies |
   | `SESSION_COOKIE_SECURE` | `true` para sessão e CSRF |
   | `DB_POOL_MAX` | `5`, poucas conexões no banco gratuito |
   | `NOTIFICATIONS_EMAIL_ENABLED` / `NOTIFICATIONS_EMAIL_PROVIDER` | `false` / `fake`, nenhum envio real |
   | `MAIL_FROM` | `notificacoes@example.invalid`, substituir antes de ligar e-mail |
   | Limites de e-mail | 100/dia, 3.000/mês, intervalo 500 ms |
   | `DEADLINE_WARNING_DAYS` | `7` |
   | `JAVA_TOOL_OPTIONS` | `-XX:MaxRAMPercentage=65 -XX:+ExitOnOutOfMemoryError`, reserva espaço fora do heap nos 512 MB |

   Confirme a criação. Aguarde o build, aplicação do Flyway e status **Live**. Abra `https://SEU-BACKEND.onrender.com/health`: deve responder HTTP 200. Se o processo reiniciar por memória, consulte os logs e reduza carga ou mude o plano; o limite de heap não limita toda a memória da JVM. Novas versões exigem deploy manual (`autoDeployTrigger: off`).

5. **Crie o primeiro administrador.** Só depois de o Flyway criar o schema, gere o BCrypt na raiz do repositório, pelo prompt oculto:

   ```powershell
   .\scripts\gen-bcrypt.ps1
   ```

   No Bash: `bash scripts/gen-bcrypt.sh`. Os scripts exigem Docker, usam um contêiner descartável sem porta/volume e mostram somente o hash já convertido de `$2y$` para `$2a$`. A senha entra por stdin no contêiner. Não use transcrição/gravação de terminal. Ambos aceitam argumento (`-Password` no PowerShell ou primeiro argumento no Bash), mas **prefira o prompt**: digitar senha literal no comando pode deixá-la no histórico e nos processos.

   O comando equivalente é `docker run --rm httpd:2.4-alpine htpasswd -nbBC 10 x SENHA`, removendo `x:` e trocando `$2y$` por `$2a$`. Use-o apenas como referência; os scripts evitam a senha literal na linha de comando.

   Abra o **SQL Editor** do Neon/Supabase e execute uma única vez o `INSERT` de [primeiro administrador](banco-de-dados.md#primeiro-administrador), substituindo `<hash BCrypt>` pelo resultado. Use o nome escolhido em vez de `admin`, se necessário. O perfil vem de `legacy_code = 'ADMIN'`; não fixe um ID. Esse INSERT não cadastra e-mail: depois, informe o e-mail pela tela Usuários se quiser receber notificações. Não salve a consulta com o hash nem a publique. A aplicação não cria conta padrão ao iniciar.

6. **Ligue o frontend à API.** Copie a URL HTTPS do Render e substitua **somente** `https://SEU-BACKEND.onrender.com` no destino do rewrite em `frontend/vercel.json`. Preserve `/api/:path*` nas duas pontas. O placeholder é proposital e precisa ser trocado antes do teste. Disponibilize essa alteração na branch remota pelo fluxo manual habitual e faça deploy/redeploy na Vercel. Não há interpolação de variável de ambiente nesse destino JSON. Confira `APP_BASE_URL` no Render com a URL definitiva da Vercel e aplique a alteração.

   O rewrite externo funciona como [proxy reverso](https://vercel.com/docs/routing/rewrites). A regra seguinte atende rotas Angular com `/index.html`, exceto `/api`, diretórios `assets`/`media` e caminhos com extensão. Arquivos inexistentes com extensão devem dar 404, não HTML. Rotas Angular futuras com ponto no último segmento exigirão rever essa regra. JavaScript/CSS com hash recebem cache imutável; HTML e rotas da SPA revalidam; `/api` recebe `no-store`. Não foi adicionada CSP restritiva.

7. **Valide o login pela Vercel.** Abra a URL estável, entre com o administrador e faça uma alteração simples. No navegador, em **Ferramentas do desenvolvedor → Rede**, as chamadas devem ir para `/api/...` na Vercel, sem erro CORS. Em **Aplicativo → Cookies**, confira `JSESSIONID` com `HttpOnly`, `Secure`, `SameSite=Strict` e `XSRF-TOKEN` com `Secure`, `SameSite=Strict`, legível pelo Angular. Os cookies não têm `Domain` fixo; chegam pelo proxy na origem da Vercel. Nas escritas, confira o header `X-XSRF-TOKEN` e a renovação do token após login. Nunca copie valores de cookies para chamados.

   Atualize uma rota interna pelo botão recarregar: deve manter a tela, sem 404. Teste sair e entrar novamente. Um 401 antes do login é normal; 403 em escrita pede conferir cookie/token e rewrite, não desligar CSRF. Se o backend estiver dormindo, abra `/health`, espere ficar disponível e tente de novo. Preview protegido da Vercel pode bloquear o seed; use a URL estável acessível ao responsável.

8. **Carregue a demonstração somente no banco de testes.** Ela cria cadastros, usuários com senha pública de demonstração e ordens de serviço. Não use dados reais, não execute em produção e troque/desative as contas demo após a apresentação. Mantenha e-mail desligado durante a carga. Confira o endereço antes de executar; `SEED_ALLOW_REMOTE=1` autoriza escritas remotas e não verifica quem é o dono do destino.

   No PowerShell, use uma senha solicitada sem histórico e limpe o ambiente ao terminar:

   ```powershell
   $env:SEED_BASE_URL = 'https://SEU-SITE.vercel.app'
   $env:SEED_ALLOW_REMOTE = '1'
   $env:SEED_USER = 'admin'
   $senhaSeed = Read-Host 'Senha do administrador' -AsSecureString
   $ptrSeed = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaSeed)
   try {
       $env:SEED_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptrSeed)
       node scripts/dev-seed/seed.mjs
       if ($LASTEXITCODE -ne 0) { throw 'A carga não terminou; confira a mensagem acima.' }
   } finally {
       [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptrSeed)
       Remove-Item Env:SEED_PASSWORD, Env:SEED_ALLOW_REMOTE, Env:SEED_USER, Env:SEED_BASE_URL -ErrorAction SilentlyContinue
       $senhaSeed = $null
   }
   ```

   No Bash, após definir `SEED_USER` e ler `SEED_PASSWORD` por `read -rs`/`export`, execute `SEED_ALLOW_REMOTE=1 SEED_BASE_URL=https://SEU-SITE.vercel.app node scripts/dev-seed/seed.mjs`; depois `unset SEED_PASSWORD SEED_USER`. A senha fica temporariamente no ambiente do processo; use uma máquina confiável. Sem a opção explícita, somente loopback é aceito. Remoto exige HTTPS e credenciais explícitas. O seed não redireciona requisições; pode repetir após falha, consultando e reutilizando registros existentes. Não há rollback global. Veja [detalhes da carga](../scripts/dev-seed/README.md).

9. **Faça o roteiro com o dono.** Use a seção abaixo. Ao terminar, desative as contas de demonstração e suspenda/remova manualmente o ambiente se ele não for mais necessário; exporte antes os dados que deseja guardar.

## O que o dono vai ver

Em 10 a 15 minutos: entrar, abrir o painel e o Kanban com ordens em etapas variadas; filtrar uma ordem; abrir o detalhe, conferir prazo, histórico, peças e protocolo; criar uma ordem fictícia; mudar uma etapa e confirmar o histórico; conferir relatórios; sair e entrar com um perfil de consulta para validar as restrições. O roteiro completo e os critérios ficam em [conferência manual](ux/2026-11-07-roteiro-conferencia-manual.md). A carga traz sete ordens; itens já alterados manualmente podem permanecer diferentes numa segunda execução.

O primeiro acesso pode ser lento. Reinícios, redeploys e hibernação encerram sessões em memória: o dono terá de entrar novamente. Notificações internas continuam disponíveis; e-mails reais permanecem desligados.

## Ligar e-mail real depois

No Resend, valide um domínio de envio e seus registros DNS, gere uma chave de envio e escolha o remetente desse domínio. No painel do Render, defina `RESEND_API_KEY` como segredo, `MAIL_FROM` com esse endereço, `APP_BASE_URL` com a URL HTTPS estável da Vercel, `NOTIFICATIONS_EMAIL_PROVIDER=resend` e `NOTIFICATIONS_EMAIL_ENABLED=true`. Salve e aguarde o redeploy. `fake` ligado é recusado em `prod`.

Mantenha os tetos de 100/dia e 3.000/mês e intervalo de 500 ms, compatíveis com o [plano gratuito do Resend](https://resend.com/pricing), consultado em 14/11/2026. O calendário da aplicação usa São Paulo e pode diferir do provedor; os limites do provedor também se aplicam. Confira destinatários e a fila pendente antes de ativar: desligar o canal pausa a fila, que pode voltar a enviar depois. Teste uma notificação para endereço controlado e acompanhe a entrega. Não existe garantia de horário no Render Free, pois a fila não trabalha enquanto o serviço dorme. Mais detalhes em [notificações e e-mails](notificacoes-e-emails.md).

## Custos e limites aceitos

Condições consultadas em 14/11/2026; confirme as telas dos planos antes de aceitar cobrança. Este ambiente não tem compromisso de disponibilidade nem substitui produção.

| Serviço | Limite relevante |
| --- | --- |
| [Render Free](https://render.com/docs/free) | US$ 0 dentro das cotas; 512 MB, suspensão após 15 minutos sem tráfego, retorno pode levar cerca de um minuto. Há cotas de horas e build/tráfego; disco efêmero. Não guardar arquivos de negócio no disco do contêiner. |
| [Neon Free](https://neon.com/pricing) | US$ 0 dentro das cotas de armazenamento/compute. O compute [suspende por inatividade](https://neon.com/docs/introduction/scale-to-zero), adicionando latência ao retorno; não é apagamento do banco. |
| [Supabase Free](https://supabase.com/pricing) | US$ 0 dentro das cotas; banco de 500 MB, até dois projetos ativos e pausa após uma semana sem atividade. Retome pelo painel antes da demonstração. |
| [Vercel](https://vercel.com/docs/plans/hobby) | Hobby é gratuito para uso pessoal não comercial. Uma homologação empresarial deve usar plano compatível (ver [preços](https://vercel.com/pricing)); não presuma custo total zero para uso da empresa. |

Virginia é a região Render escolhida por proximidade geográfica do Brasil entre as [regiões disponíveis](https://render.com/docs/regions); latência real depende da rede. Prefira banco na mesma região ou próxima. Não há domínio próprio nem certificado próprio: Vercel e Render fornecem HTTPS e o JDBC exige TLS. Os dados ficam em provedores externos, possivelmente fora do Brasil; use apenas dados fictícios.

O backend continua publicamente acessível no Render, protegido pela autenticação/CSRF da aplicação. `SERVER_FORWARD_HEADERS_STRATEGY=framework` usa a propriedade nativa do Spring por ambiente, sem editar `application*.yml`. Ela interpreta cabeçalhos encaminhados, mas não autentica os proxies. Na publicação, confira que a cadeia Render/Vercel normaliza esses cabeçalhos e verifique esquema HTTPS/IP nos logs sem dados sensíveis. Não baseie autorização em IP encaminhado. O limite do nginx de 10 logins/minuto não existe nesta arquitetura; permanece o atraso de login da aplicação, por instância, com essa limitação aceita para testes. Para exposição mais ampla, avalie regras no provedor e confiança nos proxies antes.

## Se algo falhar

- **Build/boot do Render falha:** confira que a branch contém a migração PostgreSQL, os três `DB_*`, senha própria, TLS, conexão direta/session pooler e permissão para `unaccent`. Não copie logs com conexão/segredos completos.
- **Login retorna HTML ou 404:** confira o placeholder do rewrite, raiz `frontend` e o deploy que contém `vercel.json`.
- **Login funciona e escrita dá 403:** confira cookies e header CSRF pela Vercel, limpe cookies antigos e entre de novo. Não acesse o frontend usando o domínio do Render.
- **Seed falha por timeout:** aqueça o backend via `/health`, retome o banco pelo painel e repita uma vez disponível. O timeout por chamada é 30 segundos e a carga reaproveita registros já criados.
- **Site abre em branco após atualização:** confira a saída `browser`, erro de arquivo JS/CSS e revalidação do HTML; arquivos estáticos ausentes devem responder 404.

Nenhum login, teste de sessão entre os provedores ou envio real é comprovado apenas por build local. As verificações dos passos 4, 7 e 8 devem ser feitas pelo responsável após publicar.
