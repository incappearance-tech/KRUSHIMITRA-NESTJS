-- Enable the pg_trgm extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Vehicle Indexes
-- Create indexes on the model and type columns using gin_trgm_ops
CREATE INDEX IF NOT EXISTS "ix_vehicle_model_trgm" ON "Vehicle" USING GIN ("model" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ix_vehicle_type_trgm" ON "Vehicle" USING GIN ("type" gin_trgm_ops);

-- TransporterProfile Indexes
CREATE INDEX IF NOT EXISTS "ix_transporter_biz_trgm" ON "TransporterProfile" USING GIN ("businessName" gin_trgm_ops);

-- LabourProfile Indexes
-- For string arrays, GIN works out of the box
CREATE INDEX IF NOT EXISTS "ix_labour_skills" ON "LabourProfile" USING GIN ("skills");
-- For fuzzy matching experience string
CREATE INDEX IF NOT EXISTS "ix_labour_exp_trgm" ON "LabourProfile" USING GIN ("experience" gin_trgm_ops);

-- User Indexes (for Name matching)
CREATE INDEX IF NOT EXISTS "ix_user_name_trgm" ON "User" USING GIN ("name" gin_trgm_ops);
