-- Add gender column and tighten age restriction to 15–65.

alter table public.profiles
    add column if not exists gender text
        check (gender in ('Male','Female','Prefer not to say'));

-- Drop the old unconstrained age check (if any) and re-add with 15–65 bounds.
alter table public.profiles
    drop constraint if exists profiles_age_check;

alter table public.profiles
    add constraint profiles_age_check check (age >= 15 and age <= 65);

-- Update the signup trigger to save age + gender from registration metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, name, username, age, gender)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        nullif(new.raw_user_meta_data->>'age', '')::int,
        nullif(new.raw_user_meta_data->>'gender', '')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;
