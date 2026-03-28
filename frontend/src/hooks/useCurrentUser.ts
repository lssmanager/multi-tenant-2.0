import { useLogto } from '@logto/react';
import { useEffect, useState } from 'react';
import { APP_ENV } from '../env';

type LogtoOrganizationData = {
  id?: string;
};

export interface CurrentUser {
  loading: boolean;
  isAuthenticated: boolean;
  userInfo: any;
  currentOrganization: any;
  orgId: string | undefined;
  isSuperAdmin: boolean;
  isRetail: boolean;
  isOrgAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
}

export const useCurrentUser = (): CurrentUser => {
  const { isAuthenticated, fetchUserInfo } = useLogto();
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [currentOrganization, setCurrentOrganization] = useState<any>(null);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchUserInfo().then(info => {
      setUserInfo(info);
      const organizationData = Array.isArray(info?.organization_data)
        ? (info.organization_data as LogtoOrganizationData[])
        : [];
      const org = organizationData[0] || null;
      const organizationRolesClaim = Array.isArray(info?.organization_roles)
        ? (info.organization_roles as string[])
        : [];
      const currentOrgRoles = org
        ? organizationRolesClaim
            .filter((role) => role.startsWith(`${org.id}:`))
            .map((role) => role.split(':')[1])
        : [];
      setCurrentOrganization(org);
      setOrgId(org?.id);
      setRoles(currentOrgRoles);
      setLoading(false);
    });
  }, [isAuthenticated, fetchUserInfo]);

  const isSuperAdmin = !orgId;
  const isRetail = orgId === APP_ENV.retailOrgId;
  const isOrgAdmin = roles.includes('admin');
  const isTeacher = roles.includes('teacher');
  const isStudent = roles.includes('student');

  return {
    loading,
    isAuthenticated,
    userInfo,
    currentOrganization,
    orgId,
    isSuperAdmin,
    isRetail,
    isOrgAdmin,
    isTeacher,
    isStudent,
  };
};
