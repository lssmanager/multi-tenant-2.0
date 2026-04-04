// frontend/src/types/org.ts

export type OrgMemberRole = 'admin' | 'teacher' | 'student';

export type OrgMemberStatus = 'active' | 'invited' | 'deactivated';

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: OrgMemberRole;
  status: OrgMemberStatus;
  lastActivity?: string;
  origin?: 'invite' | 'auto-provision' | string;
  invitedAt?: string;
  inviteAttempts?: number;
  invitationStatus?: 'pending' | 'accepted' | 'expired' | string;
}

export interface InviteMemberPayload {
  email: string;
  role: OrgMemberRole;
  name?: string;
}

export interface OrgCourse {
  id: string;
  name: string;
}
