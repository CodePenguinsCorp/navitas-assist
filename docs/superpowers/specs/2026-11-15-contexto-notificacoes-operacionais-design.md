# Contexto nas notificações operacionais

## Objetivo e escopo

Enriquecer RMA_BLOCKED, PART_PENDING e TEST_FAILED no backend e no modal existente. Preservar notificações antigas, ações, cabeçalho, horário ao fim do corpo e rodapé único. Sem novas rotas, permissões, migrações ou consultas do modal.

## Abordagem proposta

Reutilizar NotificationContentFactory e notificationDetailContent. O evento já fornece actor, detail e occurredAt nos três produtores; não ampliar RmaNotificationEvent. NotificationResponse não fornece estado atual nem resolução do impedimento: não presumir que continua aberto e não calcular duração a partir da notificação. O e-mail não reutiliza message e mantém seu conteúdo atual sem dados do cliente.

Campos próprios no contrato seriam mais robustos, mas exigiriam persistência, migração e ampliação da API. Para esta entrega, manter o contrato textual solicitado e fazer reconhecimento estrito, com fallback integral.

## Formato proposto

`Cliente · Equipamento · etapa Diagnóstico. Motivo do impedimento: "Aguardando peça. Sem saldo · lote 2". Registrado por "admin".`

Rótulos: `Motivo do impedimento`, `Pendência da peça` e `Item reprovado`. Motivo e autor entre aspas com escape de string JSON, permitindo reconhecer pontos, separadores, aspas e quebras sem confundir conteúdo com autoria. O modal decodifica esses valores. Autor nulo ou em branco omite a frase inteira. Detalhe vazio usa os fallbacks atuais. Orçamento de 500 caracteres inclui prefixo, pontuação, escapes e autoria; reduzir somente o motivo, sem dividir um caractere suplementar ou escape. Cliente, equipamento e etapa permanecem integrais. Conferir limites de nomes no teste de orçamento.

## Modal

Reconhecer os três formatos por tipo e rótulo. Exibir Cliente e Equipamento com a hierarquia atual; Etapa com status-chip e cores existentes; motivo em largura inteira, destaque e white-space pre-wrap; Registrado por com avatar e iniciais. Formato antigo ou não reconhecido vira campo com o rótulo específico do tipo, preservando o texto integral. Não usar parágrafo solto nesses três tipos. Não alterar o parser de criação e atribuição além do necessário para compartilhar o retorno.

## Execução e verificação propostas

1. Escrever testes unitários da fábrica: três tipos, autor ausente, detalhe vazio, pontos, separadores, aspas, quebras e limite total. Observar falha antes da implementação.
2. Implementar fábrica e ampliar integração dos produtores com asserções de contexto e autoria.
3. Escrever specs do parser e DOM para os três tipos nos formatos novo e antigo, motivo completo, avatar, etapa e preservação do layout. Observar falha antes de implementar.
4. Atualizar docs/notificacoes-e-emails.md e a seção curta solicitada em docs/ux/2026-11-15-modal-notificacao-analise.md.
5. TEST_DB_URL está ausente nesta sessão: executar apenas testes unitários filtrados do backend, sem Docker. Integração e verify completo ficam pendentes para execução pelo proprietário.
6. Executar a suíte completa do frontend com TZ=UTC e o runner indicado, depois build sem avisos. Relatar contagens e falhas com precisão; preservar alterações concorrentes.
7. Revisar e criar commits locais separados de backend e frontend/docs, por caminhos explícitos, em português, sem coautoria. Não fazer push.

## Limites da comprovação

Não iniciar serviços nem usar as portas 8080, 8081, 4200 ou 4201. Conferência visual em navegador não está prevista. Alterações concorrentes já apareceram em notification-bell.component.css e notification-bell.component.html e ficam fora desta entrega.