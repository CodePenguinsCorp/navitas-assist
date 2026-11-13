# Ajuste manual de garantia — desenho

**Origem:** PDF do cliente §3.2 ("regra automática + override"): calcular a garantia automaticamente e permitir marcar manualmente, com motivo ("Sem NF", "Cortesia", "Mau uso", "Cliente estratégico"), registrando status, justificativa, usuário e data.

**Estado hoje:** a situação (`PENDING`, `IN_WARRANTY`, `OUT_OF_WARRANTY`) é calculada por item em `ItemWarranty` (meses do item + data da compra + data de entrada) e devolvida em `RmaItemResponse.warrantyStatus`; não há como sobrescrevê-la nem campo de justificativa. A situação também alimenta o chip do item, o filtro de garantia (Kanban/visões salvas) e, no projeto C, o relatório "% em garantia".

## Decisões

1. **Por item do RMA**, porque a situação já é por item (`rma_items`).
2. **Override com dois valores:** `IN_WARRANTY` ou `OUT_OF_WARRANTY`; sem override vale o cálculo automático. Situação efetiva = override quando existe, senão o cálculo. Toda leitura da situação (resposta, filtros, visões salvas, relatórios, notificações) usa a efetiva; a calculada continua exposta como `calculatedWarrantyStatus` para mostrar "Automático: fora de garantia".
3. **Motivo obrigatório** ao definir override (até 255 caracteres); atalhos de motivo na interface: Sem NF, Cortesia, Mau uso, Cliente estratégico (texto livre continua permitido). Remover o override volta ao automático e dispensa motivo.
4. **Histórico:** tabela `rma_item_warranty_history` (`rma_item_id`, `previous_override`, `new_override`, `reason`, `changed_by`, `changed_at`), exibida na linha do tempo do RMA nas duas telas de detalhe (padrão dos eventos de prazo). Sem edição ou exclusão de eventos.
5. **Permissão:** reaproveitar `rma.editar` (sem 21ª permissão); atualizar a matriz de equivalência (`PermissionEquivalenceIntegrationTest`) e o espelho do frontend se aplicável. RMA encerrado não permite novo override.
6. **API:** `PUT /api/rmas/{rmaId}/items/{itemId}/warranty` com `{ override: IN_WARRANTY | OUT_OF_WARRANTY | null, reason }`; 400 com mensagens em português; 404 se o item não pertence ao RMA. Migração incremental nova (próximo número livre) aditiva e sem editar a V1/V2.
7. **Interface (estilo Jira):** no cartão do item, o chip de garantia vira valor clicável (sem botão extra); abre edição inline com seletor (Automático / Em garantia / Fora de garantia), motivo (com os atalhos) e Cancelar à esquerda, Salvar à direita. Item com override mostra o marcador "Ajustada manualmente" e, ao passar o mouse, motivo, autor e data; o chip mostra também a calculada quando divergir.

## Fora de escopo
Anexos de comprovação, aprovação por segundo usuário, regras por perfil de cliente e alteração da fórmula automática.

## Testes (TDD)
Backend: override vence o cálculo; remover volta ao automático; motivo obrigatório; item de outro RMA; RMA encerrado; histórico gravado na mesma transação; filtros e visões salvas usam a situação efetiva; matriz de permissões. Frontend: edição inline, validação do motivo, marcador e dica, linha do tempo nas duas telas e filtro pela efetiva. `mvn verify`, suíte Angular e build verdes; migração conferida em MySQL real (projeto Docker isolado, `down -v` no fim).
