/**
 * Datos legales de GYMANGT. Completá los campos que dicen [COMPLETAR ...]
 * antes de vender el servicio: aparecen en los Términos y en la Política de Privacidad.
 * Mientras quede alguno sin completar, esas páginas muestran un aviso de "borrador".
 */
export const LEGAL = {
  marca: "GYMANGT",
  sitio: "https://gymangt.com",
  titular: "[Maximiliano Damian Morte Brizuela]",
  cuit: "[20-48415571-3]",
  domicilio: "[Sur B° Los Teros C. 7, Gral Mariano Acha Sur 5151 M. C, J5427 Pocito, San Juan]",
  email: "[gymangtt@gmail.com]",
  ciudadJurisdiccion: "[Ciudad de San Juan]",
  // Valores propuestos: cambialos si querés otros.
  diasConservacion: "90", // días que se guardan los datos tras la baja o suspensión
  diasAvisoCambios: "30", // días de aviso antes de cambiar el precio
  // Cuando inscribas tu base en el Registro Nacional de Bases de Datos Personales, escribí acá el número.
  // Si queda vacío, la línea no se muestra.
  inscripcionRNBD: "",
  actualizado: "octubre de 2026",
} as const;

const REQUIRED = ["titular", "cuit", "domicilio", "email", "ciudadJurisdiccion"] as const;

export function legalIncomplete(): boolean {
  return REQUIRED.some((k) => LEGAL[k].startsWith("["));
}

export function mailtoLink(subject: string, body: string): string {
  return `mailto:${LEGAL.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
