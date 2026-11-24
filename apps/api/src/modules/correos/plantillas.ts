import { escaparHtml, textoLinea } from "../../common/utils/html";

// Plantillas de correo en español (Anexo §VI–X). Todo dato variable pasa por escaparHtml(); los
// asuntos van en una línea. Cada plantilla devuelve asunto, HTML y texto plano.
export interface Contenido {
  asunto: string;
  html: string;
  texto: string;
}

const marco = (titulo: string, cuerpo: string, pie = "LegalChile · Este correo fue generado por NEXUS.") => `<!doctype html>
<html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:16px;">
<h2 style="color:#1d4ed8;font-size:18px;margin:0 0 12px;">${escaparHtml(titulo)}</h2>
${cuerpo}
<p style="color:#64748b;font-size:12px;margin-top:24px;">${escaparHtml(pie)}</p>
</body></html>`;

const parrafos = (lineas: string[]) => lineas.map((l) => `<p style="margin:0 0 8px;">${escaparHtml(l)}</p>`).join("\n");

const boton = (url: string, texto: string) =>
  `<p style="margin:16px 0;"><a href="${escaparHtml(url)}" style="background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">${escaparHtml(texto)}</a></p>`;

// Aviso interno de un flujo (arancel, provisión, consulta, error…), con enlace a la ficha.
export function plantillaAviso(p: { titulo: string; detalle?: string | null; url?: string | null }): Contenido {
  const lineas = p.detalle ? [p.detalle] : [];
  return {
    asunto: textoLinea(`NEXUS · ${p.titulo}`),
    html: marco(p.titulo, parrafos(lineas) + (p.url ? boton(p.url, "Abrir en NEXUS") : "")),
    texto: [p.titulo, ...lineas, p.url ? `Abrir en NEXUS: ${p.url}` : ""].filter(Boolean).join("\n\n"),
  };
}

// Al cliente: presentación del abogado asignado (Anexo §VII l.765, §VIII l.984).
export function plantillaPresentacionAbogado(p: {
  cliente: string;
  abogado: string;
  correoAbogado: string;
  correlativo: string;
  materia: string;
}): Contenido {
  const lineas = [
    `Estimado(a) ${p.cliente}:`,
    `Le informamos que ${p.abogado} será el abogado a cargo de su atención ${p.correlativo} (${p.materia}).`,
    `Puede contactarlo en ${p.correoAbogado}. En los próximos días le pedirá los antecedentes necesarios y le informará los plazos de los primeros avances.`,
  ];
  return {
    asunto: textoLinea(`LegalChile · Su abogado para la atención ${p.correlativo}`),
    html: marco("Su abogado asignado", parrafos(lineas)),
    texto: lineas.join("\n\n"),
  };
}

// Al cliente: antecedentes que debe enviar (Anexo §VI l.537, §VII).
export function plantillaSolicitudAntecedentes(p: { cliente: string; abogado: string; correlativo: string; antecedentes: string; plazo?: string | null }): Contenido {
  const lista = p.antecedentes
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const intro = [`Estimado(a) ${p.cliente}:`, `Para continuar con su atención ${p.correlativo} necesitamos los siguientes antecedentes:`];
  const cierre = [
    p.plazo ? `Le pedimos enviarlos a más tardar el ${p.plazo}.` : "Le pedimos enviarlos a la brevedad.",
    `Puede responder este correo o escribir a su abogado, ${p.abogado}.`,
  ];
  return {
    asunto: textoLinea(`LegalChile · Antecedentes para su atención ${p.correlativo}`),
    html: marco(
      "Antecedentes requeridos",
      parrafos(intro) + `<ul>${lista.map((l) => `<li>${escaparHtml(l)}</li>`).join("")}</ul>` + parrafos(cierre),
    ),
    texto: [...intro, ...lista.map((l) => `- ${l}`), ...cierre].join("\n\n"),
  };
}

// A la dirección anterior del cliente cuando se cambia su correo de contacto.
export function plantillaCambioCorreo(p: { cliente: string }): Contenido {
  const lineas = [
    `Estimado(a) ${p.cliente}:`,
    "Le informamos que se cambió el correo de contacto registrado en LegalChile, y los avisos de sus atenciones se enviarán a la nueva dirección.",
    "Si usted no solicitó este cambio, comuníquese con LegalChile a la brevedad.",
  ];
  return { asunto: textoLinea("LegalChile · Cambio de su correo de contacto"), html: marco("Cambio de correo de contacto", parrafos(lineas)), texto: lineas.join("\n\n") };
}

