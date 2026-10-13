import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, type LegalSection } from "@/components/gym/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Política de Privacidad — GYMANGT" },
      { name: "description", content: "Cómo GYMANGT trata los datos personales de gimnasios y socios." },
    ],
  }),
  component: PrivacyPage,
});

const sections: LegalSection[] = [
  {
    title: "Quiénes somos",
    body: [
      `${LEGAL.marca} (${LEGAL.sitio}) es operado por ${LEGAL.titular}, CUIT ${LEGAL.cuit}, con domicilio en ${LEGAL.domicilio}. Contacto: ${LEGAL.email}.`,
      "Esta política explica cómo se tratan los datos personales conforme a la Ley 25.326 de Protección de los Datos Personales.",
      ...(LEGAL.inscripcionRNBD
        ? [`Inscripción en el Registro Nacional de Bases de Datos Personales: ${LEGAL.inscripcionRNBD}.`]
        : []),
    ],
  },
  {
    title: "Dos roles distintos",
    body: [
      [
        "Datos del administrador del gimnasio (el Cliente): el Proveedor es el responsable del tratamiento.",
        "Datos de los socios: los carga cada gimnasio, que es el responsable del tratamiento. El Proveedor actúa como encargado y los trata solo por cuenta del gimnasio y para prestar el servicio.",
      ],
    ],
  },
  {
    title: "Qué datos se tratan",
    body: [
      "Del administrador:",
      [
        "nombre, email y contraseña (la contraseña se almacena de forma protegida, no en texto legible);",
        "datos de la suscripción: estado, fechas, email de pago e identificador de la suscripción en Mercado Pago. No se guardan números de tarjeta.",
      ],
      "De los socios, según lo que cargue cada gimnasio:",
      [
        "nombre, apellido, DNI, email, teléfono y fecha de nacimiento;",
        "foto, objetivo, nivel y notas del entrenador;",
        "medidas corporales (peso, porcentaje de grasa, perímetros) y notas de progreso, que pueden considerarse datos de salud;",
        "asistencias, pagos de cuotas, plan contratado y rutinas asignadas.",
      ],
      "Datos técnicos: registros de errores y de seguridad. Al crear una cuenta de gimnasio se usa Cloudflare Turnstile como control antispam, que puede procesar la dirección IP y señales del dispositivo para distinguir personas de robots.",
    ],
  },
  {
    title: "Para qué se usan",
    body: [
      [
        "prestar el servicio de gestión del gimnasio;",
        "crear y administrar cuentas y accesos;",
        "procesar y controlar la suscripción;",
        "enviar mensajes del servicio, como confirmación de cuenta y recuperación de contraseña;",
        "proteger la plataforma contra abusos y fraudes;",
        "cumplir obligaciones legales.",
      ],
      "No se venden datos personales ni se usan para publicidad de terceros.",
    ],
  },
  {
    title: "Consentimiento y datos sensibles",
    body: [
      "Los datos de salud son datos sensibles y requieren cuidados especiales. Cada gimnasio debe obtener el consentimiento expreso e informado de sus socios antes de cargar mediciones corporales u otros datos de salud, y la autorización de padres o tutores en caso de menores.",
    ],
  },
  {
    title: "Con quién se comparten los datos",
    body: [
      "Para operar el servicio se usan proveedores que actúan como encargados:",
      [
        "Supabase: base de datos, autenticación y almacenamiento de fotos;",
        "Netlify: alojamiento del sitio;",
        "Mercado Pago: cobro de la suscripción;",
        "Resend: envío de correos del servicio;",
        "Cloudflare: gestión de dominio y control antispam.",
      ],
      "Algunos de estos proveedores pueden almacenar o procesar datos en servidores ubicados fuera de la Argentina. En esos casos se exigen garantías contractuales y de seguridad adecuadas, conforme a los arts. 12 y 25 de la Ley 25.326.",
      "Los datos también pueden comunicarse a autoridades cuando una norma o una orden judicial lo exija.",
    ],
  },
  {
    title: "Seguridad",
    body: [
      "Se aplican medidas técnicas y organizativas razonables: conexiones cifradas (HTTPS), separación de los datos de cada gimnasio, control de acceso por roles, enlaces temporales para ver fotos y verificación de los avisos de pago.",
      "Ningún sistema es completamente invulnerable. Si se detecta un incidente que afecte datos personales, se informará a los afectados y a la autoridad cuando corresponda.",
    ],
  },
  {
    title: "Cuánto tiempo se conservan",
    body: [
      `Los datos se conservan mientras la cuenta esté activa. Tras la baja o suspensión se guardan ${LEGAL.diasConservacion} días y luego se eliminan o anonimizan, salvo registros que una norma obligue a conservar, como los de facturación.`,
    ],
  },
  {
    title: "Derechos de los titulares",
    body: [
      "Toda persona puede solicitar el acceso, la rectificación, la actualización o la supresión de sus datos personales. Los socios deben dirigirse primero a su gimnasio, que es el responsable de sus datos; también pueden escribir a " +
        LEGAL.email +
        ", y se colaborará con el gimnasio para responder.",
      "El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley 25.326.",
      "La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.",
    ],
  },
  {
    title: "Menores de edad",
    body: [
      "La cuenta de administrador es solo para mayores de 18 años. Si un gimnasio carga datos de socios menores, es responsable de contar con la autorización de sus padres o tutores.",
    ],
  },
  {
    title: "Cambios y contacto",
    body: [
      `Esta política puede actualizarse; la fecha de la última versión figura al comienzo. Ante cualquier consulta: ${LEGAL.email}.`,
    ],
  },
];

function PrivacyPage() {
  return <LegalPage title="Política de Privacidad" sections={sections} />;
}
