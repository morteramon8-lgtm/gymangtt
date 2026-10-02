CREATE OR REPLACE FUNCTION public.today_ar()
RETURNS DATE LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;
GRANT EXECUTE ON FUNCTION public.today_ar() TO authenticated, service_role;

ALTER TABLE public.members         ALTER COLUMN join_date   SET DEFAULT public.today_ar();
ALTER TABLE public.payments        ALTER COLUMN paid_on     SET DEFAULT public.today_ar();
ALTER TABLE public.attendance      ALTER COLUMN attended_on SET DEFAULT public.today_ar();
ALTER TABLE public.member_progress ALTER COLUMN measured_on SET DEFAULT public.today_ar();

COMMENT ON FUNCTION public.recalc_member_expiry(uuid) IS
  'Recalcula el vencimiento del socio sumando los meses de cada pago no anulado, encadenando desde el vencimiento anterior cuando sigue vigente y desde la fecha de pago cuando ya venció.';

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.run_expiry_scan(_gym_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); s RECORD; m RECORD; d int; bucket text; ttl text; bdy text;
        n_created int := 0; n_checked int := 0; n_gyms int := 0; rc int;
BEGIN
  IF uid IS NOT NULL THEN
    IF NOT public.has_role(uid, 'admin') THEN
      RAISE EXCEPTION 'Esta acción es sólo para el administrador del gimnasio.';
    END IF;
    _gym_id := public.current_gym_id();
    IF _gym_id IS NULL THEN RAISE EXCEPTION 'No encontramos tu gimnasio.'; END IF;
  END IF;

  FOR s IN SELECT g.id AS gym_id,
                  coalesce(ns.expiry_enabled, true) AS expiry_enabled,
                  coalesce(ns.days_before, 5) AS days_before,
                  coalesce(ns.notify_on_due_date, true) AS notify_on_due_date,
                  coalesce(ns.notify_overdue, true) AS notify_overdue
           FROM public.gyms g LEFT JOIN public.gym_notification_settings ns ON ns.gym_id = g.id
           WHERE _gym_id IS NULL OR g.id = _gym_id LOOP
    n_gyms := n_gyms + 1;
    CONTINUE WHEN NOT s.expiry_enabled;
    FOR m IN SELECT id, user_id, expires_at FROM public.members
             WHERE gym_id = s.gym_id AND active AND expires_at IS NOT NULL LOOP
      n_checked := n_checked + 1;
      d := m.expires_at - public.today_ar();
      bucket := CASE WHEN d > 0 AND d <= s.days_before THEN 'previo'
                     WHEN d = 0 AND s.notify_on_due_date THEN 'hoy'
                     WHEN d < 0 AND s.notify_overdue THEN 'vencido' END;
      CONTINUE WHEN bucket IS NULL;
      ttl := CASE bucket WHEN 'previo' THEN 'Tu membresía vence en ' || d || ' día' || CASE WHEN d = 1 THEN '' ELSE 's' END
                         WHEN 'hoy' THEN 'Tu membresía vence hoy' ELSE 'Tu membresía está vencida' END;
      bdy := CASE WHEN bucket = 'vencido'
                  THEN 'Tu membresía venció el ' || to_char(m.expires_at, 'DD/MM/YYYY') || '. Acercate al gimnasio para renovarla.'
                  ELSE 'Tu membresía es válida hasta el ' || to_char(m.expires_at, 'DD/MM/YYYY') || '. Renovala para seguir entrenando sin interrupciones.' END;
      INSERT INTO public.notifications (gym_id, member_id, user_id, kind, title, body, channel, status, error, dedup_key)
      VALUES (s.gym_id, m.id, m.user_id, 'vencimiento', ttl, bdy, 'in_app',
              CASE WHEN m.user_id IS NULL THEN 'pendiente' ELSE 'entregado' END,
              CASE WHEN m.user_id IS NULL THEN 'El socio todavía no tiene cuenta en la aplicación.' END,
              'venc:' || m.id || ':' || m.expires_at || ':' || bucket)
      ON CONFLICT (dedup_key) DO NOTHING;
      GET DIAGNOSTICS rc = ROW_COUNT;
      n_created := n_created + rc;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('created', n_created, 'checked', n_checked, 'gyms', n_gyms);
END; $$;

REVOKE ALL ON FUNCTION public.run_expiry_scan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_expiry_scan(uuid) TO authenticated, service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'gymos-expiry-scan-daily';
SELECT cron.schedule('gymos-expiry-scan-daily', '0 11 * * *', $$SELECT public.run_expiry_scan(NULL);$$);

