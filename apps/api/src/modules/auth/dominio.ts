// Anexo §IV: solo usuarios del dominio LegalChile ingresan.
export function dominioPermitido(email: string, config = process.env.ALLOWED_EMAIL_DOMAIN): boolean {
  const dominios = (config ?? "legalchile.cl")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const dominio = email.split("@")[1]?.toLowerCase() ?? "";
  return dominios.includes(dominio);
}
