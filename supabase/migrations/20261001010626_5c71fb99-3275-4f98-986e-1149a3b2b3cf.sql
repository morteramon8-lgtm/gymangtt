ALTER TABLE public.routines
  ADD COLUMN created_by_role text NOT NULL DEFAULT 'admin',
  ADD COLUMN member_id uuid REFERENCES public.members(id) ON DELETE CASCADE;
ALTER TABLE public.routines ADD CONSTRAINT routines_created_by_role_chk
  CHECK (created_by_role IN ('admin','member'));
ALTER TABLE public.routines ADD CONSTRAINT routines_member_owner_chk
  CHECK (created_by_role = 'admin' OR member_id IS NOT NULL);
CREATE INDEX routines_member_id_idx ON public.routines(member_id);

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.members WHERE user_id = auth.uid() AND active LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.current_member_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.routines_owner_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mid uuid; mgym uuid;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    IF TG_OP = 'UPDATE' AND (NEW.created_by_role IS DISTINCT FROM OLD.created_by_role
       OR NEW.member_id IS DISTINCT FROM OLD.member_id) THEN
      RAISE EXCEPTION 'No se puede cambiar el autor de una rutina.';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.member_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.members WHERE id = NEW.member_id AND gym_id = NEW.gym_id) THEN
      RAISE EXCEPTION 'El socio no pertenece a este gimnasio.';
    END IF;
    RETURN NEW;
  END IF;
  SELECT id, gym_id INTO mid, mgym FROM public.members WHERE user_id = auth.uid() AND active LIMIT 1;
  IF mid IS NULL THEN RAISE EXCEPTION 'Tu cuenta no está vinculada a una ficha de socio activa.'; END IF;
  IF TG_OP = 'UPDATE' AND (OLD.created_by_role <> 'member' OR OLD.member_id IS DISTINCT FROM mid) THEN
    RAISE EXCEPTION 'Sólo podés modificar tus propias rutinas.';
  END IF;
  NEW.created_by_role := 'member';
  NEW.member_id := mid;
  NEW.gym_id := mgym;
  IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); ELSE NEW.created_by := OLD.created_by; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER routines_owner_guard BEFORE INSERT OR UPDATE ON public.routines
  FOR EACH ROW EXECUTE FUNCTION public.routines_owner_guard();

CREATE POLICY "routines member own" ON public.routines FOR ALL TO authenticated
  USING (created_by_role = 'member' AND member_id = public.current_member_id())
  WITH CHECK (created_by_role = 'member' AND member_id = public.current_member_id());

CREATE POLICY "exercises member own" ON public.routine_exercises FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.routines r WHERE r.id = routine_exercises.routine_id
    AND r.created_by_role = 'member' AND r.member_id = public.current_member_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.routines r WHERE r.id = routine_exercises.routine_id
    AND r.created_by_role = 'member' AND r.member_id = public.current_member_id()));