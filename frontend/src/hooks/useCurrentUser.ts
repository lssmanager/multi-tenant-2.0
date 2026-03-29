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
  isOrgAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
}

export const useCurrentUser = (): CurrentUser => {
  const { isAuthenticated, fetchUserInfo } = useLogto();
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<LogtoUserInfo | null>(null);
  const [currentOrganization, setCurrentOrganization] = useState<LogtoOrganizationData | null>(null);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);
  const [globalRoles, setGlobalRoles] = useState<string[]>([]);
  const [orgRoles, setOrgRoles] = useState<string[]>([]);
  const [impersonationContext, setImpersonationContext] = useState<ImpersonationContext | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resetState = () => {
      setUserInfo(null);
      setCurrentOrganization(null);
      setOrganizations([]);
      setOrgId(undefined);
      setGlobalRoles([]);
      setOrgRoles([]);
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
  }, [isAuthenticated, fetchUserInfo]);

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
  const impersonatedOrgId = isSuperAdmin ? normalizeString(impersonationContext?.orgId) || undefined : undefined;
  const effectiveOrgId = impersonatedOrgId || orgId;
  const isRetail = effectiveOrgId === normalizeString(APP_ENV.retailOrgId);
  const isOrgAdmin = isSuperAdmin || orgRoles.includes('admin');
  const isTeacher = isSuperAdmin || orgRoles.includes('teacher');
  const isStudent = isSuperAdmin || orgRoles.includes('student');
  const isImpersonating = Boolean(isSuperAdmin && impersonatedOrgId);

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
    isOrgAdmin,
    isTeacher,
    isStudent,
  };
};
