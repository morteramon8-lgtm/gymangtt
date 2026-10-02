CREATE OR REPLACE FUNCTION public.today_ar()
RETURNS DATE LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;
GRANT EXECUTE ON FUNCTION public.today_ar() TO authenticated, service_role;
ALTER TABLE public.members         ALTER COLUMN join_date   SET DEFAULT public.today_ar();
ALTER TABLE public.payments        ALTER COLUMN paid_on     SET DEFAULT public.today_ar();
ALTER TABLE public.attendance      ALTER COLUMN attended_on SET DEFAULT public.today_ar();
ALTER TABLE public.member_progress ALTER COLUMN measured_on SET DEFAULT public.today_ar();