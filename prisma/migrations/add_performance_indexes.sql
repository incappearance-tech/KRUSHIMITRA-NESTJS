-- ─────────────────────────────────────────────────────────────────────────────
-- KrushiMitra — Advanced Performance Indexes
-- Run once on Supabase SQL Editor.
-- Prisma cannot manage GIN / GIST / pg_trgm indexes, so they live here.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Enable pg_trgm extension (trigram search — makes ILIKE ~100x faster)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Enable PostGIS (already enabled on Supabase — included for completeness)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────────────────────
-- PostGIS GIST Indexes — spatial search with ST_DWithin (10-100x faster)
-- ─────────────────────────────────────────────────────────────────────────────

-- User location: used by Labour + Transporter browse (most critical)
CREATE INDEX IF NOT EXISTS idx_user_location_gist
  ON "User"
  USING GIST (geography(ST_MakePoint("locationLng", "locationLat")))
  WHERE "locationLng" IS NOT NULL AND "locationLat" IS NOT NULL;

-- TransporterProfile location: used by transporter browse
CREATE INDEX IF NOT EXISTS idx_transporter_profile_location_gist
  ON "TransporterProfile"
  USING GIST (geography(ST_MakePoint("lng", "lat")))
  WHERE "lng" IS NOT NULL AND "lat" IS NOT NULL;

-- LabourProfile location: used by labour browse
CREATE INDEX IF NOT EXISTS idx_labour_profile_location_gist
  ON "LabourProfile"
  USING GIST (geography(ST_MakePoint("lng", "lat")))
  WHERE "lng" IS NOT NULL AND "lat" IS NOT NULL;

-- Machine location (falls back to owner if null): used by machine browse
CREATE INDEX IF NOT EXISTS idx_machine_location_gist
  ON "Machine"
  USING GIST (geography(ST_MakePoint("lng", "lat")))
  WHERE "lng" IS NOT NULL AND "lat" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- GIN Trigram Indexes — turns ILIKE '%q%' from O(n) scan to O(log n)
-- ─────────────────────────────────────────────────────────────────────────────

-- FarmerMaterial name search (main text search field)
CREATE INDEX IF NOT EXISTS idx_farmer_material_name_trgm
  ON "FarmerMaterial"
  USING GIN ("materialName" gin_trgm_ops);

-- Machine brand + model search (displayed as single string in UI)
CREATE INDEX IF NOT EXISTS idx_machine_brand_trgm
  ON "Machine"
  USING GIN ("brand" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_machine_model_trgm
  ON "Machine"
  USING GIN ("model" gin_trgm_ops);

-- Vehicle type + model search
CREATE INDEX IF NOT EXISTS idx_vehicle_type_trgm
  ON "Vehicle"
  USING GIN ("type" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vehicle_model_trgm
  ON "Vehicle"
  USING GIN ("model" gin_trgm_ops);

-- TransporterProfile business name search
CREATE INDEX IF NOT EXISTS idx_transporter_business_name_trgm
  ON "TransporterProfile"
  USING GIN ("businessName" gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- GIN Array Indexes — for LabourProfile.skills && $skills_array (overlap)
-- ─────────────────────────────────────────────────────────────────────────────

-- Labour skills array: enables && (overlap) operator to use index
CREATE INDEX IF NOT EXISTS idx_labour_profile_skills_gin
  ON "LabourProfile"
  USING GIN ("skills");

-- ─────────────────────────────────────────────────────────────────────────────
-- Partial indexes — only index rows that are actually browsable
-- ─────────────────────────────────────────────────────────────────────────────

-- Available vehicles (isAvailable is a static boolean — safe as partial index predicate)
CREATE INDEX IF NOT EXISTS idx_vehicle_browsable
  ON "Vehicle" ("transporterId", "type", "ratePerKm", "rating")
  WHERE "isAvailable" = true;

-- Available labour profiles
CREATE INDEX IF NOT EXISTS idx_labour_browsable
  ON "LabourProfile" ("rating", "pricePerDay")
  WHERE "isAvailable" = true;

-- Available machine listings (status is a static enum value — safe)
CREATE INDEX IF NOT EXISTS idx_machine_active_listings
  ON "Machine" ("category", "price", "listingType")
  WHERE "status" = 'AVAILABLE';

-- All farmer materials indexed for fast range queries on expiresAt
-- (Cannot use NOW() in partial index predicates — use a regular index instead)
CREATE INDEX IF NOT EXISTS idx_farmer_material_expires_farmer
  ON "FarmerMaterial" ("expiresAt", "farmerId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification: check that all indexes were created
-- ─────────────────────────────────────────────────────────────────────────────
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
