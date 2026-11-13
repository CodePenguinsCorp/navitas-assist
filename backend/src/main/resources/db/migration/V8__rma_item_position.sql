-- Ordem dos itens como o usuário informou (o primeiro é o item principal). Itens existentes ficam em 0 e seguem
-- desempatados pelo id, que era a ordem anterior.
ALTER TABLE rma_items ADD COLUMN item_position INT NOT NULL DEFAULT 0;
