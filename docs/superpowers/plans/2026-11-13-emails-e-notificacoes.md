# E-mails e notificações — Plano de implementação

> **Para agentes:** usar `superpowers:executing-plans` na futura execução, tarefa por tarefa. Os passos usam checkboxes. Este pedido autoriza somente escrever os dois documentos; não executar este plano agora.

**Objetivo:** enviar e-mails internos por provedor configurável e aprimorar a central, com falhas isoladas do negócio.

**Arquitetura:** preservar distribuição pós-commit, regras por perfil e notificações por destinatário. Acrescentar fila persistente na notificação, worker com lease/recuo e adaptadores fake/Resend; depois atualizar as telas existentes.

**Stack:** Java 17, Spring Boot 3.2, MySQL/Flyway, JPA, java.net.http/Jackson; Angular 21, Vitest/happy-dom; H2 nos testes existentes e MySQL para prova de migração/collation.

**Spec:** [Projeto B — desenho](../specs/2026-11-13-emails-e-notificacoes-design.md). Ler ambos antes de executar. Referência de formato consultada: `2026-10-25-nav-8-campos-clientes.md`.

## Restrições globais

- Implementação futura somente após autorização; agora não criar código, migrações ou testes, não instalar dependências e não fazer commit/publicação.
- Backend primeiro (tarefas 1–7), frontend depois (8–10), documentação operacional e verificação ao final (11).
- Resend desligado por padrão: NOTIFICATIONS_EMAIL_ENABLED=false e NOTIFICATIONS_EMAIL_PROVIDER=fake. Sem SDK extra, chave real, domínio ou remetente real no repo.
- Migração incremental na próxima migração livre; conferir versões na branch de integração, inclusive eventual V3 de outro projeto. Nunca editar V1/V2 nem apagar volumes.
- Um e-mail por evento e usuário interno; email opcional, único insensível a caixa, até 254 caracteres. Sem inferência username@domain ou uso de clients.email.
- Máximo 5 tentativas por geração, recuos 1 min/5 min/30 min/2 h, lease 60 s, lote 50, poll 5 s. Corpo até 64 KiB, resposta HTTP até 16 KiB, conexão 3 s/requisição 10 s.
- Reutilizar notificacoes.regras e usuarios.gerir. Não adicionar permissões. Nunca falhar operação de RMA por envio; não expor PII/segredos em logs/erros.
- Preservar estilos, componentes compartilhados, foco, permissões efetivas e proteções de administrador. Não reintroduzir SLA nem criar produtores de eventos reservados.
- Em cada tarefa de comportamento: RED comprovado, alteração mínima, GREEN comprovado; registrar comandos e resultados reais. Commits por tarefa podem ser feitos na execução autorizada, com Conventional Commits, sem incluir alterações alheias.

## Foco da revisão

1. Troca de email/perfil/regra entre agendamento e tentativa: revalidar; payload diferente após tentativa não reutiliza chave (tarefas 4–5).
2. Crash depois de aceitação HTTP e claims concorrentes: chave estável, lease recuperável, finalização por token; não prometer exactly-once (tarefas 3–5).
3. Email-only e dados legados: não vazar na caixa/summary/read-all, nem enviar histórico automaticamente (tarefas 1, 4 e 6).
4. Concorrência de email único/teste/reenvio: constraint/trava no banco; 400/429/409 previsíveis, sem duplicação (tarefas 2 e 7).
5. Virada de dia e perda de permissão durante request: agrupamento correto, respostas antigas não restauram painel administrativo (tarefas 9–10).

## Mapa de arquivos

Caminhos Java abaixo usam `backend/src/main/java/br/com/navitasassist/`; testes usam `backend/src/test/java/br/com/navitasassist/`. Caminhos entre chaves enumeram arquivos, não diretórios novos. Classes propostas ficam junto ao domínio/serviços existentes; não criar módulo genérico de mensageria.

