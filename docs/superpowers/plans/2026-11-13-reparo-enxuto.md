# Reparo enxuto — plano de execução

Fonte de requisitos: solicitação enxuta do usuário, com precedência sobre o desenho anterior.

1. Backend com TDD: V5 aditiva, motivo/lote na reserva consumida, componentes externos sem estoque e intervenções em horas; preservar travas RMA → peça → reserva.
2. Frontend com TDD: contratos espelhados, formulários inline, lista unificada e painel compartilhado de intervenções nas duas superfícies.
3. Segurança: permissões existentes, matchers explícitos antes dos genéricos e matriz com autoridades isoladas.
4. Laudo: componentes estruturados, motivo/lote, intervenções e horas, validados pela extração do PDF.
5. Integração: README e Flyway V1–V5 em MySQL 8 isolado no projeto navitas-mig (3317), encerrando somente esse projeto com down -v.
6. Verificação final: Maven verify, suíte frontend com runner informado e build; commits locais por tarefa lógica, staging por caminho, relatório de testes e desvios.

Limites: somente este repositório; sem push/reset/clean; preservar pilhas existentes, segredos, configurações globais e arquivos de catalogimport/outros agentes. Sem novas permissões, edição/anulação, intervalos ou histórico próprio de reparo. Eventos ficam fora da linha do tempo por não haver mecanismo genérico simples.
