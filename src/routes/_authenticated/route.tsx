import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { BrandLogo } from "@/components/gym/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { getAccessStatus } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });
    return { user: data.user };
  },
  component: SubscriptionGate,
});

/**
 * Bloqueo por suscripción. Si el gimnasio no tiene acceso (prueba terminada,
 * pago rechazado fuera de gracia, cancelada y vencida), nadie ve la aplicación:
 * el administrador sólo puede entrar a /suscripcion para pagar; los socios ven un aviso.
 * El servidor además rechaza todas las operaciones (ver subscription-middleware).
 */
function SubscriptionGate() {
  const fn = useServerFn(getAccessStatus);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["access"],
    queryFn: () => fn(),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000, // si vence mientras la usan, se bloquea sin recargar
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <div className="dashboard-loading"><span /><span /><span /></div>;

  // Si no pudimos consultar el estado (error de red), no bloqueamos: el servidor igual protege los datos.
  if (!data || data.allowed) return <Outlet />;

  // El administrador bloqueado puede ver y usar la pantalla de pago.
  if (data.role === "admin" && pathname === "/suscripcion") return <Outlet />;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const isAdmin = data.role === "admin";
  return (
    <div className="auth-form-wrap" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="panel" style={{ maxWidth: 460, width: "100%" }}>
        <div className="panel-head">{isAdmin ? "Suscripción vencida" : "Acceso suspendido"}</div>
        <div className="panel-body" style={{ display: "grid", gap: 14 }}>
          <BrandLogo />
          {isAdmin ? (
            <p style={{ margin: 0 }}>
              La suscripción de GYMANGT de tu gimnasio está vencida o con un pago pendiente, por eso el sistema está
              bloqueado. Tus socios, pagos y rutinas están a salvo: al regularizar el pago todo vuelve a funcionar.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              El acceso de tu gimnasio a GYMANGT está suspendido por el momento. Consultá en recepción.
            </p>
          )}
          {isAdmin ? (
            <Link to="/suscripcion" className="btn btn-primary">
              Ir a Suscripción
            </Link>
          ) : null}
          <button type="button" className="btn btn-sm" onClick={() => void signOut()}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
