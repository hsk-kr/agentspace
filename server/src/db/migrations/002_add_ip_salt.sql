ALTER TABLE security_codes ADD COLUMN IF NOT EXISTS ip_salt VARCHAR(64);

UPDATE security_codes SET ip_salt = gen_random_uuid()::VARCHAR WHERE ip_salt IS NULL;