ALTER TABLE public.members
  ADD CONSTRAINT members_first_name_check CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 80) NOT VALID,
  ADD CONSTRAINT members_last_name_check CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 80) NOT VALID,
  ADD CONSTRAINT members_email_check CHECK (email IS NULL OR (char_length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$')) NOT VALID,
  ADD CONSTRAINT members_phone_check CHECK (phone IS NULL OR (phone ~ '^[0-9+(). -]+$' AND char_length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 6 AND 20)) NOT VALID,
  ADD CONSTRAINT members_birth_date_check CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01') NOT VALID,
  ADD CONSTRAINT members_join_date_check CHECK (join_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31') NOT VALID,
  ADD CONSTRAINT members_expires_at_check CHECK (expires_at IS NULL OR expires_at BETWEEN DATE '2000-01-01' AND DATE '2100-12-31') NOT VALID;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_range_check CHECK (amount > 0 AND amount <= 100000000) NOT VALID,
  ADD CONSTRAINT payments_paid_on_range_check CHECK (paid_on BETWEEN DATE '2000-01-01' AND DATE '2100-12-31') NOT VALID;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_price_range_check CHECK (price >= 0 AND price <= 100000000) NOT VALID,
  ADD CONSTRAINT plans_months_range_check CHECK (months BETWEEN 1 AND 60) NOT VALID;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_date_range_check CHECK (attended_on >= DATE '2000-01-01') NOT VALID;

ALTER TABLE public.member_progress
  ADD CONSTRAINT progress_date_range_check CHECK (measured_on >= DATE '1900-01-01') NOT VALID,
  ADD CONSTRAINT progress_weight_check CHECK (weight_kg IS NULL OR weight_kg BETWEEN 1 AND 600) NOT VALID,
  ADD CONSTRAINT progress_body_fat_check CHECK (body_fat IS NULL OR body_fat BETWEEN 1 AND 80) NOT VALID,
  ADD CONSTRAINT progress_chest_check CHECK (chest_cm IS NULL OR chest_cm BETWEEN 20 AND 300) NOT VALID,
  ADD CONSTRAINT progress_waist_check CHECK (waist_cm IS NULL OR waist_cm BETWEEN 20 AND 300) NOT VALID,
  ADD CONSTRAINT progress_arm_check CHECK (arm_cm IS NULL OR arm_cm BETWEEN 5 AND 150) NOT VALID;

ALTER TABLE public.routines
  ADD CONSTRAINT routines_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120) NOT VALID;

ALTER TABLE public.routine_exercises
  ADD CONSTRAINT routine_exercises_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120) NOT VALID,
  ADD CONSTRAINT routine_exercises_sets_check CHECK (sets BETWEEN 1 AND 100) NOT VALID,
  ADD CONSTRAINT routine_exercises_reps_check CHECK (char_length(btrim(reps)) BETWEEN 1 AND 30) NOT VALID,
  ADD CONSTRAINT routine_exercises_weight_check CHECK (weight IS NULL OR char_length(weight) <= 30) NOT VALID,
  ADD CONSTRAINT routine_exercises_rest_check CHECK (rest IS NULL OR char_length(rest) <= 30) NOT VALID;

CREATE OR REPLACE FUNCTION public.guard_no_future_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE col text := TG_ARGV[0]; label text := TG_ARGV[1];
        new_v date; old_v date;
BEGIN
  new_v := (to_jsonb(NEW) ->> col)::date;
  IF TG_OP = 'UPDATE' THEN old_v := (to_jsonb(OLD) ->> col)::date; END IF;
  IF new_v IS NOT NULL AND new_v IS DISTINCT FROM old_v AND new_v > public.today_ar() THEN
    RAISE EXCEPTION '% no puede ser una fecha futura.', label USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER members_birth_not_future BEFORE INSERT OR UPDATE OF birth_date ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_no_future_date('birth_date', 'La fecha de nacimiento');
CREATE TRIGGER payments_paid_on_not_future BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_no_future_date('paid_on', 'La fecha de pago');
CREATE TRIGGER attendance_not_future BEFORE INSERT OR UPDATE OF attended_on ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.guard_no_future_date('attended_on', 'La fecha de asistencia');
CREATE TRIGGER progress_not_future BEFORE INSERT OR UPDATE OF measured_on ON public.member_progress
  FOR EACH ROW EXECUTE FUNCTION public.guard_no_future_date('measured_on', 'La fecha de la medición');

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

COMMENT ON SCHEMA public IS 'Gym management app schema (imported).';

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.member_check_in()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m record; _row public.attendance; _today date := public.today_ar();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT id, gym_id, active INTO _m FROM public.members WHERE user_id = auth.uid() LIMIT 1;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'Tu cuenta no está vinculada a una ficha de socio.'; END IF;
  IF NOT _m.active THEN RAISE EXCEPTION 'Tu ficha de socio está inactiva. Consultá en el gimnasio.'; END IF;
  SELECT * INTO _row FROM public.attendance WHERE member_id = _m.id AND attended_on = _today;
  IF FOUND THEN
    RETURN jsonb_build_object('status','already','attended_on',_row.attended_on,'check_in',_row.check_in);
  END IF;
  INSERT INTO public.attendance (gym_id, member_id, attended_on, check_in, created_by)
  VALUES (_m.gym_id, _m.id, _today, now(), auth.uid())
  ON CONFLICT (member_id, attended_on) DO NOTHING
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    SELECT * INTO _row FROM public.attendance WHERE member_id = _m.id AND attended_on = _today;
    RETURN jsonb_build_object('status','already','attended_on',_row.attended_on,'check_in',_row.check_in);
  END IF;
  RETURN jsonb_build_object('status','created','attended_on',_row.attended_on,'check_in',_row.check_in);
END $$;

REVOKE ALL ON FUNCTION public.member_check_in() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_check_in() TO authenticated;

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