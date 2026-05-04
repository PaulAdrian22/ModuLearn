-- Seed data run by `supabase db reset` after migrations.
-- Keep this minimal: module shells + a few baseline questions.
-- Full lesson content (sections/questions JSON) is imported via
-- scripts/seed_modules_from_snapshots.js which reads
-- lessons/lesson*_after_import_snapshot.json.

insert into public.modules (title, description, lesson_order, tesda_reference, is_unlocked, difficulty)
values
    ('Install and Configure Computer Systems',
     'Learn to assemble and configure computer systems',
     1, 'TESDA-CHS-NC-II-Module-1', true,  'Easy'),
    ('Set-up Computer Networks',
     'Configure network connections and settings',
     2, 'TESDA-CHS-NC-II-Module-2', false, 'Easy'),
    ('Set-up Computer Servers',
     'Install and configure server systems',
     3, 'TESDA-CHS-NC-II-Module-3', false, 'Medium'),
    ('Maintain and Repair Computer Systems',
     'Diagnose and repair hardware issues',
     4, 'TESDA-CHS-NC-II-Module-4', false, 'Medium'),
    ('Lesson 5', 'Lesson 5 content',  5, 'TESDA-CHS-NC-II-Module-5', false, 'Medium'),
    ('Lesson 6', 'Lesson 6 content',  6, 'TESDA-CHS-NC-II-Module-6', false, 'Hard'),
    ('Lesson 7', 'Lesson 7 content',  7, 'TESDA-CHS-NC-II-Module-7', false, 'Hard');

-- Questions are stored as jsonb arrays on modules.diagnostic_questions /
-- review_questions / final_questions, populated by the AdminLessons editor.
-- The standalone `questions` table was removed in migration 20260428000300
-- because nothing actually populated it.

-- Sample simulations (mirrors legacy add_simulation_table.sql)
insert into public.simulations (module_id, title, description, activity_type, max_score, time_limit, instructions, simulation_order, is_locked)
select id, 'Identifying Sections of the Motherboard',
       'Learn to identify different sections and components of a computer motherboard',
       'Interactive Diagram', 10, 5,
       'Click on the correct sections of the motherboard as prompted', 1, false
from public.modules where lesson_order = 3
union all
select id, 'Preparing the Motherboard',
       'Practice the proper procedures for preparing a motherboard for installation',
       'Step-by-Step Activity', 10, 0,
       'Follow the steps to properly prepare the motherboard', 2, false
from public.modules where lesson_order = 3;
