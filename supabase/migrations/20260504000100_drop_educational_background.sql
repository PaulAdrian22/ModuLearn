-- Remove educational_background column from profiles; replaced by gender + age
alter table public.profiles drop column if exists educational_background;
