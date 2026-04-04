import { useLogto } from '@logto/react';
import { useEffect, useState } from 'react';
import { APP_ENV } from '../env';
import {
  getImpersonationContext,
  IMPERSONATION_EVENT_NAME,
  type ImpersonationContext,
} from '../lib/impersonation';

type LogtoOrganizationData = {
  id?: string;
  name?: string;
  description?: string;
};

type LogtoUserInfo = {
  roles?: string[];
  organizations?: string[];
  organization_data?: LogtoOrganizationData[];
  organization_roles?: string[];
} & Record<string, unknown>;

const normalizeString = (value: string | undefined | null) => value?.trim().toLowerCase() ?? '';

const normalizeStringList = (values: string[] | undefined | null) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizeString(value))
        .filter((value) => value.length > 0),
    ),
  );

export interface CurrentUser {
  loading: boolean;
  isAuthenticated: boolean;
  userInfo: LogtoUserInfo | null;
  currentOrganization: LogtoOrganizationData | null;
  organizations: string[];
  orgId: string | undefined;
  effectiveOrgId: string | undefined;
  isImpersonating: boolean;
  impersonatedOrgId: string | undefined;
  impersonatedOrgName: string | undefined;
  impersonatedRole: 'admin' | 'teacher' | 'student' | undefined;
  isSuperAdmin: boolean;
  isRetail: boolean;
  canImpersonate: boolean;
  isOrgAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  accessContext: {
    isSuperAdmin: boolean;
    primaryRole: 'super-admin' | 'org-role';
    globalRoles: string[];
    organizationRoles: string[];
    effectivePermissions: string[];
    effectiveScopes: {
      shifts?: string[];
      campuses?: string[];
      groups?: string[];
    };
  };
}

