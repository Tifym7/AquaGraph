SELECT 'CREATE DATABASE aquagraph'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'aquagraph')\gexec

\connect aquagraph

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    region VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_user_verifications (
    email VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    region VARCHAR(255) NOT NULL,
    verification_code VARCHAR(16) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
    id BIGSERIAL PRIMARY KEY,
    campaign_name VARCHAR(255) UNIQUE NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    river_name VARCHAR(255) NOT NULL,
    coordinates TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    likes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_participants (
    campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    participant_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (campaign_id, participant_email)
);

INSERT INTO campaigns (campaign_name, organization_name, river_name, coordinates, start_date, end_date, likes)
VALUES
  ('Bistrița Vie', 'Asociația Râurilor Curate', 'Bistrița', '47.1,25.5', '2025-07-01', '2025-07-31', 76),
  ('Someșul Fără Deșeuri', 'Cluj Eco Network', 'Someș', '46.7,23.5', '2025-08-10', '2025-09-10', 112),
  ('Jiul Renăscut', 'Gorj Verde', 'Jiu', '44.6,23.2', '2025-06-20', '2025-07-20', 45),
  ('Buzăul Curat', 'EcoAct Buzău', 'Buzău', '45.1,26.8', '2025-09-15', '2025-10-15', 33),
  ('Curățăm Crisul Negru', 'Bihor Activ', 'Crișul Negru', '46.9,21.8', '2025-07-20', '2025-08-20', 58),
  ('Timiș Albastru', 'Banat Ecologic', 'Timiș', '45.7,21.2', '2025-05-15', '2025-06-15', 91)
ON CONFLICT (campaign_name) DO NOTHING;
