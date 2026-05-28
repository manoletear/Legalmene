export const environment = {
  production: false,
  apiBaseUrl: "http://localhost:3001/api/v1",
  defaultCodPlan: "DEMO",
  entra: {
    clientId: "",
    authority: "https://login.microsoftonline.com/common",
    scopes: ["openid", "profile", "email"],
  },
};
