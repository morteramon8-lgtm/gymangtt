CREATE TABLE IF NOT EXISTS public.member_routine_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  routine_id uuid,
  action text NOT NULL,
  routine_name text,
  exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.member_routine_history TO authenticated;
GRANT ALL ON public.member_routine_history TO service_role;
ALTER TABLE public.member_routine_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "routine history read own or admin" ON public.member_routine_history;
CREATE POLICY "routine history read own or admin" ON public.member_routine_history
FOR SELECT TO authenticated USING (
  (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
  OR EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.user_id = auth.uid())
);
CREATE INDEX IF NOT EXISTS member_routine_history_member_idx ON public.member_routine_history(member_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.routine_snapshot(_routine_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'sets', sets, 'reps', reps) ORDER BY position), '[]'::jsonb)
  FROM public.routine_exercises WHERE routine_id = _routine_id
$$;
REVOKE EXECUTE ON FUNCTION public.routine_snapshot(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_member_routine()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec record; act text; rname text; snap jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; act := 'desasignada';
  ELSIF TG_OP = 'UPDATE' AND NEW.routine_id IS NOT DISTINCT FROM OLD.routine_id THEN RETURN NEW;
  ELSE rec := NEW; act := CASE WHEN TG_OP = 'UPDATE' THEN 'cambiada' ELSE 'asignada' END;
  END IF;
  SELECT name INTO rname FROM public.routines WHERE id = rec.routine_id;
  snap := public.routine_snapshot(rec.routine_id);
  -- Si la rutina ya no existe, se conserva la última copia guardada
  IF rname IS NULL THEN
    SELECT h.routine_name, h.exercises INTO rname, snap FROM public.member_routine_history h
    WHERE h.member_id = rec.member_id AND h.routine_id = rec.routine_id
    ORDER BY h.created_at DESC LIMIT 1;
  END IF;
  INSERT INTO public.member_routine_history (gym_id, member_id, routine_id, action, routine_name, exercises, actor_id)
  SELECT m.gym_id, rec.member_id, rec.routine_id, act, rname, COALESCE(snap, '[]'::jsonb), auth.uid()
  FROM public.members m WHERE m.id = rec.member_id;
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_member_routine() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS member_routines_history ON public.member_routines;
CREATE TRIGGER member_routines_history AFTER INSERT OR UPDATE OR DELETE ON public.member_routines
FOR EACH ROW EXECUTE FUNCTION public.log_member_routine();

-- Al eliminar una rutina, primero se desasigna (con la rutina y sus ejercicios todavía presentes)
CREATE OR REPLACE FUNCTION public.detach_routine_before_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.member_routines WHERE routine_id = OLD.id;
  RETURN OLD;
END; $$;
REVOKE EXECUTE ON FUNCTION public.detach_routine_before_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS routines_detach_before_delete ON public.routines;
CREATE TRIGGER routines_detach_before_delete BEFORE DELETE ON public.routines
FOR EACH ROW EXECUTE FUNCTION public.detach_routine_before_delete();