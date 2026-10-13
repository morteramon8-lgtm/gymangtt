/**
 * Verificación antispam con Cloudflare Turnstile (solo servidor).
 *
 * Variable de entorno: TURNSTILE_SECRET_KEY (Netlify).
 * Si la variable no está configurada, la verificación se omite (así el registro
 * no se rompe antes de configurar las claves). Una vez cargada, es obligatoria.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | undefined | null): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY no configurada: registro SIN antispam.");
    return;
  }
  if (!token) {
    throw new Error("Completá la verificación de seguridad antes de continuar.");
  }

  let ok = false;
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { success?: boolean };
    ok = json.success === true;
  } catch (err) {
    console.error("[turnstile] no se pudo contactar a Cloudflare", err);
    throw new Error("No pudimos verificar la seguridad. Probá de nuevo en unos minutos.");
  }

  if (!ok) {
    throw new Error("La verificación de seguridad falló o venció. Volvé a intentarlo.");
  }
}
