# Notificações e e-mails

## Eventos e regras

Tipos (`NotificationEventType`):

| Evento | Produzido hoje | Regra inicial |
| --- | --- | --- |
| `RMA_CREATED` | Sim, ao abrir uma OS | Ligada, severidade `INFO`, destinatários: perfis Administrador e Atendimento. |
| `RMA_ASSIGNED` | Sim, ao atribuir ou trocar o responsável | Ligada, `INFO`, avisa só o responsável (`notifyAssignee`); o usuário não pode silenciá-la. |
| `RMA_BLOCKED` | Sim, ao abrir um impedimento | App ligado, `WARNING`, responsável pela OS e perfil Administrador; permite silenciamento. |
| `PART_PENDING` | Sim, ao reservar uma peça sem saldo suficiente | App ligado, `WARNING`, perfil Administrador; permite silenciamento. |
| `TEST_FAILED` | Sim, ao registrar cada tentativa reprovada de um item de protocolo | App ligado, `WARNING`, responsável pela OS e perfil Administrador; permite silenciamento. |

Os alertas `SLA_*` foram removidos; a data limite não gera notificação ([prazo-e-garantia.md](prazo-e-garantia.md)).

- Cada regra (`notification_rules`) tem interruptores geral (`enabled`), App (`appEnabled`) e E-mail (`emailEnabled`), severidade (`INFO`, `WARNING`, `CRITICAL`) e destinatários **por perfil**. A configuração é feita por quem tem `notificacoes.regras`. A regra pode ficar sem destinatário (avisa na tela que não entrega a ninguém, mas salva).
- Só recebe e vê a notificação quem está ativo e tem `rma.ver`; a regra é reavaliada ao gerar e ao listar, então mudanças de permissão valem na hora.
- O e-mail inicia **desligado** em todas as regras existentes. O administrador pode ligá-lo na aba Regras.
- Cada usuário pode silenciar tipos permitidos pela regra (`/api/notifications/preferences`); o silenciamento vale para os dois canais. Ler ou adiar no app não cancela um envio de e-mail pendente.
- Cada ocorrência usa uma chave por ID do impedimento, reserva ou resultado; reprocessar a mesma chave não duplica a entrega. Resolver impedimento, alocar reserva ou aprovar item não gera esses alertas.
- O texto sai em português e o link aponta só para rotas internas (`/rmas?rma=<id>`); não há links públicos.

## Notificações no app

- `GET /api/notifications` devolve um array de até 100 itens e aceita `unreadOnly`, `includeSnoozed`, `eventType` e `severity`. Caixa, resumo e ações pessoais ignoram linhas exclusivas de e-mail. `read-all` alcança todas as visíveis do usuário, inclusive adiadas e além das 100 linhas.
- O sino e a caixa de entrada atualizam a cada 60 segundos, sem disparar o pop-up de carregamento.

## E-mail

O backend usa o e-mail opcional de `user_accounts`, nunca o do cliente nem um endereço derivado do username (ver [acesso-e-permissoes.md](acesso-e-permissoes.md)). Variáveis em [configuracao.md](configuracao.md).

### Provedores

- **`fake`**: só nos perfis `local` e `test` quando o canal está ligado. Guarda as últimas 100 mensagens em memória (sem endpoint de captura; reiniciar limpa). `SENT` significa **simulado**, sem entrega postal.
- **`resend`**: HTTP nativo para `https://api.resend.com/emails`, sem redirects, conexão de 3 s e limite total de 10 s, resposta limitada a 16 KiB. Exige remetente/domínio verificado, `RESEND_API_KEY`, `MAIL_FROM` e `APP_BASE_URL` em HTTPS. SMTP foi removido. Os testes usam só servidor HTTP local e dados sintéticos.

Para produção: configure remetente e chave no ambiente, escolha `resend` e só então habilite o canal.

### Fila

A fila é persistente, na própria notificação, com estados `NOT_REQUESTED`, `PENDING`, `SENT` e `FAILED`.

- O worker é sequencial por instância. Com mais de uma instância, cada tentativa é reservada por `UPDATE` condicional (linha `PENDING`, tentativa esperada e devida), que empurra `email_next_attempt_at` 5 minutos à frente; só quem afetou a linha envia. **Não execute mais de uma instância deste worker** (não há garantia exactly-once).
- A cada tentativa revalida usuário, permissão, regra, silenciamento e endereço.
- Até 5 tentativas: imediata, depois 1 min, 5 min, 30 min e 2 h. HTTP 4xx permanente falha na hora; 429, 5xx e erro de rede repetem. Erro de processamento fora do envio (leitura, elegibilidade, conclusão) conta como tentativa e recua do mesmo jeito (`PROCESSING_ERROR`) até virar `FAILED`.
- Nenhuma notificação legada é agendada retroativamente.

### Tetos de envio

O plano do provedor (por exemplo, o Resend gratuito: cerca de 100 por dia e 3.000 por mês) é respeitado contando as entregas `SENT` do provedor real no dia e no mês civis de `America/Sao_Paulo` (o fake não conta). Atingido o teto, o worker não prepara nem envia: as linhas `PENDING` esperam, sem gastar tentativas e sem virar `FAILED`, e saem sozinhas na virada do dia ou do mês. Entre instâncias o teto é suave. O e-mail de teste não conta, mas é recusado com `429` quando o teto já foi atingido. Os envios reais são espaçados por `NOTIFICATIONS_EMAIL_SEND_INTERVAL_MS`; `429` do provedor segue retentável.

### Administração (`notificacoes.regras`)

- `GET /api/notification-rules/email-status`: `{enabled, provider, sentToday, dailyLimit, sentThisMonth, monthlyLimit, limitReached}` (limite `0` = sem limite); alimenta o painel "Enviados hoje X/100".
- `GET /api/notification-rules/failures`: até 50 falhas recentes de EVENT e EMAIL, com erro sanitizado. EMAIL inclui ID, tentativas, provedor, status, próxima tentativa e se admite reenvio; o destinatário aparece como username, sem endereço.
- `POST /api/notification-rules/emails/{notificationId}/retry`: só para `FAILED`. `202` ao agendar, `409` em outro estado, `400` se inelegível, `404` se inexistente. Não cria outra notificação no app. Cada reenvio manual incrementa `email_generation` e o `Idempotency-Key` passa a ser `{id}-{geração}` (geração 0 usa só o id); as tentativas automáticas da mesma geração repetem a chave.
- `POST /api/notification-rules/emails/test`: corpo vazio; envia na hora ao e-mail da própria sessão. `200` com `status=enviado` ou `simulado`, `400` se indisponível, `502` se o provedor falhar, `429` dentro de 30 s (limite em memória por usuário). Não grava notificação nem evento.

### Limitações conhecidas

- Falhas do canal não desfazem a OS nem a notificação do app. Existe uma janela de perda entre o commit da OS e a distribuição pelo listener; não há outbox de negócio.
- O provedor pode reconhecer a tentativa anterior pelo `Idempotency-Key`; mudanças de endereço ou conteúdo podem conflitar na janela de retenção dele, e um timeout após aceitação pode duplicar fora dela.
