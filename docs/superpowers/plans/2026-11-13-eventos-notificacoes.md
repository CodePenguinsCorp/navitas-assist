# Eventos de notificação

Especificação: decisão do produto no pedido desta entrega. Ativar impedimentos, reservas pendentes e testes reprovados; excluir os três tipos sem produtor. Sem rotas novas.

- [x] Testar os produtores em `NotificationIntegrationTest`: destinatários, regra desligada, visibilidade, deduplicação, isolamento de falhas e rollback. Executar vermelho antes de implementar.
- [x] Publicar `RmaNotificationEvent` nos serviços existentes, com chave pelo ID da ocorrência e processamento pelo listener após commit.
- [x] Testar a passagem V11 para V12 com dados antigos; criar migração que limpa tipos removidos e ativa as regras com Administrador, responsável quando aplicável e e-mail desligado.
- [x] Atualizar enum, conteúdo, contrato e rótulos; provar o catálogo e a edição das regras no frontend.
- [x] Atualizar `docs/notificacoes-e-emails.md` e a tabela de migrações, preservando README e migrações anteriores.
- [x] Rodar Maven verify, testes frontend, build sem avisos e validação MySQL isolada em navitas-mig/3317. Revisar e criar commit local por entrega coesa.

Verificação: Maven verify com 1.076 testes e frontend com 1.482 testes aprovados; build de produção sem avisos (435,87 kB inicial); 12 migrações aplicadas no MySQL isolado. Logs do backend mantêm avisos de infraestrutura já existentes; runner frontend registrou socket hang up sem falha de teste. Conferência manual no navegador não executada.
