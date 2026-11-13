# Prazo, tempo por etapa e garantia

## Tempo por etapa

Substitui o antigo SLA por etapa (prazos de 24/48/72/120 h e alertas `SLA_WARNING`/`SLA_OVERDUE`), retirado por decisão do dono do produto em 13 de novembro de 2026. O sistema mostra quanto tempo o RMA está em cada etapa e uma data limite opcional do atendimento inteiro.

- O backend devolve `stagePeriods` em cada RMA: períodos em ordem cronológica, cada um com `status`, `enteredAt`, `leftAt` (nulo na etapa atual) e `durationSeconds`. O último é a etapa atual.
- Registros consecutivos com o mesmo status formam um período só: notas e trocas de prioridade não reiniciam a etapa. Sair e voltar abre um período novo. Empates de instante usam o ID do histórico.
- RMAs legados sem histórico começam em `createdAt`; se faltar, em `entryDate` à meia-noite de `America/Sao_Paulo`. Durações nunca são negativas.
- Os cards do Kanban mostram "há 2 d 4 h nesta etapa" para RMAs abertos. O detalhe mostra "Nesta etapa" (ou "Encerrado em ..." para encerrados) e, no Histórico, a lista "Tempo por etapa". O tempo de impedimento continua contando na etapa.
- A tela recalcula os tempos a cada 30 segundos (`ClockService`), sem recarregar.

## Data limite

- Opcional e só data (`dueDate`, `YYYY-MM-DD`). Quem abre o RMA (`rma.abrir`, `POST /api/rmas`) pode preenchê-la; depois, quem tem `rma.editar` altera ou remove pelo botão "Alterar" do detalhe: `PUT /api/rmas/{id}` com `{"dueDate": "..."}` ou `{"clearDueDate": true}` (enviar os dois dá `400`).
- Não pode ser anterior à entrada, inclusive quando a edição muda só a entrada. Datas no passado são aceitas, porque um RMA antigo pode já estar atrasado.
- Cada mudança fica em `dueDateHistory` (tabela `rma_due_date_history`) com autor, instante, valor anterior e novo, e aparece no Histórico do detalhe.
- A situação vem em `deadline` (`status`, `dueSoonFrom`, `daysUntilDue`), com "hoje" na data civil de `America/Sao_Paulo`:

| Situação | Código | Regra |
| --- | --- | --- |
| Atrasado | `OVERDUE` | RMA não encerrado e hoje depois da data limite |
| Perto do limite | `DUE_SOON` | Não encerrado e hoje entre `dataLimite - N` e a data limite, inclusive |
| No prazo | `ON_TRACK` | Não encerrado e hoje antes de `dataLimite - N` |
| Sem data limite | `NO_DUE_DATE` | Não encerrado e sem data limite |
| Encerrado | `CLOSED` | `COMPLETED`, `RETURNED` ou `IRREPARABLE`, com ou sem data limite; nunca é atrasado |

- `N` é `DEADLINE_WARNING_DAYS` (`navitas.deadline.warning-days`), de 0 a 90, padrão 7. Com 0, só o próprio dia fica "Perto do limite". Valor inválido impede a inicialização ([configuracao.md](configuracao.md)).
- O frontend recalcula a situação a cada tique do relógio, a partir de `dueDate` e `dueSoonFrom`; a virada da meia-noite não exige recarga.
- A data limite só destaca e filtra: **não gera notificação**. O card mostra "Atrasado há N dias" ou "Vence em N dias"/"Vence hoje" apenas nesses dois casos.
- O Kanban tem o filtro "Prazo" (Todos, Atrasados, Perto do limite, No prazo, Sem data limite); encerrados aparecem só em "Todos". O filtro é salvo nas visualizações (`kanban_views.deadline_status`); visualizações antigas sem o campo abrem com "Todos". O dashboard mostra o indicador "Atrasados", com o detalhe "perto do limite".

## Garantia dos produtos

Cada produto do RMA é avaliado individualmente. O vencimento é a data de compra informada no RMA mais o prazo de garantia do produto, em meses. A cobertura considera a data de entrada do atendimento e inclui o dia do vencimento. O prazo é gravado em cada novo item, para preservar a garantia quando o cadastro do produto mudar.

