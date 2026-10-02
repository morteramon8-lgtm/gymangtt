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