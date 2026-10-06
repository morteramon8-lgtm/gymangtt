import { createFileRoute } from "@tanstack/react-router";

// URL pública a configurar en Mercado Pago > Tus integraciones > Webhooks:
//   https://TU-DOMINIO/api/public/mercadopago-webhook
// Eventos a activar: "Planes y suscripciones" (subscription_preapproval
// y subscription_authorized_payment).

export const Route = createFileRoute("/api/public/mercadopago-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const mpServer = await import("@/lib/mercadopago.server");

        const url = new URL(request.url);
        let body: { id?: string | number; type?: string; topic?: string; data?: { id?: string | number } } = {};
        try {
          body = await request.json();
        } catch {
          // MP puede mandar el aviso sólo con query params
        }

        const dataId = String(url.searchParams.get("data.id") ?? body.data?.id ?? "");
        const topic = String(url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body.type ?? body.topic ?? "");
        if (!dataId || !topic) return new Response("Bad request", { status: 400 });

        // 1) Autenticidad: firma HMAC con la clave secreta del webhook.
        if (!mpServer.verifyWebhookSignature(request, dataId)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // 2) Sólo los eventos de suscripción nos interesan.
        if (topic !== "subscription_preapproval" && topic !== "subscription_authorized_payment") {
          return new Response("ignored", { status: 200 });
        }

        // 3) No procesar dos veces el mismo aviso.
        const eventKey = `${topic}:${dataId}:${body.id ?? request.headers.get("x-request-id") ?? ""}`;
        const fresh = await mpServer.claimEvent(eventKey, topic, dataId, body);
        if (!fresh) return new Response("duplicate", { status: 200 });

        // 4) Consultar a Mercado Pago el estado real y actualizar Supabase.
        try {
          if (topic === "subscription_preapproval") await mpServer.syncPreapproval(dataId);
          else await mpServer.syncAuthorizedPayment(dataId);
        } catch (e) {
          console.error("[MercadoPago webhook] error", e);
          await mpServer.releaseEvent(eventKey); // permite el reintento de MP
          return new Response("error", { status: 500 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
