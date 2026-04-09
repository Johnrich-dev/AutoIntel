ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;
