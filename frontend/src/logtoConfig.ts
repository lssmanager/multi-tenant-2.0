// src/logtoConfig.ts
import { APP_ENV, type AppEnv } from './env';

const logtoEndpoint: AppEnv["logto"]["endpoint"] = APP_ENV.logto.endpoint;
const logtoAppId: AppEnv["logto"]["appId"] = APP_ENV.logto.appId;
const apiResourceIndicator: AppEnv["api"]["resourceIndicator"] = APP_ENV.api.resourceIndicator;

export const logtoConfig = {
  endpoint: logtoEndpoint,
  appId: logtoAppId,
  resources: [apiResourceIndicator],
  scopes: [
    "read:documents",
    "create:documents",
    "roles",
    "urn:logto:scope:organizations",
    "urn:logto:scope:organization_roles",
  ],
};

export const LOGTO_RESOURCE = apiResourceIndicator;
