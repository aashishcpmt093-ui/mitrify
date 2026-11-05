-- Removes the API portal data (customers, ledger, and the columns tying keys and usage to customers).
-- This deletes customer accounts and the credit history: export them first if you need them.
-- Turn the gateway off (MITRIFY_GATEWAY_ENABLED unset) before running this, or the server will add
-- them again on its next start.
DROP INDEX IF EXISTS gateway_clients_customer_idx;
ALTER TABLE gateway_clients DROP COLUMN IF EXISTS customer_id;
ALTER TABLE gateway_usage DROP COLUMN IF EXISTS billed_cost_usd;
DROP TABLE IF EXISTS gateway_ledger;
DROP TABLE IF EXISTS gateway_customers;