- Persistência: `notification/{Notification,NotificationEmailStatus,NotificationRule}.java`, novo `notification/NotificationEmailPreference.java`; repositórios correspondentes em `repository/`; migração incremental em `backend/src/main/resources/db/migration/`.
- Usuário: `user/{UserAccount,UserAccountRequest,UserAccountUpdateRequest,UserAccountResponse,CurrentUserResponse}.java`, `service/UserAccountService.java`, `repository/UserAccountRepository.java`, `controller/UserController.java` se necessário ao contrato.
- Provedores: novos `notification/email/{EmailProvider,EmailMessage,EmailSendResult,EmailDeliveryException,FakeEmailProvider,ResendEmailProvider}.java`; configuração em `config/NotificationProperties.java` e novo `config/NotificationEmailConfig.java`.
- Entrega: refatorar `service/NotificationEmailService.java`; novos `service/{NotificationEmailWorker,NotificationEmailQueue,NotificationEmailContentFactory}.java`; integrar `NotificationDispatcher.java` e `NotificationProcessor.java`.
- API: `notification/{NotificationPreferenceRequest,NotificationPreferenceResponse,NotificationRuleRequest,NotificationRuleResponse,NotificationFailureResponse}.java`, novos DTOs `NotificationEmailActionResponse.java` e `NotificationEmailStatusResponse.java`; serviços/controllers existentes e `config/SecurityConfig.java`.
- Angular: `frontend/src/app/core/{models.ts,utils/notification-ui.ts,services/notification.service.ts}`, telas existentes `pages/users/` e `pages/notifications/`, seus specs e testes de transporte.
- Operação: `backend/src/main/resources/application.yml`, `backend/pom.xml`, `.env.example`, `.env.prod.example`, `compose.yaml`, `compose.prod.yaml`, `README.md`.

## Tarefa 1 — Schema incremental e invariantes da fila

**Arquivos:** entidades/repositórios de persistência do mapa; nova `repository/NotificationEmailPreferenceRepository.java`; próxima migração livre `V<livre>__notification_email_delivery.sql` (placeholder documental, escolher número na execução).

**Testes:** ampliar `migration/DatabaseMigrationTest.java`; criar `migration/NotificationEmailMigrationTest.java` e `notification/NotificationEmailPersistenceTest.java`.

**Interfaces:** Notification ganha appVisible, emailTest e metadados de tentativa/lease/generation/hash definidos na spec; NotificationEmailStatus inclui PENDING. Regras ganham appEnabled; preferências de email usam tabela separada, sem alterar a semântica de NotificationMute.

- [ ] Escrever casos de upgrade V1+V2 com usuários e notificações legadas: email=null, appVisible=true, status antigo preservado, nenhuma entrega nova; múltiplos null aceitos, email duplicado por caixa rejeitado no banco, PENDING aceito no CHECK.
- [ ] Cobrir unicidade evento/destinatário preservada; linha emailTest admite event nulo, linha de negócio não; hash até 64 e metadados/índice de busca vencida presentes. Regras reservadas criadas desligadas apenas se ausentes, sem sobrescrever regras existentes; SLA não reaparece.
- [ ] Executar em `backend`: `mvn -B -ntp -Dtest=NotificationEmailMigrationTest,NotificationEmailPersistenceTest test`; confirmar RED por schema/comportamento ausente, não por ambiente quebrado.
- [ ] Conferir próxima versão na integração e implementar migração/entidades mínimas. Usar collation MySQL explicitamente insensível a caixa e sensível a acento para email, mais normalização em todos os escritores. Adaptar teste H2 sem mascarar SQL de produção; não editar migrations aplicadas.
- [ ] Repetir comando até GREEN. Aplicar V1+V2+nova migração em schema MySQL descartável, sem tocar volumes existentes, e verificar inserções null/caixa, upgrade e `flyway validate`; registrar versão exata e resultado. H2 verde sozinho não conclui esta prova.
- [ ] Revisar diff e registrar commit `feat(notificacoes): preparar persistencia de emails` na execução.

## Tarefa 2 — E-mail no CRUD de usuários

