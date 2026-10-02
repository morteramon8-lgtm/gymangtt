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