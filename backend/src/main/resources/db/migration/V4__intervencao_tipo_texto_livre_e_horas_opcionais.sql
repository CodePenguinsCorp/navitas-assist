-- Tipo da intervenção deixa de ser lista fixa: passa a ser texto livre (até 80 caracteres) com sugestões vindas dos
-- valores já usados. As horas passam a ser opcionais (o cliente pede "tempo de serviço (opcional)").
ALTER TABLE rma_interventions DROP CONSTRAINT ck_interventions_type;

ALTER TABLE rma_interventions ALTER COLUMN type TYPE VARCHAR(80);

-- Os códigos antigos viram os textos em português que a interface e o laudo mostravam.
UPDATE rma_interventions SET type = CASE type
    WHEN 'RESOLDERING' THEN 'Ressolda'
    WHEN 'CLEANING' THEN 'Limpeza'
    WHEN 'REPROGRAMMING' THEN 'Regravação'
    WHEN 'FIRMWARE_UPDATE' THEN 'Atualização de firmware'
    WHEN 'HARNESS_REPLACEMENT' THEN 'Troca de chicote'
    WHEN 'OTHER' THEN 'Outro'
    ELSE type
END;

ALTER TABLE rma_interventions ALTER COLUMN hours DROP NOT NULL;