**Arquivos:** arquivos de usuário do mapa; `user/UserControllerIntegrationTest.java` e `user/UserAdminSafetyIntegrationTest.java`.

**Interfaces:** requests de POST/PUT recebem `String email`; respostas de usuário/sessão incluem email. `UserAccountService` normaliza trim/lowercase Locale.ROOT e converte branco em null; rejeita duplicidade com BusinessException/400. AssignableUserResponse permanece sem email.

- [ ] Adicionar testes nomeados para criar/editar/limpar email; aceitar 254 e rejeitar 255/inválido/CRLF; duplicidade com caixa diferente e colisão concorrente retornam 400 sem gravação parcial. Verificar chave email real em lista/individual/me/login e ausência nas opções de atribuíveis.
- [ ] Executar `mvn -B -ntp -Dtest=UserControllerIntegrationTest,UserAdminSafetyIntegrationTest test`; verificar RED das novas expectativas.
- [ ] Acrescentar campo, validações dos dois requests, mapeamento e persistência. Não incluir email nos toString dos requests. Capturar violação da constraint única de email com mensagem segura, sem converter outras falhas de banco indiscriminadamente.
- [ ] Repetir testes até GREEN; confirmar senha opcional na edição, anti-escalada, último administrador e revogação de sessão continuam conforme regras atuais. Mudança apenas de email não revoga sessão.
- [ ] Registrar commit `feat(usuarios): cadastrar email opcional`.

## Tarefa 3 — Contrato dos provedores e configuração segura

**Arquivos:** novos arquivos `notification/email/` e configuração do mapa; `application.yml`; novos testes `notification/{FakeEmailProviderTest,ResendEmailProviderTest,NotificationEmailPropertiesTest}.java`.

**Interfaces:** `EmailProvider.send(EmailMessage message, String idempotencyKey): EmailSendResult`; EmailMessage contém from/to/subject/text/html, um destinatário; EmailDeliveryException expõe code/retryable/retryAfter. Configuração seleciona exatamente um provedor. Fake expõe captura somente por método Java, limitada às últimas 100 mensagens.

- [ ] Escrever testes de configuração: desligado sem chave inicia; habilitado Resend sem chave/from/base falha sem revelar valores; provider desconhecido falha; fake ligado não exige chave nem usa rede. Validar URL e limites positivos.
- [ ] Criar testes do Resend com HttpServer local e chave sintética: JSON, bearer, idempotência, sucesso com ID; 400/401/403 permanentes; 429/5xx transitórios; Retry-After; timeout, redirect, corpo acima de 16 KiB, JSON inválido e 2xx sem ID. Conferir contrato oficial vigente do Resend ao implementar; manter dados de teste sintéticos.
- [ ] Rodar `mvn -B -ntp -Dtest=FakeEmailProviderTest,ResendEmailProviderTest,NotificationEmailPropertiesTest test` e observar RED.
- [ ] Implementar com HttpClient/Jackson sem SDK, timeout 3/10 s, HTTPS fixo em produção e endpoint de teste injetável sem variável pública. Fake guarda mensagens em memória sem logar conteúdo/endereço; retorno identifica simulação. Não inserir segredos reais em fixtures.
- [ ] Rodar novamente até GREEN; servidor local é a única conexão dos testes; confirmar captura limitada e nenhuma impressão de token/resposta bruta.
- [ ] Registrar commit `feat(notificacoes): adicionar provedores fake e resend`.

## Tarefa 4 — Modelos e distribuição por canal

**Arquivos:** `service/{NotificationEmailContentFactory,NotificationDispatcher,NotificationProcessor,NotificationVisibilityPolicy}.java`, DTOs de regras/preferências e seus serviços; novos `notification/NotificationEmailContentFactoryTest.java`, ampliar `notification/NotificationIntegrationTest.java` e `notification/NotificationEmailIntegrationTest.java`.

