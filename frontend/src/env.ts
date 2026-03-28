
const {
  VITE_LOGTO_ENDPOINT,
  VITE_LOGTO_APP_ID,
  VITE_API_URL,
  VITE_RETAIL_ORG_ID,
} = import.meta.env;

export const APP_ENV = {
  logto: {
    endpoint: VITE_LOGTO_ENDPOINT,
    appId: VITE_LOGTO_APP_ID,
  },
  api: {
    baseUrl: VITE_API_URL,
    resourceIndicator: VITE_API_URL,
  },
  app: {
    redirectUri: "https://saas.socialstudies.cloud/callback",
    signOutRedirectUri: "https://saas.socialstudies.cloud",
  },
  retailOrgId: VITE_RETAIL_ORG_ID || "retail_org_id_placeholder",
};
