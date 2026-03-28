import { useLogto } from '@logto/react';
import { useEffect, useState } from 'react';
import { APP_ENV } from '../env';

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
      const orgs = info?.organization_data || [];
      const org = orgs[0] || null;
      setCurrentOrganization(org);
      setOrgId(org?.id);
      setRoles(org?.organizationRoles || []);
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
