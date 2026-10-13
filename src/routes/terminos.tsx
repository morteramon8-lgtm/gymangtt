import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, type LegalSection } from "@/components/gym/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: "Términos y Condiciones — GYMANGT" },
      { name: "description", content: "Condiciones de uso del servicio GYMANGT para gimnasios." },
    ],
  }),
  component: TermsPage,
});

const sections: LegalSection[] = [
  {
    title: "Aceptación y definiciones",
    body: [
      `Estos Términos y Condiciones regulan el uso de ${LEGAL.marca} (${LEGAL.sitio}), un software en línea para gestionar socios, membresías, pagos, rutinas y asistencias de gimnasios, prestado por ${LEGAL.titular}, CUIT ${LEGAL.cuit}, con domicilio en ${LEGAL.domicilio} (el “Proveedor”).`,
      "Al crear una cuenta o usar el servicio, la persona que se registra (el “Cliente”) declara haber leído y aceptado estos Términos y la Política de Privacidad.",
      "“Socios” son las personas cuyos datos el Cliente carga en la plataforma para administrar su gimnasio.",
    ],
  },
  {
    title: "El servicio",
    body: [
      "GYMANGT es una herramienta de gestión. Cada cuenta de administrador corresponde a un gimnasio, con sus socios, pagos, rutinas y asistencias separados de los de otros gimnasios.",
      "Los socios pueden ingresar con las credenciales que les cree el Cliente para consultar su información, según las funciones habilitadas.",
    ],
  },
  {
    title: "Registro y cuenta",
    body: [
      [
        "El Cliente debe ser mayor de 18 años y brindar datos veraces y actualizados.",
        "Debe confirmar su email para activar la cuenta.",
        "Es responsable de la confidencialidad de sus credenciales y de toda actividad realizada con ellas, incluidas las cuentas que cree para sus socios.",
        "Debe avisar de inmediato al Proveedor ante cualquier uso no autorizado.",
      ],
    ],
  },
  {
    title: "Prueba gratuita, precio y cobro",
    body: [
      [
        "El Proveedor puede ofrecer un período de prueba gratuito, cuya duración se informa en la aplicación.",
        "Finalizada la prueba, el uso continuado requiere una suscripción mensual paga, procesada por Mercado Pago, que se renueva automáticamente hasta que el Cliente la cancele.",
        "El precio vigente se informa en la pantalla de suscripción antes de contratar, en pesos argentinos, e incluye los impuestos que correspondan.",
        `El Proveedor puede modificar el precio con un aviso de al menos ${LEGAL.diasAvisoCambios} días de anticipación. Si el Cliente no está de acuerdo, puede darse de baja antes de que el cambio rija, sin costo.`,
        "El Proveedor no almacena datos de tarjetas ni de otros medios de pago: los gestiona Mercado Pago, sujeto a sus propios términos.",
        "Si un pago es rechazado, el sistema informa un período de gracia en la aplicación. Si el pago no se regulariza, se suspende el acceso.",
      ],
    ],
  },
  {
    title: "Suspensión por falta de pago",
    body: [
      `Vencida la prueba gratuita o suspendida la suscripción por falta de pago, el acceso al panel de gestión se bloquea hasta que se regularice. Los datos se conservan durante ${LEGAL.diasConservacion} días desde la suspensión o la baja y luego pueden eliminarse o anonimizarse, salvo que una norma obligue a conservarlos.`,
    ],
  },
  {
    title: "Baja del servicio",
    body: [
      "El Cliente puede darse de baja en cualquier momento y sin penalidad, desde la sección “Suscripción” de la aplicación o mediante el “Botón de baja de servicio” visible en la pantalla de ingreso, que no requiere iniciar sesión.",
      "Tras la solicitud, el Proveedor informará un código de identificación dentro de las 24 horas, por el mismo medio, y hará efectiva la baja.",
      "La baja rige desde el fin del período ya pagado. No se realizan reembolsos proporcionales, salvo lo previsto en la sección siguiente o en la ley.",
    ],
  },
  {
    title: "Derecho de arrepentimiento",
    body: [
      "Si el Cliente califica como consumidor según la Ley 24.240 de Defensa del Consumidor, puede revocar la contratación dentro de los 10 días corridos contados desde que se celebró el contrato, mediante el “Botón de arrepentimiento” visible en la pantalla de ingreso, sin necesidad de registrarse.",
      "En ese caso, el Proveedor informará un código de identificación dentro de las 24 horas y reintegrará lo pagado por el mismo medio de pago.",
    ],
  },
  {
    title: "Uso aceptable",
    body: [
      "El Cliente se compromete a no:",
      [
        "usar el servicio para fines ilícitos o contrarios a derechos de terceros;",
        "intentar acceder a datos de otros gimnasios, vulnerar la seguridad o sobrecargar la plataforma;",
        "automatizar registros masivos de cuentas o eludir los controles antispam;",
        "revender o ceder el acceso al servicio sin autorización del Proveedor;",
        "cargar datos de personas sin tener derecho a hacerlo.",
      ],
      "El Proveedor puede suspender cuentas que incumplan estas reglas.",
    ],
  },
  {
    title: "Datos de los socios y responsabilidades",
    body: [
      "Respecto de los datos de sus socios, el Cliente es el responsable del tratamiento y el Proveedor actúa como encargado, es decir, trata esos datos por cuenta del Cliente y según sus instrucciones (art. 25 de la Ley 25.326).",
      "El Cliente debe:",
      [
        "contar con el consentimiento o la base legal necesaria para cargar los datos de sus socios, e informarles la finalidad del tratamiento;",
        "obtener consentimiento expreso para datos de salud o mediciones corporales y, tratándose de menores, la autorización de sus padres o tutores;",
        "cargar solo los datos que necesite para administrar su gimnasio;",
        "inscribir su base de datos en el Registro Nacional de Bases de Datos Personales cuando corresponda;",
        "atender los pedidos de acceso, rectificación o supresión de sus socios.",
      ],
      "El Proveedor no usa los datos de los socios para otros fines, no los cede a terceros salvo a los prestadores necesarios para operar el servicio, aplica medidas de seguridad y mantiene la confidencialidad. Más detalles en la Política de Privacidad.",
    ],
  },
  {
    title: "Propiedad intelectual",
    body: [
      "El software, la marca y el diseño de GYMANGT pertenecen al Proveedor. Se otorga al Cliente una licencia limitada, revocable y no exclusiva para usarlo mientras su suscripción esté vigente.",
      "Los datos que el Cliente carga siguen siendo del Cliente.",
    ],
  },
  {
    title: "Disponibilidad y soporte",
    body: [
      "El Proveedor procura mantener el servicio disponible, pero no garantiza un funcionamiento ininterrumpido: pueden existir mantenimientos, fallas o interrupciones de proveedores externos como hosting, base de datos, envío de correos o Mercado Pago.",
      `El soporte se brinda por correo a ${LEGAL.email}.`,
    ],
  },
  {
    title: "Limitación de responsabilidad",
    body: [
      "En la medida permitida por la ley, el servicio se presta “tal cual” como herramienta de gestión. No brinda asesoramiento médico ni deportivo: las decisiones sobre entrenamiento y salud de los socios son responsabilidad del Cliente y sus profesionales.",
      "El Proveedor no responde por daños indirectos, lucro cesante ni pérdidas causadas por terceros, fuerza mayor o uso indebido del servicio. Su responsabilidad total se limita a lo pagado por el Cliente en los 3 meses anteriores al hecho que originó el reclamo.",
      "Nada de lo anterior limita los derechos irrenunciables que la ley reconoce a los consumidores.",
    ],
  },
  {
    title: "Cambios en estos Términos",
    body: [
      "El Proveedor puede actualizar estos Términos y lo informará por correo electrónico o dentro de la aplicación con una anticipación razonable. Continuar usando el servicio después de ese aviso implica aceptar los cambios; si el Cliente no está de acuerdo, puede darse de baja.",
    ],
  },
  {
    title: "Ley aplicable y jurisdicción",
    body: [
      `Estos Términos se rigen por las leyes de la República Argentina. Para cualquier controversia, las partes se someten a los tribunales ordinarios de ${LEGAL.ciudadJurisdiccion}, sin perjuicio de los derechos que la ley otorga a los consumidores para accionar en su domicilio.`,
    ],
  },
  {
    title: "Contacto",
    body: [`Para consultas sobre estos Términos: ${LEGAL.email}.`],
  },
];

function TermsPage() {
  return <LegalPage title="Términos y Condiciones" sections={sections} />;
}
