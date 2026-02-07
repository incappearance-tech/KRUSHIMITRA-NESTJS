-- Delete all data from tables (in order to respect foreign key constraints)
DELETE FROM "TransportTrip";
DELETE FROM "Vehicle";
DELETE FROM "TransporterProfile";
DELETE FROM "LabourProfile";
DELETE FROM "Order";
DELETE FROM "Machine";
DELETE FROM "AuditLog";
DELETE FROM "User";

-- Reset sequences if needed
-- ALTER SEQUENCE ... RESTART WITH 1;
