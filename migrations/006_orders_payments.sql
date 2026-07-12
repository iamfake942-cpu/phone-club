USE phone_club;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_quantity INT UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  merchant_order_reference VARCHAR(100) NOT NULL,
  payment_method ENUM('UPI', 'CARD', 'COD') NOT NULL,
  order_status ENUM('PENDING_PAYMENT', 'PLACED', 'PAYMENT_FAILED', 'CANCELLED') NOT NULL,
  payment_status ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
  subtotal_amount DECIMAL(12, 2) NOT NULL,
  discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  delivery_charge DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  final_amount DECIMAL(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  shipping_address_id BIGINT UNSIGNED NULL,
  shipping_address_snapshot JSON NOT NULL,
  pinelabs_order_id VARCHAR(100) NULL,
  pinelabs_redirect_token TEXT NULL,
  pinelabs_redirect_url TEXT NULL,
  provider_order_response JSON NULL,
  provider_status_response JSON NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY orders_merchant_order_reference_unique (merchant_order_reference),
  UNIQUE KEY orders_pinelabs_order_id_unique (pinelabs_order_id),
  KEY orders_user_id_index (user_id),
  KEY orders_shipping_address_id_index (shipping_address_id),
  CONSTRAINT orders_user_id_foreign
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT orders_shipping_address_id_foreign
    FOREIGN KEY (shipping_address_id) REFERENCES user_addresses(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  mrp DECIMAL(12, 2) NOT NULL,
  line_total DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY order_items_order_id_index (order_id),
  KEY order_items_product_id_index (product_id),
  CONSTRAINT order_items_order_id_foreign
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE,
  CONSTRAINT order_items_product_id_foreign
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE RESTRICT,
  CONSTRAINT order_items_quantity_check CHECK (quantity BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(50) NOT NULL,
  payment_method ENUM('UPI', 'CARD', 'COD') NOT NULL,
  provider_payment_id VARCHAR(100) NULL,
  merchant_payment_reference VARCHAR(100) NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
  provider_payment_response JSON NULL,
  provider_status_response JSON NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY payments_order_id_unique (order_id),
  UNIQUE KEY payments_provider_payment_id_unique (provider_payment_id),
  UNIQUE KEY payments_merchant_payment_reference_unique (merchant_payment_reference),
  CONSTRAINT payments_order_id_foreign
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
