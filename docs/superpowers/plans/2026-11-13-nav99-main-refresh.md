# NAV-99: integração com a main atual

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Atualizar o PR #77 na branch da NAV-99, preservando a interface e as regras atuais da main.
**Architecture:** Integrar origin/main na branch existente. Preservar o desfazer por destinatário e adaptar seus consumidores; evoluir a baseline PostgreSQL atual com V2, sem alterar a V1 aplicada.
**Tech Stack:** Spring Boot, Java 17, Flyway/PostgreSQL 16, Angular 21 e Vitest.
**Spec:** NAV-99 e revisão enviada pelo usuário em 13/11/2026.

## Restrições
- Branch feature/NAV-99-notificacoes-caixa-entrada; sem merge na main.
- Preservar layout compacto agrupado por dia, filtros, sino e funcionalidades de e-mail da main.
- Mesmo conjunto das 100 mais recentes; inversão da apresentação e desempate por ID.
- Pop-up verde de quatro segundos, progresso, último lote, autorização e validade no backend.
- V1 PostgreSQL imutável; V2 acrescenta campos sem apagar dados. A main incorporou a migração para PostgreSQL durante a pausa de 13 para 14/11; a antiga V10 MySQL deixou de ser aplicável.
- Prioridade de Novo RMA registrada como snapshot opcional, com fallback para textos legados. Conteúdo de e-mail da main preservado.
- Bancos e volumes locais existentes não serão recriados para a validação.

## Foco de revisão
- Marcação no sino invalida o lote anterior e mantém os contadores/listas coerentes.
- Destruição da página e expiração com respostas pendentes não reabrem o pop-up.
- Notificações exclusivas de e-mail não entram nas operações da caixa de entrada.
- Prioridade atualizada no RMA não altera a prioridade histórica do aviso.
- Upgrade da baseline V1 PostgreSQL com notificações existentes preserva conteúdo, destinatários e leitura.

## Execução
- [x] Conferir main, PR, Jira e worktree limpa; integrar main sem reescrever histórico.
- [x] Backend: resolver conflitos, V2 e snapshot, preservar filtros/concorrência; testar migração e contratos.
- [x] Frontend core/sino: unir contratos, filtros e resumo, adaptar leitura em lote e prioridade; testar HTTP e componentes.
- [x] Página: portar destaque, ordenação e pop-up ao layout atual; cobrir temporizadores e destruição.
- [x] Executar suítes completas, builds e Compose; validar PostgreSQL isolado e revisar diff contra main.
- Entrega: commit Conventional Commits, push na branch existente, atualizar PR/Jira e aguardar CI aprovado; evidências de publicação registradas no PR #77 e na NAV-99.

## Evidências locais
- Frontend: 1.635 testes aprovados e build de produção concluído (aviso de orçamento de CSS: 5,39 kB).
- Backend: suíte de 1.173 testes executada em PostgreSQL isolado; as 12 falhas de e-mail causadas pelo relógio fixo da fixture foram corrigidas somente no teste. Reexecução dos 18 testes da classe e geração do JAR aprovadas.
- Compose local e produção válidos; baseline V1 e factories de texto/e-mail idênticas à main `971fb33`.
- Chrome headless com build de produção e API temporária em memória: desktop 1366×900 e celular 390×844; ordem, desfazer, expiração e barra regressiva aprovados. Backend validado separadamente por testes de integração.

## Contratos entre tarefas
- POST /api/notifications/read-all: 200 com markedCount, undoToken e expiresAt.
- POST /api/notifications/read-all/undo: restoredCount; dismiss: 204.
- NotificationResponse.rmaPriority: LOW/MEDIUM/HIGH ou null, somente RMA_CREATED.
- Serviço de frontend mantém eventType, severity, unreadOnly, includeSnoozed e recarga em background.
