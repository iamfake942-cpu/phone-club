USE phone_club;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pinelabs_redirect_token TEXT NULL AFTER pinelabs_order_id,
  ADD COLUMN IF NOT EXISTS pinelabs_redirect_url TEXT NULL AFTER pinelabs_redirect_token;
