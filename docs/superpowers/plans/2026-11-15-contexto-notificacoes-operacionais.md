# Contexto das notificações operacionais

Spec aprovada: `../specs/2026-11-15-contexto-notificacoes-operacionais-design.md`.

1. Backend: teste unitário de NotificationContentFactory falhando para os três tipos, escapes, autor ausente e orçamento. Implementar formato e ampliar NotificationIntegrationTest dos produtores. Verificar com Maven filtrado; sem TEST_DB_URL, não executar integração.
2. Frontend: specs de notification-detail-content e DOM para formato novo e antigo. Implementar parser estrito, chip, motivo e avatar reaproveitando o modal. Executar specs focados.
3. Atualizar docs/notificacoes-e-emails.md e análise UX. Executar suíte completa com TZ=UTC e runner indicado, depois build sem avisos.
4. Revisar diff, criar commits locais separados por backend e frontend/docs. Relatar limitações de integração e conferência visual.