**Interfaces:** `NotificationEmailContentFactory.build(Notification notification, String recipientEmail): EmailMessage`; dispatcher persiste PENDING na mesma transação da notificação; processor não chama mais envio. appVisible é decisão de appEnabled; enabled continua interruptor geral. PUT de preferência preserva emailMuted omitido, e PUT de regra preserva appEnabled omitido.

- [ ] Escrever testes de criação/atribuição para app-only, email-only, ambos, nenhum e regra geral desligada; duplicação de eventKey e perfil+responsável resulta em no máximo uma linha/e-mail por usuário. Sem email não agenda; ausência do app e email não cria registro vazio.
- [ ] Cobrir muted legado, emailMuted isolado, userMutable=false ignorando preferências antigas, inativo/sem rma.ver, tipos unsupported rejeitados e regras existentes preservadas. Adiar/ler não muda a entrega.
- [ ] Testar templates em português, rota `/rmas?rma={id}`, teste sem RMA, assunto até 160 sem dados do cliente, HTML escapado, CRLF recusado e corpo acima de 64 KiB recusado antes do provider. Falhas de template devem produzir somente email FAILED e preservar app e RMA; renderização pertence ao worker após commit da distribuição, usando dados persistidos estáveis entre retries.
- [ ] Rodar `mvn -B -ntp -Dtest=NotificationIntegrationTest,NotificationEmailIntegrationTest,NotificationEmailContentFactoryTest test`; verificar RED.
- [ ] Implementar escolhas de canal e template mínimo da spec; preservar seleção por perfil, deduplicação, política de visibilidade e AFTER_COMMIT. Adaptar captura de erros sanitizados; jamais propagar falha para o negócio.
- [ ] Repetir até GREEN e provar que falha de agendamento/email deixa RMA confirmado e notificação app disponível. Registrar commit `feat(notificacoes): distribuir por canal e renderizar emails`.

## Tarefa 5 — Worker persistente, recuo e recuperação

**Arquivos:** `service/{NotificationEmailService,NotificationEmailWorker,NotificationEmailQueue}.java`, `repository/NotificationRepository.java`, configuração de agendamento/executor; novos `notification/{NotificationEmailWorkerTest,NotificationEmailConcurrencyIntegrationTest}.java`.

**Interfaces:** `NotificationEmailQueue.claimDue(Instant now, int limit)` devolve claims com notificationId/token; `NotificationEmailService.sendClaimed(Long id, String token)` faz snapshot em transação curta, envia fora dela e finaliza por token. Worker `poll()` usa Clock injetável e não bloqueia produtor. Atualizações condicionais verificam status, lease e token.

- [ ] Escrever testes com Clock: tentativa imediata e recuos exatos, 5 tentativas totais, 4xx imediato, timeout/429/5xx, Retry-After limitado a 24 h; SENT limpa erro/agenda e guarda provider ID; disabled não chama nem consome tentativa.
- [ ] Cobrir dois workers disputando a mesma linha, lease expirado recuperado após restart, resposta de token antigo ignorada e crash após aceitação usando mesma chave da geração. Executor ocupado não reivindica linhas para espera interna: provar que lote maior que capacidade não expira leases aguardando vaga, nem gera HTTP duplicado. Não usar sleeps de minutos.
- [ ] Cobrir revalidação de email/atividade/permissão/regra/preferência; payloadHash diferente depois de tentativa e provider alterado geram FAILED controlado, sem chamada nova. Preferência/regra revogada gera NOT_REQUESTED/motivo. Fake SENT antigo nunca é despachado ao ativar Resend.
- [ ] Executar `mvn -B -ntp -Dtest=NotificationEmailWorkerTest,NotificationEmailConcurrencyIntegrationTest,NotificationEmailIntegrationTest test`; observar RED.
- [ ] Implementar claims somente com vaga de execução imediata, lease 60 s e token, poll 5 s/lote máximo 50 e recuos da spec, executor limitado; rede fora da transação. Persistir estado e hash antes do envio, manter chave estável notificationId/generation; conclusão condicionada. Aplicar logs/códigos seguros e contadores sem PII na infraestrutura disponível.
- [ ] Repetir até GREEN e provar concorrência em MySQL para a atualização condicional; confirmar que falha ao persistir resultado pode ser recuperada e não altera RMA. Registrar commit `feat(notificacoes): processar fila com tentativas e lease`.

