# Onda de performance e segurança

Escopo: P1, P7, P4, P15, P10, P9, P17, P18, S1, S4, S9, S12, S13 e S14 do pedido aprovado em 13/11/2026.

Restrições: apenas este repositório; sem push, reescrita de histórico, segredos ou pilhas existentes. MySQL apenas navitas-mig em 3317; containers temporários em portas livres. Sem atualização de versões, senha mínima, TLS/HSTS, CSP ou fechamento de /clients.

## Tarefas e verificações

1. Persistência: teste com 20 OS e relações distintas, contexto limpo e teto de 30 statements. Configurar batch 50, OSIV false, Hikari 10/10000. Rodar todos os testes e corrigir eventuais relações lazy dentro dos serviços.
2. Índices: V15 incremental e PerformanceIndexMigrationTest para metadados e dados preservados. Validar H2 e MySQL isolado; documentar em banco-de-dados.
3. Fila: teste vermelho de fila vazia sem consulta de quota; consultar due antes de quota e verificar verde. Documentar em notificacoes-e-emails.
4. Resumo de usuários: UserSummaryQueryIntegrationTest com permissões combinadas, conta inativa e nenhuma entidade carregada; count JPQL no lugar de findAll. Documentar em configuracao.
5. Autenticação: testes vermelhos e verdes de senha antes de situação, erros idênticos, backoff por usuário/origem com teto/reset e CSRF renovado. Matriz exige rma.ver em executions. Documentar em api e acesso-e-permissoes.
6. Entrada: items max20 e query max100, testar limites 20/21 e 100/101 via HTTP. Documentar em api.
7. Frontend: polling hidden/visible com timers controlados e remoção de PNGs após busca de referências. Testes e build; documentar em operacao-e-deploy.
8. Operação: nginx gzip/cache/headers/limit_req, scripts com permissões restritas, CI contents read e Docker não-root. Validar nginx e HTTP isolados, imagem backend e health isolado. Documentar em operacao-e-deploy.
9. Revisão independente somente leitura, correções e verificações finais: Maven verify, frontend TZ UTC e build sem avisos. Um commit local por tarefa lógica e apenas caminhos próprios.

## Riscos a conferir

Transações ausentes nos caminhos HTTP, relações lazy após serviço, permissões divididas no resumo, cabeçalhos de origem não confiáveis e limpeza dos containers temporários mesmo em falha.