| Valor (`WarrantyStatus`) | Situação | Regra |
| --- | --- | --- |
| `PENDING` | Pendente | Data de compra desconhecida. |
| `IN_WARRANTY` | Em garantia | Entrada até o vencimento, inclusive. |
| `OUT_OF_WARRANTY` | Fora de garantia | Entrada após o vencimento. |

Em `items[]`, `warrantyStatus` é a situação **efetiva** (ajuste manual, se existir; senão o cálculo automático), `calculatedWarrantyStatus` guarda a calculada e `warrantyOverride` traz `{ status, reason, changedBy, changedAt }` ou `null`. Kanban (inclusive filtros de visões salvas), listagens e relatórios usam a situação efetiva; não há fórmula paralela em SQL/JPQL.

### Ajuste manual

Quem tem `rma.editar` ajusta um item com `PUT /api/rmas/{rmaId}/items/{itemId}/warranty`:

```json
{ "override": "IN_WARRANTY", "reason": "Cortesia" }
```

- `override` aceita `IN_WARRANTY`, `OUT_OF_WARRANTY` ou `null` (volta ao automático).
- Ao definir o ajuste, o motivo é obrigatório (até 255 caracteres após remover espaços das pontas); na remoção é opcional, com o mesmo limite.
- RMAs encerrados retornam `400`; item que não pertence ao RMA retorna `404`; valores e motivos inválidos retornam `400` com mensagem em português.
- Cada ajuste ou remoção é gravado na mesma transação e exposto em `RmaResponse.warrantyHistory[]`, do mais recente ao mais antigo (`itemId`, `previousOverride`, `newOverride`, `reason`, `changedBy`, `changedAt`).
- A edição geral do RMA preserva o ajuste e o prazo dos itens reconhecidos por produto, lote e série e não remove nem substitui item com histórico de ajuste, para preservar a auditoria.

## Componentes trocados, intervenções e tempo de serviço

O detalhe do RMA (lista e Kanban) oferece os registros de reparo.

| Operação | Rota | Permissão |
| --- | --- | --- |
| Consumir reserva | `POST /api/rmas/{id}/parts/{reservationId}/consume` | `pecas.reservar` |
| Adicionar componente externo | `POST /api/rmas/{id}/repair/external-components` | `pecas.reservar` |
| Consultar componentes externos | `GET /api/rmas/{id}/repair/external-components` | `rma.ver` |
| Registrar intervenção | `POST /api/rmas/{id}/repair/interventions` | `rma.diagnosticar` |
| Consultar intervenções e total de horas | `GET /api/rmas/{id}/repair` | `rma.ver` |

- **Consumo**: exige `{ "replacementReason": "Curto na placa", "componentBatch": "L24" }`; motivo obrigatório (até 1000) e lote opcional (até 120). Ficam na reserva com `appliedAt` e `appliedBy`, definidos pelo servidor na mesma transação do movimento. `GET /api/rmas/{id}/parts` devolve esses campos e `replacedComponents` (reservas `CONSUMED`). Consumos antigos exibem "Motivo não registrado".
- **Componente externo**: `code` opcional (60), `description` obrigatória (120), `quantity` positiva com até 3 casas, `unit` (20, padrão `un`), `componentBatch` opcional (120) e `replacementReason` obrigatório (1000). Não altera estoque. Código já existente no catálogo de peças (inclusive inativo, sem diferenciar caixa) é recusado, com orientação de usar a reserva. A lista "Componentes trocados" reúne estoque consumido e externos.
- **Intervenção**: `type`, `description` obrigatória (1000), `performedOn` (data não futura) e `hours` positivas com até 3 casas. Tipos: `RESOLDERING` (Ressolda), `CLEANING` (Limpeza), `REPROGRAMMING` (Regravação), `FIRMWARE_UPDATE` (Atualização de firmware), `HARNESS_REPLACEMENT` (Troca de chicote) e `OTHER` (Outra). `technicianName` guarda o usuário autenticado; o tempo é registrado só em horas e somado em `totalServiceHours`.
- RMAs `COMPLETED`, `RETURNED` e `IRREPARABLE` recusam novos consumos, componentes externos e intervenções (`400`, em português); a leitura continua. Não há edição nem anulação desses registros. Eventos de reparo não entram na linha do tempo do RMA. O laudo PDF inclui componentes, motivo e lote, intervenções, técnico e horas, sem custos.
