-- Execute against the local application database with the backend stopped.
-- Remove only the obsolete RMA-level warranty columns, preserving all records.
SELECT GROUP_CONCAT(CONCAT('DROP COLUMN `', COLUMN_NAME, '`') SEPARATOR ', ')
INTO @nav29_columns
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'rmas'
  AND COLUMN_NAME IN (
    'warranty_status',
    'warranty_overridden',
    'warranty_justification',
    'warranty_updated_by',
    'warranty_updated_at'
  );

SET @nav29_sql = IF(@nav29_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `rmas` ', @nav29_columns));
PREPARE nav29_cleanup FROM @nav29_sql;
EXECUTE nav29_cleanup;
DEALLOCATE PREPARE nav29_cleanup;
