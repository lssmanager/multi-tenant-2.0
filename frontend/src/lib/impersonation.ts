export type ImpersonationContext = {
  orgId: string;
  orgName?: string;
  role?: 'admin' | 'teacher' | 'student';
};

const IMPERSONATION_STORAGE_KEY = 'lss_impersonation_context';
export const IMPERSONATION_EVENT_NAME = 'lss-impersonation-changed';

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const getImpersonationContext = (): ImpersonationContext | null => {
  if (!canUseStorage()) return null;
  try {
    const rawValue = window.localStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue) as Partial<ImpersonationContext>;
    if (!parsed || typeof parsed.orgId !== 'string' || parsed.orgId.trim().length === 0) {
      return null;
    }
    return {
      orgId: parsed.orgId.trim(),
      orgName: typeof parsed.orgName === 'string' ? parsed.orgName.trim() : undefined,
      role: parsed.role === 'admin' || parsed.role === 'teacher' || parsed.role === 'student' ? parsed.role : undefined,
    };
  } catch {
    return null;
  }
};

export const setImpersonationContext = (context: ImpersonationContext): void => {
  if (!canUseStorage()) return;
  const payload: ImpersonationContext = {
    orgId: context.orgId.trim(),
    orgName: context.orgName?.trim(),
    role: context.role,
  };
  window.localStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event(IMPERSONATION_EVENT_NAME));
};

export const clearImpersonationContext = (): void => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
  window.dispatchEvent(new Event(IMPERSONATION_EVENT_NAME));
};
