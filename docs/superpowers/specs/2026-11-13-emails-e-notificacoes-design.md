# Etapa 8 — Projeto B: e-mails e notificações

## Objetivo e limites

Entregar e-mails transacionais para usuários internos e melhorar a central existente, preservando o fluxo de OS. Este documento e o plano são propostas de implementação; sua elaboração não altera código, migrações ou testes. Decisões do produto fornecidas na tarefa são vinculantes. Valores operacionais adicionais abaixo são recomendações deste desenho.

## Estado real consultado

- `notification/NotificationEventType.java` tem oito tipos, mas apenas `RMA_CREATED` e `RMA_ASSIGNED` retornam `isSupported() = true`. Os demais são extensões sem produtores suportados; não prometer entrega para eles.
- `NotificationProcessor` recebe eventos `AFTER_COMMIT`, usa executor dedicado (2/4 threads, fila 500), registra rejeições e isola falhas. `NotificationEventStore` deduplica `eventKey`; `NotificationDispatcher` grava por destinatário, com unicidade `(event_id, recipient_id)`.
- `NotificationVisibilityPolicy` exige usuário ativo e `rma.ver` ao distribuir; aplica visibilidade novamente na consulta. Regras usam perfis de acesso e, opcionalmente, responsável pela OS; destinatários são deduplicados.
- `NotificationEmailService` usa `JavaMailSender`, deriva `username@domain`, envia somente texto e grava `NOT_REQUESTED/SENT/FAILED` na notificação. Não há fila persistente, recuo ou endereço individual. Esse caminho será substituído, sem manter SMTP como segundo mecanismo.
- `NotificationMute` silencia um tipo para o usuário quando `userMutable`; `snoozedUntil` adia somente a exibição de uma notificação. Não são preferências independentes por canal.
- V1 cria tabelas, constraints e seeds; V2 (`V2__rma_due_date_and_remove_stage_sla.sql`) acrescenta data limite e remove `SLA_WARNING/SLA_OVERDUE`. Não reintroduzir SLA ou alertas de prazo. Após V2 há somente as duas regras ativas: criação para Administrador/Atendimento e atribuição para o responsável.
- `user_accounts` não tem e-mail. CRUD usa `UserController`, `UserAccountService`, requests distintos de criação/edição e respostas de usuário/sessão. Não usar `clients.email`.
- A central Angular concentra Caixa de entrada, Preferências e Regras em `pages/notifications/notifications.component.{ts,html}`. Já há filtros de não lidas/adiadas, marcar todas, ações de leitura/adiamento, editor de regras por perfil e lista de falhas sem reenvio. Usa componentes compartilhados e estados de carregamento/erro próprios.
- `SecurityConfig` protege `/api/notification-rules/**` com `notificacoes.regras`; notificações pessoais exigem autenticação. `Permission.java`, `core/permissions.ts` e README concordam. README documenta permissões, seeds e remoção de SLA; falta consolidar a configuração do novo canal.

## Abordagem

Reaproveitar notificações por destinatário e suas colunas de status como fila persistente de e-mail. É a opção mais curta que preserva deduplicação e histórico. Uma tabela de entregas separada seria útil para múltiplos canais/provedores simultâneos, fora do escopo. Somente executor em memória perderia tentativas no reinício. Não adicionar broker, SDK Resend ou infraestrutura externa.

A notificação continua sendo o registro interno mesmo com canal app desligado: adicionar `appVisible` para que esse registro de entrega não apareça na caixa, resumo ou ações pessoais. `recipientCount` continua contando destinatários únicos que receberam ao menos um canal.

## Eventos e padrões

`enabled` continua sendo o interruptor geral do evento; adicionar `appEnabled`, mantendo `emailEnabled` independente. Evento geral desligado impede ambos. Preservar escolhas já salvas; os padrões não são uma atualização em massa das regras existentes. Canal e-mail permanece desligado em todas as regras existentes até ativação administrativa explícita.

