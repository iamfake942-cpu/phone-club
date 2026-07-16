-- Supports indexed word-prefix autocomplete such as A06, A07 and iPhone in
-- product names that begin with a brand (for example, "Samsung Galaxy A06").
ALTER TABLE products
  ADD FULLTEXT INDEX idx_products_name_fulltext (name);
