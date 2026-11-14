# Plano de implementação da auditoria

**Objetivo:** implementar a decisão aprovada em `../specs/2026-11-13-auditoria-design.md`.
**Arquitetura:** eventos explícitos nos serviços, gravação obrigatória na transação existente, leitura paginada protegida, tela lazy com componentes compartilhados.
**Tecnologias:** Java 17, Spring Boot, Flyway/MySQL/H2, Angular 21 e Vitest.

## Restrições

Somente este repositório, sem push ou alteração de pilhas em uso. V13 aditiva, sem alteração da baseline. Mensagens em português, sem dados pessoais ou segredos em resumos de cadastros. TDD e commits locais por tarefa.

## Tarefas

- [ ] Logs e backend: primeiro testar código de ocorrência/log e ausência de eventos em criação; implementar `AuditService.record(action, entityType, entityId, entityLabel, summary)`, entidade e V13, integrar produtores, API e cadeia Java de permissões. Testar ator da sessão, rollback, filtros, paginação e acesso. Verificar com Maven.
- [ ] Consulta frontend: testar rota lazy/permissão antes de criar a rota; espelhar contrato em `core/models.ts`, criar serviço HTTP e página `pages/audit`, menu e catálogos/fixtures. Testar filtros, paginação, erro/código, carregamento e vazio com Vitest em UTC.
- [ ] Documentação: `auditoria.md`, índice, API, banco e acesso; descrever limites de texto livre e intenção de e-mail.
- [ ] Conferência: `mvn -B -ntp -f backend/pom.xml verify`, frontend completo com TZ=UTC e runner-config local, build sem avisos, MySQL isolado navitas-mig/3317 e revisão independente.

## Foco de revisão

Reversão conjunta quando a auditoria falha; mudanças de conta do próprio ator; diffs extensos de permissões; texto livre com dados pessoais; limites de datas no fuso do negócio. Validar que não existem operações update/delete da trilha nem leitura sem permissão própria.