| Tipo real | Suporte hoje | Evento/app padrão | E-mail padrão | Destinatários padrão | Severidade / mutável |
| --- | --- | --- | --- | --- | --- |
| RMA_CREATED | Sim | Ligado/ligado | Desligado | Administrador e Atendimento | INFO / sim |
| RMA_ASSIGNED | Sim | Ligado/ligado | Desligado | Responsável | INFO / não |
| RMA_BLOCKED | Não | Desligado/desligado | Desligado | Nenhum | WARNING / sim |
| WIP_LIMIT_EXCEEDED | Não | Desligado/desligado | Desligado | Nenhum | WARNING / sim |
| PART_PENDING | Não | Desligado/desligado | Desligado | Nenhum | WARNING / sim |
| INTERNAL_APPROVAL_REQUIRED | Não | Desligado/desligado | Desligado | Nenhum | WARNING / sim |
| TEST_FAILED | Não | Desligado/desligado | Desligado | Nenhum | WARNING / sim |
| RECURRENCE_DETECTED | Não | Desligado/desligado | Desligado | Nenhum | WARNING / sim |

Criar regras ausentes desses seis tipos como desligadas, somente se ainda não existirem. Resposta inclui `supported`; editor mostra “Indisponível” e backend recusa ativação de tipo sem suporte com 400. Implementar seus produtores pertence aos respectivos projetos futuros, mesmo que já existam módulos de peças/protocolos.

## Modelo de dados e preferências

Aplicar **próxima migração livre**, escolhida após conferir a branch de integração; pode haver V3 de outro projeto. Nunca editar V1/V2 nem recriar volumes.

- `user_accounts.email VARCHAR(254) NULL`, constraint única explícita. Normalizar trim + minúsculas com `Locale.ROOT`; branco vira null. Validar endereço simples, tamanho máximo 254 e recusar CR/LF/caracteres de controle. Índice único com comparação insensível a caixa no MySQL, explicitamente sem depender da collation do banco; escolher collation que preserve diferenças de acentos e validar no MySQL. Todos os escritores normalizam; múltiplos null permitidos. H2 não substitui a prova de collation no MySQL. Duplicidade, inclusive concorrente, retorna 400 “E-mail já cadastrado.”, sem alteração parcial. Não inferir endereço nem preencher contas antigas.
- Acrescentar `email` aos dois requests, `UserAccountResponse`, `CurrentUserResponse` e tipos TypeScript correspondentes. PUT com email ausente/null/branco limpa o endereço, coerente com substituição completa; frontend sempre envia o campo. Não expor email em `AssignableUserResponse`. Preservar senha opcional na edição e proteções de administrador/anti-escalada.
- `notification_rules.app_enabled` não nulo, inicializado true para preservar comportamento existente. `notifications.app_visible` não nulo, true no legado. Consultas, resumo e leitura em massa consideram somente appVisible e visibilidade autorizada.
- A presença de uma linha em `notification_mutes` continua significando `muted=true`. Para representar emailMuted independentemente, criar `notification_email_preferences` com `(user_id,event_type)` único, `email_muted` e timestamps, e manter `notification_mutes` intacta: esta é a modelagem escolhida; não adicionar a coluna redundante em mutes.
- O `muted` legado suprime ambos os canais quando a regra permite; nova preferência `emailMuted` suprime somente e-mail. `userMutable=false` impede ambos os silenciamentos e ignora preferências antigas. Sem preferência: emailMuted=false. Adiar/ler no app não cancela e-mail e não dispara novo envio.
- Acrescentar `PENDING` ao enum e ao CHECK de `email_status`, conservando `NOT_REQUESTED/SENT/FAILED`. Na mesma linha: `email_attempts` (0), `email_next_attempt_at`, `email_sent_at`, `email_provider` (fake/resend), `email_provider_id` (até 200), `email_lease_until`, `email_claim_token` (36), `email_generation` (0), `email_last_attempt_at` e `email_skip_reason` (código até 40). `email_error` existente guarda apenas código/mensagem sanitizada até 500. Índice em status/próxima tentativa; não armazenar chave, payload HTTP ou corpo completo.
- NOT_REQUESTED significa inelegível/desligado, com motivo sem PII (por exemplo NO_EMAIL, CHANNEL_DISABLED, MUTED, ACCESS_REVOKED). Só elegíveis recebem PENDING. Linhas legadas não serão reenviadas nem convertidas para PENDING. Para email-only sem elegibilidade, não criar registro vazio sem nenhum canal.
- E-mail de teste usa a mesma fila: permitir `event_id` nulo somente para linha com novo `email_test=true`, rma nulo, appVisible=false e destinatário obrigatório; eventos de negócio mantêm FK e invariantes atuais. `eventType` fica RMA_CREATED como discriminador técnico legado, mas DTO do painel inclui `emailTest: boolean` e a interface exibe “Teste” quando true, sem acrescentar TEST ao enum; template de teste não afirma criação de OS. Adaptar acessos a event nulo; teste não conta como evento de negócio.

