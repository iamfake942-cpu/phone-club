USE phone_club;

ALTER TABLE orders
  MODIFY COLUMN payment_method ENUM('UPI', 'CARD', 'COD') NOT NULL;

ALTER TABLE payments
  MODIFY COLUMN payment_method ENUM('UPI', 'CARD', 'COD') NOT NULL;