export const useCurrentUser = (): CurrentUser => {
  const { isAuthenticated, fetchUserInfo, getAccessToken } = useLogto();
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<LogtoUserInfo | null>(null);
  const [currentOrganization, setCurrentOrganization] = useState<LogtoOrganizationData | null>(null);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);
  const [globalRoles, setGlobalRoles] = useState<string[]>([]);
  const [orgRoles, setOrgRoles] = useState<string[]>([]);
  const [impersonationContext, setImpersonationContext] = useState<ImpersonationContext | null>(null);
  const [effectivePermissions, setEffectivePermissions] = useState<string[]>([]);
  const [effectiveScopes, setEffectiveScopes] = useState<{
    shifts?: string[];
    campuses?: string[];
    groups?: string[];
  }>({});

  useEffect(() => {
    let cancelled = false;

    const resetState = () => {
      setUserInfo(null);
      setCurrentOrganization(null);
      setOrganizations([]);
      setOrgId(undefined);
      setGlobalRoles([]);
      setOrgRoles([]);
      setEffectivePermissions([]);
      setEffectiveScopes({});
    };

    const loadUser = async () => {
      if (!isAuthenticated) {
        resetState();
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const info = (await fetchUserInfo()) as LogtoUserInfo | null;
        if (cancelled) return;

        const organizationData = Array.isArray(info?.organization_data) ? info.organization_data : [];
        const currentOrganization = organizationData[0] ?? null;
        const currentOrgId = normalizeString(currentOrganization?.id);

        const normalizedGlobalRoles = normalizeStringList(info?.roles);
        const normalizedOrganizations = normalizeStringList(
          info?.organizations ??
            organizationData.map((organization) => organization.id).filter((id): id is string => Boolean(id)),
        );
        const normalizedOrganizationRoles = normalizeStringList(info?.organization_roles);
        const currentOrganizationRoles = currentOrgId
          ? normalizedOrganizationRoles
              .filter((roleClaim) => roleClaim.startsWith(`${currentOrgId}:`))
              .map((roleClaim) => roleClaim.slice(currentOrgId.length + 1))
          : [];

        setUserInfo(info);
        setCurrentOrganization(currentOrganization);
        setOrganizations(normalizedOrganizations);
        setOrgId(currentOrgId || undefined);
        setGlobalRoles(normalizedGlobalRoles);
        setOrgRoles(currentOrganizationRoles);

        try {
          const activeOrganizationId =
            normalizeString(impersonationContext?.orgId) || currentOrgId || '';
          const token = await getAccessToken(APP_ENV.api.resourceIndicator);
          const query = activeOrganizationId
            ? `?activeOrganizationId=${encodeURIComponent(activeOrganizationId)}`
            : '';
          const response = await fetch(`${APP_ENV.api.baseUrl}/auth/access-context${query}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...(activeOrganizationId ? { 'x-active-organization-id': activeOrganizationId } : {}),
              ...(impersonationContext?.orgId
                ? { 'x-impersonation-organization-id': impersonationContext.orgId }
                : {}),
            },
          });

          if (response.ok) {
            const payload = (await response.json()) as {
              accessContext?: {
                globalRoles?: string[];
                organizationRoles?: string[];
                effectivePermissions?: string[];
                effectiveScopes?: {
                  shifts?: string[];
                  campuses?: string[];
                  groups?: string[];
                };
              };
            };
            setGlobalRoles(normalizeStringList(payload.accessContext?.globalRoles));
            setOrgRoles(normalizeStringList(payload.accessContext?.organizationRoles));
            setEffectivePermissions(normalizeStringList(payload.accessContext?.effectivePermissions));
            setEffectiveScopes(payload.accessContext?.effectiveScopes || {});
          } else {
            setEffectivePermissions([]);
            setEffectiveScopes({});
          }
        } catch {
          setEffectivePermissions([]);
          setEffectiveScopes({});
        }
      } catch {
        if (cancelled) return;
        resetState();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, fetchUserInfo, getAccessToken, impersonationContext?.orgId]);

  useEffect(() => {
    const updateFromStorage = () => {
      setImpersonationContext(getImpersonationContext());
    };

    updateFromStorage();
    window.addEventListener('storage', updateFromStorage);
    window.addEventListener(IMPERSONATION_EVENT_NAME, updateFromStorage);

    return () => {
      window.removeEventListener('storage', updateFromStorage);
      window.removeEventListener(IMPERSONATION_EVENT_NAME, updateFromStorage);
    };
  }, []);

  const isSuperAdmin = globalRoles.includes('super-admin');
  // Impersonation context is only relevant if super-admin and explicitly set
  const impersonatedOrgId = isSuperAdmin && impersonationContext?.orgId ? normalizeString(impersonationContext.orgId) : undefined;
  const effectiveOrgId = impersonatedOrgId || orgId;
  const isRetail = effectiveOrgId === normalizeString(APP_ENV.retailOrgId);
  // isSuperAdmin always wins — if true, all org capability flags are true
  const isOrgAdmin = isSuperAdmin || orgRoles.includes('admin');
  const isTeacher = isSuperAdmin || orgRoles.includes('teacher');
  const isStudent = isSuperAdmin || orgRoles.includes('student');
  // Impersonation is only true if super-admin and impersonation context is set
  const isImpersonating = Boolean(isSuperAdmin && impersonatedOrgId);
  // canImpersonate is true for super-admin users
  const canImpersonate = isSuperAdmin;
  const accessContext = {
    isSuperAdmin,
    primaryRole: isSuperAdmin ? ('super-admin' as const) : ('org-role' as const),
    globalRoles,
    organizationRoles: orgRoles,
    effectivePermissions,
    effectiveScopes,
  };

  return {
    loading,
    isAuthenticated,
    userInfo,
    currentOrganization,
    organizations,
    orgId,
    effectiveOrgId,
    isImpersonating,
    impersonatedOrgId,
    impersonatedOrgName: isSuperAdmin ? impersonationContext?.orgName : undefined,
    impersonatedRole: isSuperAdmin ? impersonationContext?.role : undefined,
    isSuperAdmin,
    isRetail,
    canImpersonate,
    isOrgAdmin,
    isTeacher,
    isStudent,
    accessContext,
  };
};