## Tarefa 6 — Consulta e ações pessoais consistentes

**Arquivos:** `controller/NotificationController.java`, `service/NotificationService.java`, `repository/NotificationRepository.java`, DTOs de preferência; ampliar `notification/NotificationIntegrationTest.java`.

**Interfaces:** `GET /api/notifications` mantém array/limite 100 e recebe eventType/severity opcionais além de unreadOnly/includeSnoozed. Query aplica filtros e visibilidade antes do limite. Summary/read/read-all/snooze só consideram appVisible e acesso vigente. GET `/preferences` e PUT `/preferences/{eventType}` mantêm isolamento por usuário.

- [ ] Escrever testes com mais de 100 linhas: filtros encontram evento/severidade fora do primeiro lote sem filtro; ordem createdAt/id estável; read-all alcança todas as app autorizadas inclusive adiadas fora do lote, independentemente dos filtros.
- [ ] Verificar email-only ausente de lista/summary e inacessível por read/snooze; outro usuário e permissão removida não obtêm notificação; filtros inválidos retornam 400. Preferências não oferecem tipos sem visibilidade.
- [ ] Executar `mvn -B -ntp -Dtest=NotificationIntegrationTest test`; observar RED.
- [ ] Alterar query/serviço preservando contrato do array e summary global. Não filtrar severidade/evento somente no navegador e não contar email-only no badge.
- [ ] Repetir até GREEN. Registrar commit `feat(notificacoes): filtrar caixa e preservar isolamento por canal`.

## Tarefa 7 — Administração de falhas, reenvio e teste para si

**Arquivos:** `controller/NotificationRuleController.java`, `service/{NotificationRuleService,NotificationEmailQueue}.java`, DTOs de ação/status/falhas; `config/SecurityConfig.java` para confirmar matchers; ampliar `access/PermissionEquivalenceIntegrationTest.java`; novo `notification/NotificationEmailAdminIntegrationTest.java`.

**Interfaces:** GET failures preserva sources com limite global 50 e metadados da spec; GET email-status devolve enabled/provider/simulated; POST emails/{id}/retry e emails/test sob `/api/notification-rules` devolvem 202/NotificationEmailActionResponse. Falhas incluem emailTest:boolean; a UI usa esse campo para mostrar “Teste”, sem alterar NotificationEventType. Teste sem payload destinatário; retry recebe somente ID.

- [ ] Testar FAILED→PENDING com nova geração/tentativas zeradas e auditoria; cliques concorrentes retornam uma aceitação e um 409; SENT/PENDING/NOT_REQUESTED dão 409; inelegível 400, inexistente 404; EVENT sem ação de reenvio.
- [ ] Testar teste para usuário da sessão, sem email/canal desligado 400; um por 60 s com concorrência protegida por lock da conta, excedente 429. Registro emailTest sem event/rma e invisível ao app; falha aparece no painel sem quebrar mapeamento de event nulo.
- [ ] Cobrir 401/403 e CSRF, permissão por perfil e extra, revogação efetiva, DTO sem chave/endereço completo/erro bruto. Teste não aceita userId/To externos e não depende da regra RMA_CREATED ativa.
- [ ] Rodar `mvn -B -ntp -Dtest=NotificationEmailAdminIntegrationTest,PermissionEquivalenceIntegrationTest test`; observar RED.
- [ ] Implementar endpoints/DTOs e transições condicionais; usar notificacoes.regras existente. Manter Permission.java/core/permissions.ts/seeds sem novo código de permissão; se a implementação exigir nova permissão, revisar desenho antes e atualizar todos esses pontos junto ao README.
- [ ] Repetir até GREEN e registrar commit `feat(notificacoes): administrar falhas e testar envio`.

## Tarefa 8 — Contratos Angular e campo de e-mail em Usuários

