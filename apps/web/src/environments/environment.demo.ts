export const environment = {
  production: true,
  apiBaseUrl: "https://legalmene-api.onrender.com/api/v1",
  entra: {
    clientId: "",
    authority: "https://login.microsoftonline.com/common",
    // Ámbito expuesto por el registro de la API en Entra ID (p. ej. "api://<id-de-la-api>/acceso");
    // su audiencia es ENTRA_AUDIENCE en el backend. Sin clientId no se ofrece "Ingresar con Microsoft".
    scopes: [] as string[],
  },
};
