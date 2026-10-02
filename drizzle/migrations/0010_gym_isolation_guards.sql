CREATE OR REPLACE FUNCTION public.guard_member_same_gym()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.members WHERE id = NEW.member_id AND gym_id = NEW.gym_id) THEN
    RAISE EXCEPTION 'El socio no pertenece a este gimnasio.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_member_same_gym() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER attendance_member_same_gym BEFORE INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_same_gym();
CREATE TRIGGER progress_member_same_gym BEFORE INSERT OR UPDATE ON public.member_progress
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_same_gym();
CREATE TRIGGER notifications_member_same_gym BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_same_gym();

CREATE OR REPLACE FUNCTION public.members_guard_user_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.user_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.gym_admins WHERE user_id = NEW.user_id)
     OR EXISTS (SELECT 1 FROM public.members WHERE user_id = NEW.user_id AND id <> NEW.id) THEN
    RAISE EXCEPTION 'Esa cuenta ya está vinculada a otra ficha o gimnasio.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.members_guard_user_link() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER members_guard_user_link BEFORE INSERT OR UPDATE OF user_id ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.members_guard_user_link();