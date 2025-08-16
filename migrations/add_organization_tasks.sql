-- Add organization task support
-- Make projectId nullable and add organizationId and taskScope to tasks table

ALTER TABLE tasks 
ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE tasks 
ADD COLUMN organization_id VARCHAR REFERENCES organizations(id);

ALTER TABLE tasks 
ADD COLUMN task_scope VARCHAR DEFAULT 'project';

-- Update existing tasks to have project scope
UPDATE tasks SET task_scope = 'project' WHERE task_scope IS NULL;

-- Add index for organization tasks
CREATE INDEX idx_tasks_organization_id ON tasks(organization_id);
CREATE INDEX idx_tasks_scope ON tasks(task_scope);