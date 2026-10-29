# Validação manual — NAV-31 e NAV-61

Este roteiro separa o editor de workflow (NAV-31), os módulos operacionais (NAV-61) e a integração entre eles. Usar somente a instância/banco de testes preparado para estas issues.

## Preparação

- Na instância preparada nesta implementação, abrir `http://127.0.0.1:4300` (banco de testes separado). O host 127.0.0.1 também evita misturar cookies com a aplicação anterior em localhost.
- Entrar como administrador. Ter pelo menos dois RMAs de teste, um com diagnóstico preenchido e outro sem diagnóstico.
- Já existem usuários temporários TECHNICIAN, SERVICE_DESK e VIEWER na instância preparada. Os acessos são entregues em arquivo local, fora do versionamento. Usar sessões separadas ou janelas anônimas.
- Os RMAs `RMA-2026-000001` (com diagnóstico) e `RMA-2026-000002` (sem diagnóstico) estão disponíveis. Os dados do ensaio anterior podem ser consultados; para começar a sequência abaixo, crie o modelo com o código sugerido, sem o sufixo dos modelos já existentes.
- A NAV-34 segue em PR separado: ordenação manual de cards não faz parte desta branch.

## NAV-61 — Checklist e aprovação interna

1. Em **Modelos de checklist**, criar `CHECK_REPARO` com nome “Conferência do reparo”, dois itens obrigatórios e um opcional. Salvar e conferir versão 1.
2. Nos detalhes de um RMA, vincular esse modelo. A execução deve mostrar nome, versão e itens do snapshot; obrigatórios começam pendentes.
3. Tentar marcar um item sem nota: deve ser recusado. Marcar com nota; conferir executor, data e evento no histórico. Desmarcar com outra nota; o evento anterior deve continuar consultável.
4. Editar o modelo e adicionar outro item obrigatório. A execução já iniciada deve permanecer na versão 1, sem o novo item. Reiniciar/vincular uma nova execução deve usar a nova versão e preservar a antiga.
5. Marcar todos os obrigatórios da execução atual: deve indicar concluído. O opcional pendente não deve impedir conclusão. Desmarcar um obrigatório deve voltar a pendente.
6. Arquivar o modelo: não deve aceitar novas execuções; as existentes e seus históricos devem continuar consultáveis.
7. Solicitar aprovação com código `LIBERACAO_REPARO` e justificativa. Conferir estado pendente, autor e data. Aprovar como ADMIN ou SERVICE_DESK, com motivo; conferir decisão, decisor e data.
8. Criar nova solicitação para a mesma finalidade: deve ficar pendente novamente, mantendo a decisão anterior no histórico. Rejeitar e conferir o motivo. Uma solicitação decidida não pode ser decidida de novo; uma antiga substituída também não.
9. Como TECHNICIAN, executar checklist e solicitar aprovação; ações de decisão e edição de modelos devem ficar indisponíveis. Como VIEWER, consultar sem poder alterar.
10. Em duas sessões, tentar atualizar a mesma revisão de modelo/item/decisão. A segunda gravação obsoleta deve ser rejeitada sem apagar a primeira.
11. Para conferir recuperação de falha, nas ferramentas do navegador bloqueie temporariamente a consulta GET do RMA após uma gravação bem-sucedida. A tela deve reconhecer a operação registrada, bloquear novas escritas e oferecer **Atualizar verificações**. Desbloqueie a consulta e use esse botão: ele deve atualizar os dados sem repetir a solicitação ou reiniciar outro checklist.

## NAV-31 — Editor e execução de workflow

