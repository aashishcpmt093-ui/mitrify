-- Automatic model choice: which prices came from a provider's own list, whether the model is a chat
-- model, and models the owner never wants chosen automatically. gateway_* tables only.
-- The server also applies these statements on start when MITRIFY_GATEWAY_ENABLED=1.
-- Undo: migrations/0014_auto_models.down.sql
ALTER TABLE gateway_prices ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false;
ALTER TABLE gateway_prices ADD COLUMN IF NOT EXISTS chat_capable boolean;
ALTER TABLE gateway_prices ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;
