-- Auditoría de validaciones. Todas las restricciones son NOT VALID: protegen
-- los datos nuevos o editados, sin revisar ni tocar los registros históricos.

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

-- Fechas que no pueden estar en el futuro (depende del día, por eso trigger).
-- Sólo se controla al cargar o al cambiar la fecha: los registros viejos no se revisan.
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