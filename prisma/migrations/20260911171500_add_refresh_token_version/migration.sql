-- Add refresh_token_version for S5 (refresh token revocation/rotation)
-- Se usa para revocar todos los refresh tokens emitidos en versión anterior
-- (logout, cambio de password, desactivación de usuario).
ALTER TABLE "Usuario" ADD COLUMN "refresh_token_version" INTEGER NOT NULL DEFAULT 1;