## Distribuição e envio

1. Preservar processamento após commit e seleção atual de perfis/responsável, atividade e `rma.ver`. Aplicar interruptores, preferências e endereço antes de agendar. Um e-mail por ocorrência e usuário, nunca lista de To/CC/BCC. Mesmo evento republicado não cria outra entrega.
2. Na transação do dispatcher, gravar appVisible e PENDING de forma atômica. O processor deixa de enviar diretamente. Worker agendado considera até 50 linhas vencidas a cada 5 s, mas reivindica somente a capacidade de execução imediata disponível, sem aguardar em fila interna depois do claim. Usa atualização condicional com token e lease de 60 s, em transação curta; novas vagas podem aplicar o restante do lote no mesmo ciclo. Não manter lock/transação durante HTTP; conclusão exige o mesmo token. Lease expirado pode ser recuperado após reinício; executor limitado, sem CallerRunsPolicy.
3. Antes de cada envio e reenvio, reler usuário ativo, e-mail atual, permissão, regra e preferências. Desligamento global apenas pausa PENDING sem aplicar tentativas; revogação individual ou desligamento da regra/canal cancela PENDING para NOT_REQUESTED com motivo; teste exige novamente notificacoes.regras, mas dispensa regras de OS e preferências. Nunca enviar a endereço antigo após troca detectada antes da chamada. Usar endereço atual sem snapshot duradouro; há uma janela inevitável entre leitura e HTTP.
4. Máximo 5 tentativas totais por geração: imediata, +1 min, +5 min, +30 min, +2 h. Tempo de rede/transitório, 429 e 5xx mantêm PENDING até esgotar; 4xx permanentes falham imediatamente. Retry-After válido pode aumentar o atraso, limitado a 24 h. Falha final vira FAILED; sucesso vira SENT, limpa erro e agenda, registra ID do provedor. Resposta 2xx sem ID válido é erro transitório.
5. `EmailProvider.send(EmailMessage message, String idempotencyKey)` retorna `EmailSendResult(providerMessageId)` ou falha tipada retryable/retryAfter/code. `FakeEmailProvider` guarda as últimas 100 mensagens em memória para inspeção em dev/testes; logs só IDs/códigos, sem destinatário/corpo. Não disponibilizar endpoint público de captura. Captura implica SENT com provider=fake e deve aparecer como “Simulado”, sem alegar entrega real.
6. `ResendEmailProvider` usa `java.net.http.HttpClient`, JSON via Jackson e HTTPS fixo para o serviço Resend; URL substituível somente por injeção nos testes. Sem redirects; timeout conexão 3 s e requisição 10 s; resposta limitada a 16 KiB. Bearer token somente no cabeçalho de autenticação; usar chave de idempotência estável por notificationId/generation e as mesmas informações de envio entre retries. Se endereço/conteúdo mudar após primeira tentativa, encerrar geração e exigir reenvio explícito, para não reutilizar chave com payload diferente. Guardar hash do payload (sem conteúdo) na linha como `email_payload_hash` (64).
7. Reenvio só de FAILED, atualização condicional para PENDING, tentativas zeradas, generation incrementada e auditoria do ator. SENT/PENDING/NOT_REQUESTED não podem reenviar (409); cliques concorrentes geram uma única transição. Validar elegibilidade antes, com 400 se não apto. Não reenviar o evento inteiro nem criar nova notificação app.

O registro persistente garante recuperação **depois** da distribuição; o intervalo entre commit da OS e executor atual ainda pode perder eventos em queda do processo. Não prometer exactly-once ou outbox transacional do negócio neste projeto. Idempotência externa tem janela finita: timeout após aceitação pode duplicar e-mail fora dessa janela; registrar risco e evitar retry ilimitado.

