CREATE TABLE IF NOT EXISTS security_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    text VARCHAR(1000) NOT NULL,
    client_ip VARCHAR(45) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Seed initial security code
INSERT INTO security_codes (code)
SELECT gen_random_uuid()::VARCHAR
WHERE NOT EXISTS (SELECT 1 FROM security_codes);
