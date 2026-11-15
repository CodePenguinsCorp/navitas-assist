-- Tipo de falha e causa provável do diagnóstico deixam de ser listas fixas: passam a ser texto livre (até 80
-- caracteres) com sugestões vindas dos valores já usados, como a categoria do produto.
ALTER TABLE diagnoses DROP CONSTRAINT ck_diagnoses_failure_type;
ALTER TABLE diagnoses DROP CONSTRAINT ck_diagnoses_probable_cause;

ALTER TABLE diagnoses ALTER COLUMN failure_type TYPE VARCHAR(80);
ALTER TABLE diagnoses ALTER COLUMN probable_cause TYPE VARCHAR(80);

-- Os códigos antigos viram os textos em português que a interface mostrava.
UPDATE diagnoses SET failure_type = CASE failure_type
    WHEN 'POWER_SUPPLY' THEN 'Fonte de alimentação'
    WHEN 'PWM' THEN 'PWM'
    WHEN 'SENSOR' THEN 'Sensor'
    WHEN 'COMMUNICATION' THEN 'Comunicação'
    WHEN 'DISPLAY' THEN 'Display'
    WHEN 'FIRMWARE' THEN 'Firmware'
    WHEN 'MECHANICAL' THEN 'Mecânica'
    WHEN 'OTHER' THEN 'Outro'
    ELSE failure_type
END
WHERE failure_type IS NOT NULL;

UPDATE diagnoses SET probable_cause = CASE probable_cause
    WHEN 'COMPONENT' THEN 'Componente'
    WHEN 'SOLDER' THEN 'Solda'
    WHEN 'HUMIDITY' THEN 'Umidade'
    WHEN 'OVERLOAD' THEN 'Sobrecarga'
    WHEN 'ESD' THEN 'ESD'
    WHEN 'INCORRECT_USAGE' THEN 'Uso incorreto'
    WHEN 'OTHER' THEN 'Outro'
    ELSE probable_cause
END
WHERE probable_cause IS NOT NULL;
