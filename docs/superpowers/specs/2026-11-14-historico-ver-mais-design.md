# Histórico: Ver mais

Nos detalhes da lista de OS e do Kanban, exibir as cinco entradas mais recentes, mantendo a ordenação decrescente de `rmaHistory`. Revelar até dez por clique em botão nativo discreto, alinhado à esquerda: `Ver mais (N restantes)`. Ocultar ao esgotar. Mostrar o total junto do título quando houver mais de cinco entradas.

Compartilhar o controle em `shared/rma-history-list`, com limite em signal e projeção dos cartões existentes de cada detalhe. Reiniciar apenas quando mudar o id da OS; atualizações da mesma OS preservam a expansão e as ações existentes. Sem contratos, rotas ou permissões novas; Tempo por etapa permanece intacto.

Após expandir, focar a primeira entrada nova com tabindex=-1, inclusive no último lote, quando o botão desaparece. Região aria-live polite anuncia `N entradas exibidas`. A conferência visual em desktop e 320 px será feita separadamente; testes DOM comprovam comportamento e foco.

Fora do escopo: paginação no servidor, Ver menos, mudanças nos demais campos e na pilha local.