## Modelos e segurança

Assunto `[Navitas Assist] {rótulo do evento} — {código da OS}`, máximo 160 caracteres, sem nome de cliente. Corpo em português, HTML simples e texto: evento, código, data/hora e “Abrir OS”; link `APP_BASE_URL` + `/rmas?rma={id}` conforme `NotificationContentFactory`. Não copiar automaticamente o message atual, que inclui cliente/produto/ator. Teste: assunto `[Navitas Assist] E-mail de teste`, texto “Este é um e-mail de teste do Navitas Assist.” e link “Abrir Navitas Assist”, sem OS fictício.

Escape de todos os valores HTML e atributos; proibir CR/LF no assunto/endereço/remetente, rejeitar múltiplos destinatários, nunca aceitar HTML ou URL enviada pelo navegador. Limitar mensagem renderizada (texto + HTML em UTF-8) a 64 KiB, falhando com código CONTENT_TOO_LARGE sem chamada externa. Renderizar no worker após a persistência da notificação: falha de renderização, CRLF ou tamanho marca somente a entrega como FAILED, sem remover/falhar a notificação app nem a transação de distribuição. Usar dados estáveis da ocorrência e a data persistida, nunca horário corrente na renderização de retries, para manter o hash do payload. URL base absoluta, sem userinfo/query/fragmento, HTTPS para Resend; permitir HTTP local com fake. Caminho da OS é construído pelo servidor, sem redirecionamento externo. Link requer sessão e as permissões normais da OS; não contém token de acesso.

Autorização: manter notificações pessoais autenticadas e escopadas ao próprio usuário; ocultar appVisible=false. Regras, falhas, reenviar e teste usam `notificacoes.regras` (incluindo concessão extra por usuário). Não criar permissão nova. Guardar CSRF nas mutações e padrão 401/403 do projeto; teste não aceita endereço ou userId no corpo. E-mail do usuário só é alterado por `usuarios.gerir`, com as proteções existentes. Se o catálogo mudar futuramente, atualizar em conjunto Permission.java, core/permissions.ts, PermissionEquivalenceIntegrationTest, seeds incrementais e README.

## API proposta

| Operação | Contrato |
| --- | --- |
| POST/PUT `/api/users` e `/api/users/{id}` | Acrescentar email anulável aos contratos existentes; respostas incluem email; validação 400 |
| GET `/api/auth/me` e login | email do usuário atual, sem alterar autoridades |
| GET `/api/notifications` | Manter array, limite 100 e filtros atuais; adicionar eventType e severity opcionais no servidor antes do limite; ordenar createdAt/id desc |
| POST `/api/notifications/read-all` | 204; todas as app visíveis autorizadas do usuário, inclusive adiadas, independentemente dos filtros/limite da tela |
| GET `/api/notifications/preferences`; PUT `/api/notifications/preferences/{eventType}` | Preservar GET da coleção `/preferences`; PUT recebe muted e emailMuted (este opcional, preserva valor quando ausente); resposta inclui emailMuted e disponibilidade do canal/endereço como booleanos |
| GET/PUT `/api/notification-rules[/{eventType}]` | Acrescentar appEnabled e supported; PUT appEnabled opcional preserva valor se omitido; demais campos atuais mantidos |
| GET `/api/notification-rules/failures` | Preservar EVENT e EMAIL; acrescentar notificationId anulável, attempts, provider, status, emailTest, lastAttemptAt, nextAttemptAt e retryAllowed; erros sanitizados, recipient como username, sem endereço completo; limite global 50 mais recentes |
| POST `/api/notification-rules/emails/{notificationId}/retry` | 202 com `{notificationId,status,provider}`; 404 desconhecido, 409 estado incompatível, 400 inelegível; somente EMAIL |
| POST `/api/notification-rules/emails/test` | Corpo vazio; 202 com mesmo DTO, 400 sem email/canal desligado; limite persistente de 1 teste por usuário por 60 s (429); mesma trava por usuário para concorrência |
| GET `/api/notification-rules/email-status` | `{enabled,provider,simulated}` sem configuração sensível; permite indicar desligado/simulado no painel |