1. Em **Fluxos de RMA**, conferir versão publicada e criar rascunho. Renomear uma etapa e salvar. Abrir o Kanban em outra aba: o publicado deve permanecer igual.
2. Descartar rascunho e reabrir: nenhuma alteração deve ter sido publicada.
3. Criar novo rascunho e adicionar uma etapa “Aguardando revisão”, categoria em andamento e política de SLA de diagnóstico. Ordenar usando os controles e conferir no diagrama.
4. Tentar publicar a etapa sem saída: publicação deve falhar, mantendo o rascunho. Criar entrada a partir de Triagem e saída para Reparo; conferir que o grafo alcança um estado concluído.
5. Configurar a transição Triagem → Aguardando revisão para Administrador e Técnico. Em **Campos obrigatórios**, marcar **Falha encontrada** (`diagnosis.foundFailure`). Publicar. O Kanban e os filtros devem usar as etapas/nomes/ordem novos após recarregar.
6. No RMA sem diagnóstico, o destino deve ficar indisponível. Em seus detalhes, expandir **Passagens do fluxo** e conferir o motivo. Preencher o diagnóstico e recarregar: a opção deve ser liberada. SERVICE_DESK não deve executar uma transição restrita aos outros perfis.
7. Selecionar RMAs com destinos permitidos diferentes: o lote deve oferecer os destinos comuns. A API deve revalidar cada card e mostrar falha individual se algo mudar depois da seleção.
8. Renomear o workflow e uma etapa, publicar e consultar um evento anterior: o histórico deve preservar nome antigo do status, nome do workflow e versão daquela transição.
9. Remover do rascunho uma etapa que ainda contenha um RMA e tentar publicar: a publicação deve ser recusada. Arquivar deve manter seu card visível, bloquear novas entradas e permitir saída para uma etapa ativa. Retirar todas as saídas de uma etapa arquivada que ainda contenha cards também deve impedir publicação.
10. Na mesma transição, criar duas condições **Campo do RMA**, campo **Prioridade**, operador **Igual a**, com valores `HIGH` e `LOW`. A publicação deve ser recusada com erro útil, sem afetar a versão publicada. Remover as condições contraditórias para continuar.
11. Editar rascunho em duas sessões e salvar com a mesma revisão: a segunda gravação deve falhar por conflito. Publicar depois de uma versão mais recente também deve ser recusado.
12. Escolher outro status inicial ativo e publicar; novos RMAs devem usar essa etapa. Encerrar um RMA deve encerrar o SLA; reabrir deve iniciar o prazo da nova etapa. Mover entre duas etapas customizadas com a mesma política também deve reiniciar o tempo da etapa.

## Integração NAV-31 + NAV-61

1. Reativar o modelo `CHECK_REPARO`. No workflow, adicionar a condição **Checklist concluído**, escolher esse modelo e resultado **Sim**. Adicionar **Aprovação interna**, finalidade `LIBERACAO_REPARO`, operador **Igual a** e resultado **Sim**, na mesma transição de teste.
2. Sem execução e sem solicitação, a transição deve ficar bloqueada. Checklist incompleto também deve bloquear.
3. Concluir todos os obrigatórios e manter aprovação pendente: ainda bloqueado. Rejeitar a aprovação: continua bloqueado.
4. Criar nova solicitação e aprovar com perfil permitido. Recarregar o RMA: a transição deve ser liberada, com as mesmas regras no arraste, formulário e lote.
5. Reiniciar checklist ou criar nova solicitação após uma aprovação anterior: a condição deve voltar a bloquear, usando sempre os registros mais recentes da finalidade/modelo.
6. Exigir status de outro RMA e informar a relação no RMA atual, com nota. A opção deve acompanhar o estado do RMA relacionado. Auto-relacionamento e referência inexistente devem ser recusados.
7. Conferir que nenhuma tela permite liberar aprovação/conclusão por uma flag livre; apenas as operações registradas nos módulos podem satisfazer as regras.
8. Tentar arquivar o modelo enquanto ele ainda for exigido no workflow publicado: deve ser recusado. Remover a condição, publicar e repetir: agora deve permitir. Uma condição em rascunho que referencia modelo arquivado deve impedir a publicação.

## Resultado esperado

Rascunhos não alteram a operação; publicações válidas passam a controlar todos os caminhos de transição. Checklist e aprovação mantêm identidade, versão e histórico próprios. Os registros existentes e seus históricos permanecem consultáveis.
