-- Columnas nuevas (todas opcionales: los pagos existentes quedan intactos)
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

-- Coherencia gimnasio / socio / plan y protección de importes históricos
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
    -- plan_id sólo puede pasar a NULL (plan borrado)
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
  -- Se permite sólo el borrado en cascada al eliminar socio o gimnasio.
  IF pg_trigger_depth() = 1 AND current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    RAISE EXCEPTION 'Los pagos no se borran: se anulan.';
  END IF;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS payments_block_delete ON public.payments;
CREATE TRIGGER payments_block_delete BEFORE DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_block_delete();

-- Auditoría: reutiliza member_events
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

-- Recalcular vencimiento (ignora anulados)
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

-- Registrar pago: todo en una transacción
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

  -- Bloquea al socio: dos cobros simultáneos al mismo socio se atienden de a uno
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

-- Anular pago (anulación lógica)
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

-- Escrituras directas cerradas: sólo por las funciones de arriba
DROP POLICY IF EXISTS "payments admin write" ON public.payments;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated;

-- Fotos de socios (políticas que faltaban en este proyecto)
DROP POLICY IF EXISTS "member photos admin read own gym" ON storage.objects;
DROP POLICY IF EXISTS "member photos member read own" ON storage.objects;
CREATE POLICY "member photos admin read own gym" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-photos' AND (storage.foldername(name))[1] = 'gym'
    AND (storage.foldername(name))[2] = public.current_gym_id()::text AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "member photos member read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-photos' AND EXISTS (SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid() AND m.id::text = (storage.foldername(storage.objects.name))[4]
      AND m.gym_id::text = (storage.foldername(storage.objects.name))[2]));