Falhas EVENT não têm reenvio neste projeto. Evitar alteração do envelope da caixa; filtros não prometem acesso a histórico além de 100 resultados.

## Configuração e operação

| Variável | Padrão / regra |
| --- | --- |
| NOTIFICATIONS_EMAIL_ENABLED | false; desligado não chama provedor nem consome tentativas pendentes |
| NOTIFICATIONS_EMAIL_PROVIDER | fake; somente fake ou resend, inválido impede inicialização |
| RESEND_API_KEY | vazio, sem segredo padrão; obrigatório quando enabled=true e provider=resend |
| MAIL_FROM | vazio, obrigatório com canal ligado; endereço simples válido, sem fallback real |
| APP_BASE_URL | vazio, obrigatório com canal ligado; validação descrita acima |
| NOTIFICATIONS_EMAIL_POLL_MS | 5000, positivo |
| NOTIFICATIONS_EMAIL_BATCH_SIZE | 50, intervalo 1–100 |

Recuos, limite 5, lease 60 s e timeouts ficam em propriedades tipadas com os valores acima, substituíveis nos testes; evitar multiplicar variáveis públicas nesta primeira versão. Configuração inválida falha claramente no startup sem imprimir valores sensíveis; Resend desabilitado não exige chave. Dev habilita explicitamente fake com remetente sintético e URL local; nunca contata rede. Revalidar filas existentes ao reativar; não converter NOT_REQUESTED em pendentes retroativos. Não trocar automaticamente provider de uma entrega já tentada: mudança exige falha controlada PROVIDER_CHANGED e reenvio explícito, evitando enviar capturas fake ao vivo.

Atualizar application.yml, exemplos de ambiente, compose.yaml e compose.prod.yaml, README de configuração/notificações/contas. Retirar referências a username@domain, NOTIFICATIONS_EMAIL_DOMAIN, NOTIFICATIONS_EMAIL_FROM e SMTP se não houver outro aplicador, incluindo dependência starter-mail e testes SMTP obsoletos. Chave/domínio/remetente reais serão definidos depois pelo dono do produto no ambiente; nenhuma validação com rede real faz parte desta entrega.

Observabilidade: logs estruturados por notificationId/eventId, provider, tentativa, duração e código; nunca corpo, endereço, token, headers ou resposta bruta. Contadores de agendados, enviados/simulados, retries, falhas, cancelados; profundidade/idade do PENDING e latência via infraestrutura já existente, sem criar stack de métricas. Painel mostra falhas sanitizadas e tentativas; alerta operacional recomendado se houver FAILED ou pendente vencido há mais de 10 min. Auditar alteração de regra, reenvio e teste com ID de ator/registro, sem payload de e-mail. Fake tem retenção limitada e é limpo no reinício; registros persistentes seguem política atual, sem job novo de exclusão.

## Interface enxuta

Preservar rota e abas atuais. `app-page-header` com título “Notificações”, contagem apenas quando summary válido, ação “Marcar todas como lidas”. Barra compacta: Não lidas, incluir adiadas, Evento e Severidade com `app-custom-select`; limpar filtros restaura todos. Filtros aplicados no servidor; agrupar os resultados por dia no fuso local (Hoje, Ontem, data), recalculando na virada com ClockService. Lista plana com separadores, indicador de não lida, título/link, horário, severidade e ações Abrir, Marcar como lida, Adiar. Preservar indicação do limite de 100; sem cartões aninhados.

Preferências: uma linha por evento, controles “Silenciar” e “E-mail”, respeitando userMutable; estado curto “Sem e-mail cadastrado”, “Desligado” ou “Obrigatório” conforme precedência, sem prometer entrega. Falta de endereço não remove a preferência salva. Regras: tabela Evento, Ativa, App, E-mail, Destinatários, Severidade; edição no modal existente com perfis, responsável e mutabilidade. Não duplicar editor/tela. Mostrar indisponibilidade dos tipos não suportados.

