// src/lib/apiClient.ts
import { getApiAccessToken } from "./getApiAccessToken";
import { LOGTO_RESOURCE } from "../logtoConfig";
import { APP_ENV } from "../env";
import { useLogto } from "@logto/react";

export function useApiClient() {
  const logtoClient = useLogto();

  async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
    const token = await getApiAccessToken(logtoClient, LOGTO_RESOURCE);
    const url = `${APP_ENV.api.baseUrl}${path}`;
    // ...existing code...
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401 || res.status === 403) {
        await logtoClient.signOut();
        window.location.href = "/";
        throw new Error("Sesión expirada. Por favor inicia sesión de nuevo.");
      }
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || res.statusText);
      }
      return await res.json();
    } catch (err) {
      throw err;
    }
  }

  return {
    get: <T = any>(path: string) => request<T>("GET", path),
    post: <T = any>(path: string, body?: any) => request<T>("POST", path, body),
    put: <T = any>(path: string, body?: any) => request<T>("PUT", path, body),
    delete: <T = any>(path: string) => request<T>("DELETE", path),
  };
}
