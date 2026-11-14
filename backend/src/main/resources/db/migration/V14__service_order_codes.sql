UPDATE rmas
SET code = CONCAT('OS-', SUBSTRING(code, 5))
WHERE code LIKE 'RMA-%';
