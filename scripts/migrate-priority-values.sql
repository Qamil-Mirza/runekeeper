-- Migrate priority values from P0/P1/P2 to high/medium/low
-- Run this against your database after deploying the code changes.

UPDATE tasks SET priority = 'high' WHERE priority = 'P0';
UPDATE tasks SET priority = 'medium' WHERE priority = 'P1';
UPDATE tasks SET priority = 'low' WHERE priority = 'P2';

-- Update the default (drizzle-kit push will handle this, but just in case)
ALTER TABLE tasks ALTER COLUMN priority SET DEFAULT 'medium';