**Arquivos:** `frontend/src/app/core/models.ts`, `frontend/src/app/core/services/notification.service.{ts,spec.ts}`, `frontend/src/app/pages/users/users.component.{ts,html,spec.ts}`, testes de transporte existentes de usuários/autenticação e fixtures afetadas.

**Interfaces:** tipos espelham DTOs das tarefas 2/6/7; NotificationService acrescenta filtros, retryEmail(id), sendTestEmail() e emailStatus(); updatePreference admite emailMuted sem quebrar chamadas antigas. Usuários sempre envia email string/null em POST/PUT.

- [ ] Adicionar testes HttpTestingController das URLs/verbos/parâmetros/DTOs, sem destinatário em teste/retry; email nos contratos de usuário/me e null na limpeza. Cobrir email opcional, inválido, 254/255 e erro de duplicidade do servidor no formulário.
- [ ] Executar em `frontend`: `npm.cmd test -- --watch=false`; confirmar RED das novas expectativas.
- [ ] Acrescentar campo opcional tipo email no modal de Usuários, validação correspondente ao backend, reset/edição/payload e coluna curta com fallback “—”. Preservar senha, perfis, paginação e estados pendentes existentes; não adicionar painel novo.
- [ ] Atualizar serviço/tipos/fixtures, sem expor email em tipos de opções de atribuíveis. Repetir suíte até GREEN. Registrar commit `feat(usuarios): editar email e alinhar contratos de notificacoes`.

## Tarefa 9 — Caixa de entrada e preferências

**Arquivos:** `frontend/src/app/pages/notifications/notifications.component.{ts,html}`, `notifications.component.inbox.spec.ts`, `notifications.component.preferences.spec.ts`, `frontend/src/app/core/utils/notification-ui.ts` e respectivos specs.

**Interfaces:** filtros chamam API da tarefa 6; agrupamento é apresentação local com ClockService; aba Preferências persiste muted/emailMuted. Manter summary global sem inferir total da lista de 100.

- [ ] Escrever testes de filtros/limpar, parâmetro de evento/severidade, ordenação e grupos Hoje/Ontem/data na virada local, inclusive mudança de dia sem reload e lista limitada; respostas antigas não substituem resultados do filtro atual.
- [ ] Cobrir marcar todas incluindo adiadas/fora da lista, refresh do badge, abrir/marcar/adiar, estado vazio versus erro/loading e limite 100. Testar emailMuted isolado, obrigatório, global desligado e ausência de email sem apagar a preferência salva.
- [ ] Executar `npm.cmd test -- --watch=false`; observar RED.
- [ ] Ajustar tela existente: app-page-header, barra compacta com app-custom-select, grupos com separadores e ações rápidas. Usar componentes/estilos/tokens atuais, sem caixas dentro de caixas nem textos longos. Preservar ClockService, navegação interna segura e estados de resumo desconhecido.
- [ ] Repetir suíte até GREEN; conferir foco/teclado e layout móvel em inspeção visual na execução, sem criar artefatos permanentes desnecessários. Registrar commit `feat(notificacoes): organizar caixa e preferencias por canal`.

## Tarefa 10 — Regras e painel administrativo

**Arquivos:** `frontend/src/app/pages/notifications/notifications.component.{ts,html}`, `notifications.component.rules.spec.ts`, `notifications.component.spec.ts` e novos specs de falhas se necessário.

**Interfaces:** usa os métodos Angular da tarefa 8; abas continuam inbox/preferences/rules. Teste/retry são agendamento, não confirmação de entrega. Regra distingue enabled/appEnabled/emailEnabled/supported.

