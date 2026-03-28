import { useMemo } from 'react';
import { useApi } from './base';

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  status: 'active' | 'invited';
}

export interface InviteMemberPayload {
  email: string;
  role: 'student' | 'teacher' | 'admin';
  name?: string;
}

export const useOrgMembersApi = () => {
  const { fetchWithToken } = useApi();

  return useMemo(() => ({
    listMembers: (orgId: string) =>
      fetchWithToken('/org/members', { method: 'GET' }, orgId) as Promise<OrgMember[]>,

    inviteMember: (orgId: string, payload: InviteMemberPayload) =>
      fetchWithToken('/org/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, orgId),

    updateMemberRole: (orgId: string, memberId: string, role: OrgMember['role']) =>
      fetchWithToken(`/org/members/${memberId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      }, orgId),

    removeMember: (orgId: string, memberId: string) =>
      fetchWithToken(`/org/members/${memberId}`, { method: 'DELETE' }, orgId),

  }), [fetchWithToken]);
};
