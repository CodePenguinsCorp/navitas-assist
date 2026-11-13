INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'cadastros.importar' FROM access_profiles WHERE legacy_code IN ('ADMIN');
