-- Removes the Mitrify AI Gateway tables. Marketplace tables are not touched.
-- This deletes gateway API keys, the usage ledger, prices and the audit log: export them first
-- if you need the billing history. Turn the gateway off (MITRIFY_GATEWAY_ENABLED unset) before
-- running this, or the server will create the tables again on its next start.
DROP TABLE IF EXISTS gateway_audit;
DROP TABLE IF EXISTS gateway_settings;
DROP TABLE IF EXISTS gateway_price_snapshots;
DROP TABLE IF EXISTS gateway_prices;
DROP TABLE IF EXISTS gateway_usage;
DROP TABLE IF EXISTS gateway_clients;
