-- Política única de fechas para Argentina.
--
-- Los valores por defecto usaban CURRENT_DATE, que en el servidor se calcula en
-- UTC. Después de las 21:00 de Argentina eso ya es el día siguiente, así que un
-- pago del 23/09 podía quedar guardado como 24/09.
-- Solución: un único "hoy" del gimnasio (huso de Argentina). No se toca
-- ninguna fecha ya guardada.

CREATE OR REPLACE FUNCTION public.today_ar()
RETURNS DATE LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;

GRANT EXECUTE ON FUNCTION public.today_ar() TO authenticated, service_role;

ALTER TABLE public.members         ALTER COLUMN join_date   SET DEFAULT public.today_ar();
ALTER TABLE public.payments        ALTER COLUMN paid_on     SET DEFAULT public.today_ar();
ALTER TABLE public.attendance      ALTER COLUMN attended_on SET DEFAULT public.today_ar();
ALTER TABLE public.member_progress ALTER COLUMN measured_on SET DEFAULT public.today_ar();

-- Regla de renovación mensual documentada (sin cambio de comportamiento):
-- se cuenta desde el vencimiento anterior si sigue vigente, y desde la fecha de
-- pago si ya venció. El "+ 1 mes" de Postgres recorta al último día del mes
-- destino: 31/01 + 1 mes = 28/02 (29/02 en año bisiesto).
COMMENT ON FUNCTION public.recalc_member_expiry(uuid) IS
  'Recalcula el vencimiento del socio sumando los meses de cada pago no anulado, encadenando desde el vencimiento anterior cuando sigue vigente y desde la fecha de pago cuando ya venció.';