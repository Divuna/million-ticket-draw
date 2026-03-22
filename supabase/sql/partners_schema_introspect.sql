-- Run in Supabase SQL Editor to read ACTUAL public.partners schema from the database.
-- Use this output as the source of truth for NOT NULL, defaults, and enum/udt types.

SELECT
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  a.attnotnull AS not_null,
  pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default
FROM pg_catalog.pg_attribute a
LEFT JOIN pg_catalog.pg_attrdef ad
  ON a.attrelid = ad.adrelid
 AND a.attnum = ad.adnum
WHERE a.attrelid = 'public.partners'::regclass
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;

-- Enum type for partner status (if column uses an enum)
SELECT
  t.typname AS enum_name,
  e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname = 'partner_status'
ORDER BY e.enumsortorder;
