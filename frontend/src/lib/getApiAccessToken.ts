// src/lib/getApiAccessToken.ts
import { useLogto } from "@logto/react";
import { LOGTO_RESOURCE } from "../logtoConfig";

export async function getApiAccessToken(logtoClient: any, resource?: string): Promise<string | undefined> {
  try {
    return await logtoClient.getAccessToken(resource || LOGTO_RESOURCE);
  } catch (err: any) {
    if (err.message?.includes("invalid_grant")) {
      // Session expired, force logout
      await logtoClient.signOut();
      window.location.href = "/";
    }
    throw err;
  }
}
