import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getMe, gymSetupStatus, setupGym } from "@/lib/gym.functions";
import { BrandLogo } from "@/components/gym/BrandLogo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GYMANGT — Gestión de gimnasios" },
      {
        name: "description",
        content:
          "GYMANGT es la plataforma para gestionar socios, membresías, pagos y rutinas de tu gimnasio.",
      },
      { property: "og:title", content: "GYMANGT — Gestión de gimnasios" },
      {
        property: "og:description",
        content: "Socios, membresías, pagos y rutinas de tu gimnasio en un solo panel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const me = useServerFn(getMe);
  const setupGymFn = useServerFn(setupGym);
  const setupStatusFn = useServerFn(gymSetupStatus);
  const [role, setRole] = useState<"admin" | "socio">("socio");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(false);

  async function goToApp() {
    try {
      const info = await me();
      navigate({ to: info.role === "admin" ? "/dashboard" : "/mi-cuenta", replace: true });
    } catch {
      // Sesión inválida o expirada: la limpiamos y dejamos el formulario visible.
      await supabase.auth.signOut();
      setError("Tu sesión expiró. Volvé a iniciar sesión.");
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void goToApp();
    });
    setupStatusFn()
      .then((s) => setNeedsSetup(s.needsSetup))
      .catch(() => setNeedsSetup(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        await setupGymFn({ data: { email, password, full_name: fullName } });
        const { error: resendError } = await supabase.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (resendError) throw resendError;
        setMode("login");
        setNotice("Te enviamos un email para confirmar tu cuenta. Revisá tu bandeja de entrada y el correo no deseado. Cuando confirmes, iniciá sesión.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      await goToApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot() {
    setError(null);
    setNotice(null);
    if (!email) {
      setError("Escribí tu email para poder enviarte el enlace de recuperación.");
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/recuperar`,
    });
    setLoading(false);
    if (resetError) setError(resetError.message);
    else
      setNotice(
        "Te enviamos un email con un enlace para crear una contraseña nueva. Revisá tu bandeja de entrada y el correo no deseado.",
      );
  }

  return (
    <div className="auth-layout">
      <section className="auth-manifesto" aria-label="Presentación de GYMANGT">
        <BrandLogo className="auth-brand-logo" tone="green" />
        <div className="auth-index">SYSTEM / ACCESS / 2026</div>
        <div className="auth-statement">GESTIÓN<br/>SIN RUIDO.</div>
        <p>Socios, pagos, rutinas y asistencias bajo una sola operación.</p>
        <div className="auth-status"><i /> PLATAFORMA OPERATIVA</div>
      </section>
      <div className="auth-form-wrap">
        <div className="mb-6 text-center auth-mobile-brand">
          <BrandLogo className="auth-mobile-logo" />
          <p className="muted mt-1 text-sm">Gestión profesional para tu gimnasio</p>
        </div>

        <form className="panel" onSubmit={handleSubmit}>
          <div className="panel-head">
            {role === "socio"
              ? "Acceso para socios"
              : mode === "login"
                ? "Acceso del administrador"
                : "Crear cuenta del gimnasio"}
          </div>
          <div className="modal-body">
            <div className="tabs" style={{ marginBottom: 16 }}>
              <button
                type="button"
                className={`tab ${role === "socio" ? "active" : ""}`}
                onClick={() => {
                  setRole("socio");
                  setMode("login");
                  setError(null);
                }}
              >
                Soy socio
              </button>
              <button
                type="button"
                className={`tab ${role === "admin" ? "active" : ""}`}
                onClick={() => {
                  setRole("admin");
                  setError(null);
                }}
              >
                Soy administrador
              </button>
            </div>
            {mode === "signup" && role === "admin" ? (
              <div className="form-group">
                <label>Nombre y apellido</label>
                <input
                  className="field"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: Damián Morte"
                  required
                />
              </div>
            ) : null}
            <div className="form-group">
              <label>Email</label>
              <input
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
              />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input
                className="field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
              />
            </div>
            {error ? <div className="alert badge-red">{error}</div> : null}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading
                ? "Procesando…"
                : mode === "signup" && role === "admin"
                  ? "Crear cuenta"
                  : "Entrar"}
            </button>
            {role === "admin" && needsSetup ? (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError(null);
                }}
              >
                {mode === "login"
                  ? "No tengo cuenta — registrar mi gimnasio"
                  : "Ya tengo cuenta — iniciar sesión"}
              </button>
            ) : null}
            {mode === "login" ? (
              <button className="btn btn-ghost" type="button" onClick={handleForgot}>
                Olvidé mi contraseña
              </button>
            ) : null}
            {notice ? <p className="muted text-xs">{notice}</p> : null}
            <p className="muted text-xs">
              {role === "socio"
                ? "Ingresá con el email y la contraseña que te dio el administrador de tu gimnasio. Si todavía no tenés cuenta, pedile que la cree desde tu ficha de socio."
                : needsSetup
                  ? "Los socios entran desde la pestaña “Soy socio” con el email y la contraseña que les das al crearlos."
                  : "El registro está cerrado: este gimnasio ya tiene administrador. Las cuentas de los socios se crean desde su ficha."}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
