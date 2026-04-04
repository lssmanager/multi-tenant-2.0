import { useMemo } from 'react';
import { useApi } from './base';
import type { OrgMember, InviteMemberPayload } from '../types/org';

export const useOrgMembersApi = () => {
  const { fetchWithToken } = useApi();

  return useMemo(() => ({
    listMembers: async (orgId: string, page = 1, perPage = 50): Promise<OrgMember[]> => {
      const data = await fetchWithToken<unknown>(
        `/org/members?page=${page}&perPage=${perPage}`,
        { method: 'GET' },
        orgId
      );
      if (Array.isArray(data)) return data as OrgMember[];
      if (
        data !== null &&
        typeof data === 'object' &&
        Array.isArray((data as Record<string, unknown>).items)
      ) {
        return (data as { items: OrgMember[] }).items;
      }
      return [];
    },

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
