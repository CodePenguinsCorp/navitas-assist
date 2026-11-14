# Plano: histórico com Ver mais

1. Criar spec em shared/rma-history-list para cinco iniciais, total, restantes, incrementos de dez, ausência de botão, troca de OS, foco, anúncio e edição de observação revelada. Executar isoladamente e observar falhas de comportamento.
2. Implementar controle compartilhado com signal e projeção, reutilizando os cartões e ações de pages/rmas e shared/rma-detail-modal. Releitura dos arquivos antes de editar; sem alterar Tempo por etapa ou styles.css.
3. Executar specs novos e dos dois detalhes; depois suíte completa com TZ=UTC e runner-config local, e build frontend sem avisos. Revisar diff e criar commit local somente com os caminhos desta tarefa.
