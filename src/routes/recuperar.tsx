import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/gym/BrandLogo";

export const Route = createFileRoute("/recuperar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nueva contraseña — GYMANGT" },
      {
        name: "description",
        content: "Definí una contraseña nueva para entrar a GYMANGT.",
      },
      { property: "og:title", content: "Nueva contraseña — GYMANGT" },
      { property: "og:description", content: "Recuperá el acceso a tu cuenta de GYMANGT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecoverPage,
});

function RecoverPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== repeat) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  return (
    <div className="auth-layout auth-layout-simple">
      <div className="auth-form-wrap">
        <div className="mb-6 text-center">
          <BrandLogo className="auth-mobile-logo" />
          <p className="muted mt-1 text-sm">Definí tu contraseña nueva</p>
        </div>

        <form className="panel" onSubmit={handleSubmit}>
          <div className="panel-head">Nueva contraseña</div>
          <div className="modal-body">
            {!ready ? (
              <p className="muted text-sm">Cargando…</p>
            ) : done ? (
              <>
                <p className="text-sm">Listo, tu contraseña quedó actualizada.</p>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => navigate({ to: "/", replace: true })}
                >
                  Ir a iniciar sesión
                </button>
              </>
            ) : !hasSession ? (
              <>
                <p className="muted text-sm">
                  El enlace de recuperación venció o ya fue usado. Volvé a pedir uno desde la
                  pantalla de ingreso.
                </p>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => navigate({ to: "/", replace: true })}
                >
                  Volver al ingreso
                </button>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label>Contraseña nueva</label>
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
                <div className="form-group">
                  <label>Repetir contraseña</label>
                  <input
                    className="field"
                    type="password"
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    required
                  />
                </div>
                {error ? <div className="alert badge-red">{error}</div> : null}
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? "Guardando…" : "Guardar contraseña"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