- [ ] Escrever testes de toggles evento/app/email, perfis e responsável, unsupported desabilitado e validação da API; modal mantém foco e evita duplo submit.
- [ ] Cobrir lista de falhas com notificationId, tentativas, erro seguro, retry só EMAIL elegível; 202 atualiza linha, 409 recarrega estado, falha conserva ação possível. Teste envia corpo vazio, feedback “Teste agendado”/“Simulação agendada”, 429 e ausência de email tratados sem prometer entrega.
- [ ] Cobrir selo desligado/simulado, perda de notificacoes.regras durante request, respostas tardias não restaurando dados administrativos; acesso por teclado e retorno de foco após fechar modal.
- [ ] Executar `npm.cmd test -- --watch=false`; observar RED.
- [ ] Atualizar tabela/modal atuais; painel de falhas compacto na mesma aba com seção irmã de EVENT sem retry e botão de teste para si. Loading por linha e feedback curto, sem polling global novo ou explicação de infraestrutura ao usuário.
- [ ] Repetir até GREEN, inspecionar desktop/móvel e registrar commit `feat(notificacoes): aprimorar regras e painel de falhas`.

## Tarefa 11 — Configuração operacional, regressão e revisão final

**Arquivos:** arquivos de operação do mapa; atualizar `notification/NotificationEmailIntegrationTest.java`, substituir `notification/NotificationSmtpTimeoutIntegrationTest.java` por cobertura HTTP já criada e remover somente suporte SMTP sem consumidor; README com configuração, padrões, preferências, status, limitações e procedimentos de reenvio/teste.

- [ ] Antes de remover SMTP, localizar todos os consumidores de JavaMailSender/starter-mail/variáveis SMTP; se houver consumidor real alheio ao projeto, preservar a dependência necessária e retirar apenas o caminho antigo das notificações. Não manter fallback username@domain.
- [ ] Incluir novas variáveis nos exemplos e environments dos dois Compose sem valores reais; remover configuração obsoleta conforme inventário. README deve explicar fake em dev, chave obrigatória só quando Resend ligado, MAIL_FROM/APP_BASE_URL, sem email não envia, estados e SENT como aceitação/simulação; documentar janela pós-commit e risco de duplicação.
- [ ] Verificar que testes de configuração e de HTTP já cobrem o substituto antes de excluir testes SMTP. Atualizar testes de infraestrutura que ainda esperem configurações antigas; seguir RED/GREEN se houver alteração de comportamento nessa etapa.
- [ ] Em `backend`, executar `mvn -B -ntp verify`; exigir saída 0, suites sem falhas e compilação aprovada. Repetir a prova de upgrade/collation/claims em MySQL se as tarefas anteriores alterarem SQL depois da primeira prova. Registrar separadamente limites de H2.
- [ ] Em `frontend`, executar sequencialmente `npm.cmd test -- --watch=false` e `npm.cmd run build`; exigir saída 0. Não usar `test:sla`, que não existe no package.json atual e não se aplica ao projeto.
- [ ] Na raiz, executar `docker compose --env-file .env.example config --quiet` e `docker compose --env-file .env.prod.example -f compose.prod.yaml config --quiet`; não subir stack nem remover volumes. Fazer smoke autorizado somente com fake: cadastrar email, habilitar regra/canal, gerar RMA, observar captura/status e simular falha/retry/teste sem rede externa.
- [ ] Revisar segurança/contratos, logs/erros sem PII, HTML/CRLF/tamanhos e matchers de autorização. Executar `git diff --check` e revisar lista de arquivos; documentar resultados reais, pendências e riscos. Não alegar envio real nem entrega postal.
- [ ] Registrar commit de configuração/documentação quando a execução estiver autorizada. Publicação de PR, Jira, push, merge e deploy não são requisitos nem autorização deste pedido documental.

## Critério de conclusão da implementação futura

Todas as tarefas verificadas, suites/build aprovados, prova MySQL registrada e fluxo fake validado sem chamada externa. Resend pode permanecer desligado sem chave/domínio reais. Não há dependência de credencial para testes automatizados. O implementador entrega evidências, não suposições, e lista qualquer validação que o ambiente não permitiu concluir.

## Estado deste planejamento

Baseado no código local consultado, inclusive V1/V2 e planos existentes. Os checkboxes estão intencionalmente abertos: nenhuma implementação ou execução de testes foi feita nesta tarefa. A criação destes documentos não autoriza executar o plano.

