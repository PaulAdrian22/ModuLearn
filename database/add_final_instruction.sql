-- Add finalInstruction column for admin-configurable message on final assessment
ALTER TABLE module 
ADD COLUMN finalInstruction TEXT DEFAULT NULL COMMENT 'Custom instruction/message shown to students before the final assessment';
