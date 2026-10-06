import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutGrid,
  Users,
  CreditCard,
  Dumbbell,
  Settings,
  UserCircle,
  UsersRound,
  LogOut,
  BellRing,
  CalendarCheck,
  Menu,
  X,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/gym.functions";
import { formatLongDate } from "@/lib/dates";
import { SOON_DAYS } from "@/lib/gym-shared";
import { NotificationBell } from "./NotificationBell";
import { BrandLogo } from "./BrandLogo";
import { SubscriptionBanner } from "./SubscriptionBanner";

/**
 * Días de aviso configurados en Avisos. Todas las pantallas cuentan
 * "por vencer" con el mismo número que los recordatorios.
 */
export function useSoonDays(): number {
  const { data: me } = useMe();
  return me?.soonDays ?? SOON_DAYS;
}

export function useMe() {
  const fn = useServerFn(getMe);
  return useQuery({
    queryKey: ["me"],
    // Sin sesión activa el servidor responde 401: esperamos a tener token.
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        await supabase.auth.signOut();
        window.location.replace("/");
        return null;
      }
      return await fn();
    },
    retry: false,
    staleTime: 60_000,
  });
}

type NavLink = { to: string; label: string; icon: ReactNode; note: string };

const ADMIN_LINKS: { section: string; items: NavLink[] }[] = [
  {
    section: "Principal",
    items: [{ to: "/dashboard", label: "Dashboard", note: "Vista general", icon: <LayoutGrid className="nav-icon" /> }],
  },
  {
    section: "Gestión",
    items: [
      { to: "/socios", label: "Socios", note: "Miembros", icon: <Users className="nav-icon" /> },
      { to: "/pagos", label: "Pagos", note: "Cobros", icon: <CreditCard className="nav-icon" /> },
      { to: "/rutinas", label: "Rutinas", note: "Entrenamiento", icon: <Dumbbell className="nav-icon" /> },
      { to: "/grupos", label: "Grupos", note: "Entrenamiento", icon: <UsersRound className="nav-icon" /> },
      { to: "/asistencias", label: "Asistencias", note: "Accesos", icon: <CalendarCheck className="nav-icon" /> },
      { to: "/avisos", label: "Avisos", note: "Alertas", icon: <BellRing className="nav-icon" /> },
    ],
  },
  {
    section: "Sistema",
    items: [
      { to: "/configuracion", label: "Configuración", note: "Sistema", icon: <Settings className="nav-icon" /> },
      { to: "/suscripcion", label: "Suscripción", note: "GYMANGT", icon: <Wallet className="nav-icon" /> },
    ],
  },
];

const MEMBER_LINKS: { section: string; items: NavLink[] }[] = [
  {
    section: "Mi cuenta",
    items: [
      { to: "/mi-cuenta", label: "Mi perfil", note: "Datos personales", icon: <UserCircle className="nav-icon" /> },
      { to: "/mi-rutina", label: "Mi rutina", note: "Entrenamiento", icon: <Dumbbell className="nav-icon" /> },
      { to: "/mis-rutinas", label: "Mis rutinas", note: "Creadas por mí", icon: <Dumbbell className="nav-icon" /> },
      { to: "/grupos", label: "Grupos", note: "Entrenar juntos", icon: <UsersRound className="nav-icon" /> },
      { to: "/mis-pagos", label: "Mis pagos", note: "Historial", icon: <CreditCard className="nav-icon" /> },
    ],
  },
];

export function AppShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { data: me } = useMe();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const groups = me?.role === "admin" ? ADMIN_LINKS : MEMBER_LINKS;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen">
      {menuOpen ? <button className="sidebar-scrim" aria-label="Cerrar navegación" onClick={() => setMenuOpen(false)} /> : null}
      <aside className={`gym-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="gym-logo">
          <BrandLogo className="gym-brand-logo" tone="green" />
          <button className="mobile-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X /></button>
        </div>
        <nav className="gym-nav">
          {groups.map((group, groupIndex) => (
            <div key={group.section}>
              <div className="nav-section">{group.section}</div>
              {group.items.map((item, itemIndex) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`nav-item ${pathname === item.to || (item.to === "/grupos" && pathname.startsWith("/grupos/")) ? "active" : ""}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="nav-number">{String(groups.slice(0, groupIndex).reduce((n, g) => n + g.items.length, 0) + itemIndex + 1).padStart(2, "0")}</span>
                  {item.icon}
                  <span className="nav-copy"><span className="nav-label">{item.label}</span><span className="nav-note">{item.note}</span></span>
                </Link>
              ))}
            </div>
          ))}
          <div className="nav-section">Cuenta</div>
          <button type="button" className="nav-item" onClick={signOut}>
            <LogOut className="nav-icon" />
            <span className="nav-label">Cerrar sesión</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div>
            <strong>{me?.gymName ?? "GYMANGT"}</strong>
            {me?.role === "admin" ? "Administrador" : (me?.memberName ?? "Socio")}
          </div>
        </div>
      </aside>

      <main className="gym-main">
        <div className="gym-topbar">
          <div className="topbar-start"><button className="mobile-menu" type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button><div><div className="topbar-kicker">SYSTEM / OPERATIONS</div><div className="page-title">{title}</div></div></div>
          <div className="flex items-center gap-3">
            {actions}
            <NotificationBell />
            <div className="current-user"><strong>{me?.memberName ?? me?.gymName ?? "GYMANGT"}</strong><span>{me?.role === "admin" ? "Administrador" : "Socio"}</span></div>
            <span className="topbar-date">{formatLongDate(me?.today)}</span>
          </div>
        </div>
        <div className="gym-content">{me?.role === "admin" ? <SubscriptionBanner /> : null}{children}</div>
      </main>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      {children}
    </div>
  );
}
