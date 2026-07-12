USE phone_club;

ALTER TABLE users
  MODIFY COLUMN password_hash VARCHAR(255) NULL,
  ADD COLUMN auth_provider VARCHAR(50) NOT NULL DEFAULT 'local' AFTER password_hash,
  ADD COLUMN google_id VARCHAR(255) NULL AFTER auth_provider,
  ADD UNIQUE KEY users_google_id_unique (google_id);
