# Projeto B — simplificações obrigatórias (têm precedência sobre a spec e o plano)

Decisão do dono do produto (13 nov 2026): a spec `2026-11-13-emails-e-notificacoes-design.md` e o plano `2026-11-13-emails-e-notificacoes.md` descrevem robustez além do necessário para esta fase (uma única instância, sem produção ainda). Implementar a versão enxuta abaixo; tudo que a spec traz e não está aqui como "mantém" fica fora.

## Mantém
- Provedor por interface (`EmailProvider`), `FakeEmailProvider` (guarda as últimas 100 em memória) e `ResendEmailProvider` (HTTP nativo, sem SDK, sem redirects, timeouts 3 s/10 s, bearer só no cabeçalho). Resend desligado por padrão; variáveis `NOTIFICATIONS_EMAIL_ENABLED`, `NOTIFICATIONS_EMAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`, `APP_BASE_URL`; falha clara na inicialização só quando ligado e sem os valores.
- `user_accounts.email` (nulo, único sem diferenciar caixa, validação simples, sem CR/LF), nos requests/respostas de usuário e na tela de Usuários.
- E-mail por evento e por usuário (sem To/CC/BCC), só usuários internos, conforme as regras por perfil que já existem; `emailEnabled` por regra (já existente) e a nova `appEnabled`; padrões da tabela da spec (e-mail desligado nas regras existentes).
- Fila persistente reaproveitando as colunas de status da notificação: `PENDING/SENT/FAILED/NOT_REQUESTED`, `email_attempts`, `email_next_attempt_at`, `email_error` sanitizado; worker agendado simples (uma instância): pega as vencidas em ordem, envia, marca. Até 5 tentativas com recuo 1 min, 5 min, 30 min, 2 h; 4xx permanente falha na hora; 429/5xx/rede repetem.
- Modelo de e-mail em português (HTML simples + texto, tudo escapado, sem nome de cliente, link `APP_BASE_URL/rmas?rma={id}`), assunto `[Navitas Assist] {evento} — {código}`.
- Falha de e-mail nunca desfaz a OS nem a notificação do app. Sem PII/segredos em logs.
- Tela: filtros por evento/severidade e agrupamento por dia na caixa de entrada; "marcar todas como lidas"; preferência de silenciar por evento; regras com colunas App/E-mail; seção "Falhas de e-mail" com "Reenviar" (só FAILED) e botão "Enviar e-mail de teste" para si, com selo "Desligado/Simulado".
- Sem permissão nova (usa `notificacoes.regras`). Sem SLA/prazo.

## Corta (não implementar)
- Lease, `claim_token`, `generation`, `email_payload_hash`, `email_provider_id` de idempotência por geração, chave de idempotência elaborada (basta enviar o id da notificação como `Idempotency-Key` fixo), detecção de troca de endereço/provedor entre tentativas, `email_skip_reason` detalhado (basta `NOT_REQUESTED`), `email_last_attempt_at`.
- Tabela `notification_email_preferences` e `emailMuted` separado: o silenciar existente (`notification_mutes`) vale para os dois canais.
- Linha de "e-mail de teste" com `event_id` nulo na tabela de notificações: o teste envia **na hora**, direto pelo provedor, para o e-mail do usuário logado, devolve o resultado (200 "enviado/simulado" ou 400/502 com motivo) e não grava nada; limite simples de 1 por usuário a cada 30 s em memória.
- Limite persistente de teste, contadores/métricas além de logs, `Retry-After` configurável, endpoint `email-status` além de `{enabled, provider}` (suficiente para o selo), reescrita de `read-all` com semântica nova além de "todas as visíveis do usuário".
- Marcar tipos não suportados: basta o campo `supported` na regra e "Indisponível" no editor.

## Ordem
Backend completo (migração do e-mail do usuário + colunas da fila + provedores + worker + API), depois frontend. Migração: próximo número livre depois das existentes (verifique `db/migration`). TDD, um commit local por tarefa, sem push.
