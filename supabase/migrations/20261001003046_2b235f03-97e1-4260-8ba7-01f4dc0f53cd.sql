DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'socio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.gyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Mi Gimnasio',
  address TEXT,
  phone TEXT,
  email TEXT,
  bank_alias TEXT,
  bank_cbu TEXT,
  bank_holder TEXT,
  payment_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.gyms TO authenticated;
GRANT ALL ON public.gyms TO service_role;
ALTER TABLE public.gyms ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE TABLE public.gym_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT ON public.gym_admins TO authenticated;
GRANT ALL ON public.gym_admins TO service_role;
ALTER TABLE public.gym_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_gym_id()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE result UUID;
BEGIN
  SELECT ga.gym_id INTO result FROM public.gym_admins ga WHERE ga.user_id = auth.uid() LIMIT 1;
  IF result IS NULL THEN
    SELECT m.gym_id INTO result FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1;
  END IF;
  RETURN result;
END; $fn$;
REVOKE ALL ON FUNCTION public.current_gym_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_gym_id() TO authenticated, service_role;

CREATE POLICY "gyms read own" ON public.gyms FOR SELECT TO authenticated
  USING (id = public.current_gym_id());
CREATE POLICY "gyms admin update" ON public.gyms FOR UPDATE TO authenticated
  USING (id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles read own or admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "roles read own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "gym admins read own gym" ON public.gym_admins FOR SELECT TO authenticated
  USING (gym_id = public.current_gym_id());

CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL DEFAULT public.current_gym_id() REFERENCES public.gyms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  months INT NOT NULL DEFAULT 1,
  payment_link TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans read gym" ON public.plans FOR SELECT TO authenticated
  USING (gym_id = public.current_gym_id());
CREATE POLICY "plans admin write" ON public.plans FOR ALL TO authenticated
  USING (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL DEFAULT public.current_gym_id() REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id UUID UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dni TEXT,
  email TEXT,
  phone TEXT,
  birth_date DATE,
  notes TEXT,
  goal TEXT,
  level TEXT,
  trainer_notes TEXT,
  photo_url TEXT,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT members_goal_check CHECK (goal IS NULL OR goal IN ('bajar_peso','masa_muscular','resistencia','fuerza','otro')),
  CONSTRAINT members_level_check CHECK (level IS NULL OR level IN ('principiante','intermedio','avanzado'))
);
CREATE UNIQUE INDEX members_email_unique ON public.members (gym_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX members_dni_unique ON public.members (gym_id, dni) WHERE dni IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own or gym admin" ON public.members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "members admin write" ON public.members FOR ALL TO authenticated
  USING (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL DEFAULT public.current_gym_id() REFERENCES public.gyms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  concept TEXT NOT NULL DEFAULT 'Cuota',
  amount NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'Efectivo',
  notes TEXT,
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  covers_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments read own or gym admin" ON public.payments FOR SELECT TO authenticated
  USING (
    (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
    OR EXISTS (SELECT 1 FROM public.members m WHERE m.id = payments.member_id AND m.user_id = auth.uid())
  );
CREATE POLICY "payments admin write" ON public.payments FOR ALL TO authenticated
  USING (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL DEFAULT public.current_gym_id() REFERENCES public.gyms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Fuerza',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routines TO authenticated;
GRANT ALL ON public.routines TO service_role;
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.routine_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  muscle_group TEXT,
  media_url TEXT,
  sets INT NOT NULL DEFAULT 3,
  reps TEXT NOT NULL DEFAULT '10',
  weight TEXT,
  rest TEXT,
  notes TEXT,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routine_exercises TO authenticated;
GRANT ALL ON public.routine_exercises TO service_role;
ALTER TABLE public.routine_exercises ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.member_routines (
  member_id UUID PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  routine_id UUID NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_routines TO authenticated;
GRANT ALL ON public.member_routines TO service_role;
ALTER TABLE public.member_routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routines admin all" ON public.routines FOR ALL TO authenticated
  USING (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "routines read assigned" ON public.routines FOR SELECT TO authenticated
  USING (
    (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
    OR EXISTS (
      SELECT 1 FROM public.member_routines mr
      JOIN public.members m ON m.id = mr.member_id
      WHERE mr.routine_id = routines.id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "exercises admin all" ON public.routine_exercises FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.routines r WHERE r.id = routine_exercises.routine_id
                 AND r.gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.routines r WHERE r.id = routine_exercises.routine_id
                 AND r.gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "exercises read assigned" ON public.routine_exercises FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.member_routines mr
    JOIN public.members m ON m.id = mr.member_id
    WHERE mr.routine_id = routine_exercises.routine_id AND m.user_id = auth.uid()
  ));

CREATE POLICY "assign read own or admin" ON public.member_routines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_routines.member_id
                 AND (m.user_id = auth.uid() OR (m.gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin')))));
CREATE POLICY "assign admin write" ON public.member_routines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_routines.member_id
                 AND m.gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_routines.member_id
                 AND m.gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin')));

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL DEFAULT public.current_gym_id() REFERENCES public.gyms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  attended_on DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, attended_on)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance read own or admin" ON public.attendance FOR SELECT TO authenticated
  USING (
    (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
    OR EXISTS (SELECT 1 FROM public.members m WHERE m.id = attendance.member_id AND m.user_id = auth.uid())
  );
CREATE POLICY "attendance admin write" ON public.attendance FOR ALL TO authenticated
  USING (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.member_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL DEFAULT public.current_gym_id() REFERENCES public.gyms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  measured_on DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC(6,2),
  body_fat NUMERIC(5,2),
  chest_cm NUMERIC(6,2),
  waist_cm NUMERIC(6,2),
  arm_cm NUMERIC(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_progress TO authenticated;
GRANT ALL ON public.member_progress TO service_role;
ALTER TABLE public.member_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress read own or admin" ON public.member_progress FOR SELECT TO authenticated
  USING (
    (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
    OR EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_progress.member_id AND m.user_id = auth.uid())
  );
CREATE POLICY "progress admin write" ON public.member_progress FOR ALL TO authenticated
  USING (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.member_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  actor_id UUID,
  kind TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.member_events TO authenticated;
GRANT ALL ON public.member_events TO service_role;
ALTER TABLE public.member_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events admin read" ON public.member_events FOR SELECT TO authenticated
  USING (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_member_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE changes JSONB := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.member_events (gym_id, member_id, actor_id, kind, detail)
    VALUES (NEW.gym_id, NEW.id, auth.uid(), 'alta', jsonb_build_object('nombre', NEW.first_name || ' ' || NEW.last_name));
    RETURN NEW;
  END IF;
  IF NEW.first_name IS DISTINCT FROM OLD.first_name THEN
    changes := changes || jsonb_build_object('nombre', jsonb_build_array(OLD.first_name, NEW.first_name)); END IF;
  IF NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    changes := changes || jsonb_build_object('apellido', jsonb_build_array(OLD.last_name, NEW.last_name)); END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    changes := changes || jsonb_build_object('email', jsonb_build_array(OLD.email, NEW.email)); END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    changes := changes || jsonb_build_object('telefono', jsonb_build_array(OLD.phone, NEW.phone)); END IF;
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    changes := changes || jsonb_build_object('plan', jsonb_build_array(OLD.plan_id, NEW.plan_id)); END IF;
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    changes := changes || jsonb_build_object('vencimiento', jsonb_build_array(OLD.expires_at, NEW.expires_at)); END IF;
  IF NEW.goal IS DISTINCT FROM OLD.goal THEN
    changes := changes || jsonb_build_object('objetivo', jsonb_build_array(OLD.goal, NEW.goal)); END IF;
  IF NEW.level IS DISTINCT FROM OLD.level THEN
    changes := changes || jsonb_build_object('nivel', jsonb_build_array(OLD.level, NEW.level)); END IF;
  IF NEW.trainer_notes IS DISTINCT FROM OLD.trainer_notes THEN
    changes := changes || jsonb_build_object('observaciones_entrenador', jsonb_build_array(OLD.trainer_notes, NEW.trainer_notes)); END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    changes := changes || jsonb_build_object('observaciones', jsonb_build_array(OLD.notes, NEW.notes)); END IF;
  IF NEW.active IS DISTINCT FROM OLD.active THEN
    changes := changes || jsonb_build_object('activo', jsonb_build_array(OLD.active, NEW.active)); END IF;
  IF changes <> '{}'::jsonb THEN
    NEW.updated_at := now();
    INSERT INTO public.member_events (gym_id, member_id, actor_id, kind, detail)
    VALUES (NEW.gym_id, NEW.id, auth.uid(), 'edicion', changes);
  END IF;
  RETURN NEW;
END; $fn$;
REVOKE ALL ON FUNCTION public.log_member_changes() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER members_log_insert AFTER INSERT ON public.members
FOR EACH ROW EXECUTE FUNCTION public.log_member_changes();
CREATE TRIGGER members_log_update BEFORE UPDATE ON public.members
FOR EACH ROW EXECUTE FUNCTION public.log_member_changes();

CREATE TABLE public.gym_notification_settings (
  gym_id UUID PRIMARY KEY REFERENCES public.gyms(id) ON DELETE CASCADE,
  expiry_enabled BOOLEAN NOT NULL DEFAULT true,
  days_before INT NOT NULL DEFAULT 5 CHECK (days_before BETWEEN 1 AND 60),
  notify_on_due_date BOOLEAN NOT NULL DEFAULT true,
  notify_overdue BOOLEAN NOT NULL DEFAULT true,
  routine_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_template TEXT NOT NULL DEFAULT 'Hola {nombre}! Te recordamos que tu cuota de {gimnasio} vence el {vencimiento}. Podés abonarla desde este link: {link_pago} o por transferencia al Alias: {alias}. Muchas gracias!',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_settings_whatsapp_template_length CHECK (char_length(whatsapp_template) BETWEEN 1 AND 2000)
);
GRANT SELECT, INSERT, UPDATE ON public.gym_notification_settings TO authenticated;
GRANT ALL ON public.gym_notification_settings TO service_role;
ALTER TABLE public.gym_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif settings read" ON public.gym_notification_settings FOR SELECT TO authenticated
  USING (gym_id = public.current_gym_id());
CREATE POLICY "notif settings admin write" ON public.gym_notification_settings FOR ALL TO authenticated
  USING (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL DEFAULT public.current_gym_id() REFERENCES public.gyms(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  user_id UUID,
  kind TEXT NOT NULL CHECK (kind IN ('vencimiento','rutina_asignada','rutina_modificada')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email','whatsapp')),
  status TEXT NOT NULL DEFAULT 'entregado' CHECK (status IN ('pendiente','entregado','leido','fallido')),
  error TEXT,
  dedup_key TEXT NOT NULL UNIQUE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_member_idx ON public.notifications (member_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications read own or admin" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "notifications mark own read" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications admin write" ON public.notifications FOR ALL TO authenticated
  USING (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (gym_id = public.current_gym_id() AND public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS request_id UUID;

COMMENT ON COLUMN public.payments.amount IS 'Importe final cobrado (original_amount - discount).';
COMMENT ON COLUMN public.payments.original_amount IS 'Precio del plan al cobrar. NULL en pagos anteriores a esta versión.';

CREATE UNIQUE INDEX IF NOT EXISTS payments_request_id_unique ON public.payments (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_member_active_idx ON public.payments (member_id, paid_on) WHERE voided_at IS NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amounts_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_amounts_check CHECK (
  amount >= 0 AND discount >= 0
  AND (original_amount IS NULL OR (original_amount >= 0 AND amount = original_amount - discount))
) NOT VALID;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_void_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_void_check CHECK (
  voided_at IS NULL OR (voided_by IS NOT NULL AND coalesce(length(trim(void_reason)),0) > 0)
);

CREATE OR REPLACE FUNCTION public.payments_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.gym_id IS DISTINCT FROM OLD.gym_id OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.original_amount IS DISTINCT FROM OLD.original_amount
       OR NEW.discount IS DISTINCT FROM OLD.discount OR NEW.paid_on IS DISTINCT FROM OLD.paid_on
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Los datos de un pago registrado no se pueden modificar. Anulalo y registrá uno nuevo.';
    END IF;
    IF OLD.voided_at IS NOT NULL AND (NEW.voided_at IS DISTINCT FROM OLD.voided_at
       OR NEW.voided_by IS DISTINCT FROM OLD.voided_by OR NEW.void_reason IS DISTINCT FROM OLD.void_reason) THEN
      RAISE EXCEPTION 'Este pago ya estaba anulado.';
    END IF;
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id AND NEW.plan_id IS NOT NULL THEN
      RAISE EXCEPTION 'El plan de un pago registrado no se puede cambiar.';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = NEW.member_id AND gym_id = NEW.gym_id) THEN
    RAISE EXCEPTION 'El socio no pertenece a este gimnasio.';
  END IF;
  IF NEW.plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.plans WHERE id = NEW.plan_id AND gym_id = NEW.gym_id) THEN
    RAISE EXCEPTION 'El plan no pertenece a este gimnasio.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS payments_guard ON public.payments;
CREATE TRIGGER payments_guard BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_guard();

CREATE OR REPLACE FUNCTION public.payments_block_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() = 1 AND current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    RAISE EXCEPTION 'Los pagos no se borran: se anulan.';
  END IF;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS payments_block_delete ON public.payments;
CREATE TRIGGER payments_block_delete BEFORE DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_block_delete();

CREATE OR REPLACE FUNCTION public.log_payment_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE plan_name TEXT;
BEGIN
  SELECT name INTO plan_name FROM public.plans WHERE id = NEW.plan_id;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.member_events (gym_id, member_id, actor_id, kind, detail)
    VALUES (NEW.gym_id, NEW.member_id, coalesce(NEW.created_by, auth.uid()), 'pago', jsonb_build_object(
      'pago_id', NEW.id, 'importe', NEW.amount, 'precio_original', NEW.original_amount,
      'descuento', NEW.discount, 'plan_id', NEW.plan_id, 'plan', plan_name,
      'fecha', NEW.paid_on, 'metodo', NEW.method, 'concepto', NEW.concept));
  ELSIF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    INSERT INTO public.member_events (gym_id, member_id, actor_id, kind, detail)
    VALUES (NEW.gym_id, NEW.member_id, NEW.voided_by, 'anulacion_pago', jsonb_build_object(
      'pago_id', NEW.id, 'importe', NEW.amount, 'plan_id', NEW.plan_id, 'plan', plan_name,
      'fecha', NEW.paid_on, 'registrado_por', NEW.created_by, 'registrado_el', NEW.created_at,
      'anulado_el', NEW.voided_at, 'motivo', NEW.void_reason));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS payments_log ON public.payments;
CREATE TRIGGER payments_log AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.log_payment_events();

CREATE OR REPLACE FUNCTION public.recalc_member_expiry(_member_id UUID)
RETURNS DATE LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; cursor_date DATE; base DATE; until DATE; day_of INT;
BEGIN
  FOR r IN SELECT p.id, p.paid_on, p.covers_until, coalesce(pl.months, 1) AS months
           FROM public.payments p LEFT JOIN public.plans pl ON pl.id = p.plan_id
           WHERE p.member_id = _member_id AND p.voided_at IS NULL
           ORDER BY p.paid_on, p.created_at LOOP
    base := CASE WHEN cursor_date IS NOT NULL AND cursor_date > r.paid_on THEN cursor_date ELSE r.paid_on END;
    until := (base + make_interval(months => r.months))::date;
    IF r.covers_until IS DISTINCT FROM until THEN
      UPDATE public.payments SET covers_until = until WHERE id = r.id;
    END IF;
    cursor_date := until;
  END LOOP;
  UPDATE public.members SET expires_at = cursor_date WHERE id = _member_id;
  RETURN cursor_date;
END; $$;
REVOKE ALL ON FUNCTION public.recalc_member_expiry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_member_expiry(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.register_payment(
  _member_id UUID, _plan_id UUID, _amount NUMERIC, _method TEXT, _concept TEXT,
  _paid_on DATE, _request_id UUID DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); gym UUID; m RECORD; pl RECORD; existing UUID; new_id UUID;
        orig NUMERIC; disc NUMERIC; covers DATE;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Esta acción es sólo para el administrador del gimnasio.';
  END IF;
  gym := public.current_gym_id();
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'El monto tiene que ser mayor a cero.'; END IF;

  SELECT id, gym_id INTO m FROM public.members WHERE id = _member_id FOR UPDATE;
  IF m.id IS NULL OR m.gym_id IS DISTINCT FROM gym THEN RAISE EXCEPTION 'El socio no pertenece a este gimnasio.'; END IF;
  SELECT id, gym_id, price INTO pl FROM public.plans WHERE id = _plan_id;
  IF pl.id IS NULL OR pl.gym_id IS DISTINCT FROM gym THEN RAISE EXCEPTION 'El plan no pertenece a este gimnasio.'; END IF;

  IF _request_id IS NOT NULL THEN
    SELECT id INTO existing FROM public.payments WHERE request_id = _request_id;
    IF existing IS NOT NULL THEN
      RETURN jsonb_build_object('id', existing, 'covers_until',
        (SELECT expires_at FROM public.members WHERE id = _member_id), 'duplicate', true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE member_id = _member_id AND plan_id = _plan_id
             AND paid_on = _paid_on AND amount = _amount AND voided_at IS NULL
             AND created_at > now() - interval '2 minutes') THEN
    RAISE EXCEPTION 'Este mismo pago se acaba de registrar. Revisá el historial antes de cobrar de nuevo.';
  END IF;

  orig := greatest(pl.price, _amount);
  disc := orig - _amount;
  INSERT INTO public.payments (gym_id, member_id, plan_id, concept, amount, original_amount, discount,
                               method, paid_on, created_by, request_id)
  VALUES (gym, _member_id, _plan_id, _concept, _amount, orig, disc, _method, _paid_on, uid, _request_id)
  RETURNING id INTO new_id;

  covers := public.recalc_member_expiry(_member_id);
  UPDATE public.members SET plan_id = _plan_id, active = true WHERE id = _member_id;
  RETURN jsonb_build_object('id', new_id, 'covers_until', covers, 'duplicate', false);
END; $$;
REVOKE ALL ON FUNCTION public.register_payment(uuid, uuid, numeric, text, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_payment(uuid, uuid, numeric, text, text, date, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.void_payment(_payment_id UUID, _reason TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); p RECORD; covers DATE;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Esta acción es sólo para el administrador del gimnasio.';
  END IF;
  IF coalesce(length(trim(_reason)), 0) < 3 THEN RAISE EXCEPTION 'Indicá el motivo de la anulación.'; END IF;
  SELECT id, gym_id, member_id, voided_at INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF p.id IS NULL OR p.gym_id IS DISTINCT FROM public.current_gym_id() THEN RAISE EXCEPTION 'Ese pago no existe.'; END IF;
  IF p.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Este pago ya estaba anulado.'; END IF;
  PERFORM 1 FROM public.members WHERE id = p.member_id FOR UPDATE;
  UPDATE public.payments SET voided_at = now(), voided_by = uid, void_reason = trim(_reason) WHERE id = _payment_id;
  covers := public.recalc_member_expiry(p.member_id);
  RETURN jsonb_build_object('covers_until', covers);
END; $$;
REVOKE ALL ON FUNCTION public.void_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_payment(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "payments admin write" ON public.payments;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated;

DROP POLICY IF EXISTS "member photos admin read own gym" ON storage.objects;
DROP POLICY IF EXISTS "member photos member read own" ON storage.objects;
CREATE POLICY "member photos admin read own gym" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-photos' AND (storage.foldername(name))[1] = 'gym'
    AND (storage.foldername(name))[2] = public.current_gym_id()::text AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "member photos member read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-photos' AND EXISTS (SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid() AND m.id::text = (storage.foldername(storage.objects.name))[4]
      AND m.gym_id::text = (storage.foldername(storage.objects.name))[2]));