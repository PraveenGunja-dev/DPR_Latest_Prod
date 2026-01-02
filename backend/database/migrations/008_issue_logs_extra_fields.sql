-- Add missing columns to issue_logs table
-- These columns store the full issue form data

-- Add start_date column (when issue started)
ALTER TABLE issue_logs ADD COLUMN IF NOT EXISTS start_date DATE;

-- Add finished_date column (when issue was finished)
ALTER TABLE issue_logs ADD COLUMN IF NOT EXISTS finished_date DATE;

-- Add delayed_days column (calculated days between start and finish)
ALTER TABLE issue_logs ADD COLUMN IF NOT EXISTS delayed_days INTEGER DEFAULT 0;

-- Add action_required column (what action is needed)
ALTER TABLE issue_logs ADD COLUMN IF NOT EXISTS action_required TEXT;

-- Add remarks column (additional notes)
ALTER TABLE issue_logs ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Add attachment_url column (for file attachments)
ALTER TABLE issue_logs ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- Add attachment_name column (original filename)
ALTER TABLE issue_logs ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255);

-- Done
SELECT 'Issue logs columns added successfully' as status;
