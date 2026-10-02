-- Las vistas gym_settings y notification_settings eran un alias con id=1 sobre
-- gyms y gym_notification_settings. El código ya consulta las tablas reales
-- filtrando por gym_id, así que se eliminan las vistas (no guardan datos).
DROP VIEW public.gym_settings;
DROP VIEW public.notification_settings;