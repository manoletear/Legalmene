export const environment = {
  production: true,
  apiBaseUrl: "https://legalmene-api.onrender.com/api/v1",
  defaultCodPlan: "DEMO",
  entra: {
    clientId: "",
    authority: "https://login.microsoftonline.com/common",
    scopes: ["openid", "profile", "email"],
  },
};
