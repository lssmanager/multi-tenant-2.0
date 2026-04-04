// frontend/src/types/org.ts
// Single source of truth for org-related types across the frontend.
// Import from here — do NOT redefine OrgMember locally in components.

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
