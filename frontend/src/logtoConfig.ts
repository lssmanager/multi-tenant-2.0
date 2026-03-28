// src/logtoConfig.ts
import { APP_ENV } from './env';

export const logtoConfig = {
  endpoint: APP_ENV.logto.endpoint,
  appId: APP_ENV.logto.appId,
  resources: [APP_ENV.api.resourceIndicator],
  scopes: ["read:documents", "create:documents"],
};

export const LOGTO_RESOURCE = APP_ENV.api.resourceIndicator;