No painel administrativo da aba Regras: seção “Falhas de e-mail” com linhas compactas de data, OS, usuário, tentativas, erro e “Reenviar”; preservar falhas de processamento em seção irmã compacta, sem ação. Cabeçalho com “Enviar e-mail de teste” para si e selo “Desligado”/“Simulado” quando aplicável. Feedback “Teste agendado” ou “Simulação agendada”, nunca “Entregue”. Atualização manual após ação; sem novo polling global. Erro inline curto, loading por linha, prevenção de clique duplo, foco/teclado e layout móvel mantidos. Usuários: campo E-mail opcional no modal atual e coluna compacta com “—” para ausência, sem novo painel explicativo.

## Testes e critérios de aceite

- TDD durante implementação: teste novo falha pelo comportamento ausente, alteração mínima e repetição verde. Nenhum teste é criado/executado como parte desta tarefa documental.
- Migração: base V1+V2 e upgrade com dados, próxima versão livre, email null repetido, único insensível a caixa, CHECK aceita PENDING e legado preservado. Executar prova no MySQL além de H2; não alegar equivalência por H2.
- Usuários: criação/edição/limpeza, 254/255, inválido/CRLF, colisão por caixa e concorrente, sessão/contratos, não exposição em opções; proteções de permissões/admin continuam.
- Fake e integração: regras app-only/email-only/ambos/desligadas, perfil+responsável sem duplicação, usuário sem email, inativo/sem rma.ver, preferências mutáveis/obrigatórias, app invisível fora da caixa/summary/read-all, regra alterada antes do envio; falha de email nunca desfaz OS nem app.
- Worker com Clock controlado, sem sleeps longos: agenda exata, limite de tentativas, concorrência de claims/retries, restart/lease, token vencido não finaliza, capacidade ocupada não gera claim que expire esperando executor, alteração de payload/provider, desligamento global, falha HTTP e persistência após aceitação.
- Resend com servidor HTTP local falso (`com.sun.net.httpserver.HttpServer`), chave sintética e endpoint injetado: método/JSON/HTML/texto/To único, idempotência e bearer, 2xx, 400/401/403, 429/Retry-After, 5xx, timeout, resposta grande/malformada, redirect recusado. Nenhuma rede externa ou conta Resend real. Conferir contrato oficial vigente na execução antes de fechar o adaptador.
- API: 401/403, CSRF, IDs de terceiros, teste só para si com limite concorrente, retry de FAILED apenas, erros sem PII; PermissionEquivalenceIntegrationTest inclui novas rotas sem nova permissão.
- Angular: requests/estados de filtro, agrupamento/virada de dia, leitura em massa inclusive fora do limite, ações, preferências, modal de canais/perfis, erro de reenvio/teste, perda de permissão, navegação por teclado/foco e formulário de usuário. Suítes existentes preservadas.

## Riscos e perguntas abertas (com recomendação)

- Queda entre negócio e listener: janela atual permanece; recomendar outbox transacional do evento em projeto separado se entrega garantida desde o commit virar requisito.
- Resend aceitou e processo caiu: idempotência reduz duplicação, mas não elimina fora da janela do serviço. Recomendar não reenviar SENT e auditar reenvio manual; webhooks de entrega/bounce ficam fora. SENT significa aceito pela API, não leitura/entrega na caixa postal.
- Domínio verificado, MAIL_FROM e RESEND_API_KEY reais: pendentes do produto/operação; recomendar manter desligado até configurar domínio/remetente no Resend e ambiente. Não bloqueia desenvolvimento com fake.
- Retenção do histórico e captura em dev: recomendar política existente para banco e 100 capturas em memória; política formal de retenção é decisão operacional posterior.
- Preferência obrigatória: recomendar manter semântica atual de userMutable para ambos os canais; regra de atribuição é obrigatória quando canal habilitado. Não ampliar silenciosamente liberdade do usuário.
- Email de teste sem evento real: recomendação de linha interna email_test evita uma segunda fila; testar todos os aplicadores do event antes de torná-lo anulável.

Fora do escopo: destinatários externos/clientes finais, campanhas, resumo diário, anexos, editor de templates, SMTP paralelo, novos produtores dos seis tipos reservados, SLA/prazo, push/SMS, verificação de posse do endereço, recuperação de senha, webhook/bounce, painel de estatísticas completo, paginação infinita, broker e outbox de negócio. Não implementar nem publicar nada ao produzir estes documentos.


