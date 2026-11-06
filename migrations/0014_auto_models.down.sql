-- Removes the automatic-choice columns. The owner's "skip" choices are lost; prices and the pool stay.
ALTER TABLE gateway_prices DROP COLUMN IF EXISTS blocked;
ALTER TABLE gateway_prices DROP COLUMN IF EXISTS chat_capable;
ALTER TABLE gateway_prices DROP COLUMN IF EXISTS auto;