// Al cliente: enlace de pago en línea del arancel (Anexo §IX 3.ii, "Notificar Pago").
export function plantillaPagoWebPay(p: { cliente: string; correlativo: string; montoClp: number; url: string }): Contenido {
  const lineas = [
    `Estimado(a) ${p.cliente}:`,
    `El copago de su atención ${p.correlativo} es de $${p.montoClp.toLocaleString("es-CL")}.`,
    "Puede pagarlo en línea con WebPay desde el siguiente enlace. Al completarse, el pago queda registrado en su atención.",
  ];
  return {
    asunto: textoLinea(`LegalChile · Pago del arancel de su atención ${p.correlativo}`),
    html: marco("Pago de arancel", parrafos(lineas) + boton(p.url, "Pagar con WebPay")),
    texto: [...lineas, p.url].join("\n\n"),
  };
}

// Al cliente: inicio o término de una gestión (Anexo §VII l.1015, §VIII l.1105).
export function plantillaGestionCliente(p: {
  cliente: string;
  correlativo: string;
  gestion: string;
  etapa: "inicio" | "termino";
  fecha: string;
  resultado?: string | null;
}): Contenido {
  const lineas = [
    `Estimado(a) ${p.cliente}:`,
    p.etapa === "inicio"
      ? `Le informamos que el ${p.fecha} iniciamos la gestión "${p.gestion}" en su atención ${p.correlativo}.`
      : `Le informamos que el ${p.fecha} terminó la gestión "${p.gestion}" en su atención ${p.correlativo}.`,
    ...(p.resultado ? [`Resultado: ${p.resultado}`] : []),
  ];
  return {
    asunto: textoLinea(`LegalChile · ${p.etapa === "inicio" ? "Inicio" : "Término"} de gestión en su atención ${p.correlativo}`),
    html: marco(p.etapa === "inicio" ? "Inicio de gestión" : "Término de gestión", parrafos(lineas)),
    texto: lineas.join("\n\n"),
  };
}

// Al cliente: término de la atención (informe final, Anexo §VII l.1050, §VIII l.1180).
export function plantillaTerminoAtencion(p: { cliente: string; correlativo: string; causa: string; abogado: string }): Contenido {
  const lineas = [
    `Estimado(a) ${p.cliente}:`,
    `Le informamos que su atención ${p.correlativo} ha terminado (${p.causa}).`,
    `Si tiene fondos provisionados, su abogado ${p.abogado} le enviará la rendición de gastos para su aprobación.`,
    "Gracias por confiar en LegalChile.",
  ];
  return {
    asunto: textoLinea(`LegalChile · Término de su atención ${p.correlativo}`),
    html: marco("Término de su atención", parrafos(lineas)),
    texto: lineas.join("\n\n"),
  };
}

// A operaciones: resumen de una carga masiva con RUT nuevos y eliminados (Anexo §III l.308).
export function plantillaResumenCarga(p: {
  entidad: string;
  tipo: string;
  codPlan: string;
  total: number;
  insertados: number;
  actualizados: number;
  eliminados: number;
  errores: number;
  rutsNuevos: string[];
  rutsEliminados: string[];
}): Contenido {
  const lineas = [
    `Carga ${p.tipo} de ${p.entidad} del plan ${p.codPlan}.`,
    `Registros: ${p.total} · nuevos: ${p.insertados} · actualizados: ${p.actualizados} · terminados: ${p.eliminados} · con error: ${p.errores}.`,
  ];
  const lista = (titulo: string, ruts: string[]) =>
    ruts.length ? `<h3 style="font-size:14px;">${escaparHtml(titulo)} (${ruts.length})</h3><p style="font-family:monospace;">${ruts.map(escaparHtml).join(", ")}</p>` : "";
  return {
    asunto: textoLinea(`NEXUS · Carga ${p.tipo} de ${p.entidad} del plan ${p.codPlan}`),
    html: marco("Resumen de carga masiva", parrafos(lineas) + lista("RUT nuevos", p.rutsNuevos) + lista("RUT terminados", p.rutsEliminados)),
    texto: [
      ...lineas,
      p.rutsNuevos.length ? `RUT nuevos: ${p.rutsNuevos.join(", ")}` : "",
      p.rutsEliminados.length ? `RUT terminados: ${p.rutsEliminados.join(", ")}` : "",
      "El detalle de errores está en el reporte XLSX de la carga.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
