-- Task #73: speed up Google fallback dedupe as the lead/user tables grow.
--
-- Expression B-tree indexes on the normalized last-10-digits form of
-- the phone column. The customer-facing Google fallback (and the admin
-- bulk import) call findKnownPhones() which filters with the exact
-- same expression: right(regexp_replace(coalesce(<col>,''), '[^0-9]','','g'), 10)
-- so the planner can use these indexes for an index range scan instead
-- of a sequential scan.
--
-- providers.mobile_numbers is a text[] of one row per onboarded
-- provider — that table grows with humans, not API calls, so the
-- unnest scan stays cheap and we don't add a more complex GIN index.

CREATE INDEX IF NOT EXISTS "pending_providers_norm_phone_idx"
  ON "pending_providers"
  ((right(regexp_replace(coalesce("mobile", ''), '[^0-9]', '', 'g'), 10)));

CREATE INDEX IF NOT EXISTS "local_users_norm_phone_idx"
  ON "local_users"
  ((right(regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g'), 10)));
