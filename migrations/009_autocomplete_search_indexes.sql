-- Prefix indexes for GET /api/products/search. The generated columns keep the
-- query predicate sargable while preserving the source display values.
ALTER TABLE brands
  ADD COLUMN name_search VARCHAR(255)
    GENERATED ALWAYS AS (LOWER(TRIM(name))) STORED,
  ADD INDEX idx_brands_name_search (name_search);

ALTER TABLE products
  ADD COLUMN name_search VARCHAR(500)
    GENERATED ALWAYS AS (LOWER(TRIM(name))) STORED,
  ADD INDEX idx_products_name_search (name_search);
