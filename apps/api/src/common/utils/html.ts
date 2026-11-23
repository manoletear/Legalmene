// Escapa texto para insertarlo en HTML (correos). Todo dato del usuario pasa por aquí.
export const escaparHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Asunto de correo en una sola línea (sin saltos ni caracteres de control).
export const textoLinea = (s: string): string =>
  [...s].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c)).join("").replace(/ +/g, " ").trim();
