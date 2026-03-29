import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../api/base';
import { useOrgMembersApi, type OrgMember } from '../../api/orgMembers';
import { useToast } from '../../components/ToastProvider';
import { useCurrentUser } from '../../hooks/useCurrentUser';

type Role = 'student' | 'teacher' | 'admin';
type MemberStatusFilter = 'all' | 'active' | 'invited' | 'deactivated';
type MembersTab = 'members' | 'invitations';

type EditFormState = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

type InviteFormState = {
  email: string;
  name: string;
  role: Role;
};

const ROLE_OPTIONS: Role[] = ['student', 'teacher', 'admin'];

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeRole = (value: unknown): Role => {
  const role = normalizeText(value).toLowerCase();
  if (role === 'admin' || role === 'teacher' || role === 'student') return role;
  return 'student';
};

const normalizeStatus = (value: unknown): OrgMember['status'] => {
  const status = normalizeText(value).toLowerCase();
  if (status === 'active') return 'active';
  if (status === 'deactivated' || status === 'disabled' || status === 'inactive') return 'deactivated';
  return 'invited';
};

const parseInstitutionalDomain = (value: string | undefined | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-') return null;

  const explicitDomainMatch = trimmed.match(/domain\s*:\s*([^|]+)/i);
  if (explicitDomainMatch && explicitDomainMatch[1]) {
    const explicitDomain = explicitDomainMatch[1].trim().replace(/^@/, '').toLowerCase();
    if (explicitDomain) return explicitDomain;
  }

  if (trimmed.includes('@')) {
    const atIndex = trimmed.indexOf('@');
    const domain = trimmed.slice(atIndex + 1).toLowerCase();
    const clean = domain.split(/\s|\|/)[0];
    return clean || null;
  }
  const plain = trimmed.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  return plain || null;
};

const formatDate = (value: string | undefined): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-CO');
};

const downloadCsvFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const toCsv = (rows: string[][]): string =>
  rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');

const normalizeMember = (member: OrgMember): OrgMember => ({
  ...member,
  id: normalizeText(member.id),
  name: normalizeText(member.name),
  email: normalizeText(member.email),
  role: normalizeRole(member.role),
  status: normalizeStatus(member.status),
  lastActivity: normalizeText(member.lastActivity) || undefined,
  origin: normalizeText(member.origin) || undefined,
  invitedAt: normalizeText(member.invitedAt) || undefined,
  inviteAttempts: typeof member.inviteAttempts === 'number' ? member.inviteAttempts : undefined,
  invitationStatus: normalizeText(member.invitationStatus) || undefined,
});

const buildInvitationStatus = (member: OrgMember): 'pending' | 'accepted' | 'expired' => {
  const raw = normalizeText(member.invitationStatus).toLowerCase();
  if (raw === 'accepted') return 'accepted';
  if (raw === 'expired') return 'expired';
  if (member.status === 'active') return 'accepted';
  return 'pending';
};

const statusBadgeClass = (status: OrgMember['status']) => {
  if (status === 'active') return 'bg-green-100 text-green-800';
  if (status === 'deactivated') return 'bg-red-100 text-red-800';
  return 'bg-yellow-100 text-yellow-800';
};

const invitationBadgeClass = (status: 'pending' | 'accepted' | 'expired') => {
  if (status === 'accepted') return 'bg-green-100 text-green-800';
  if (status === 'expired') return 'bg-red-100 text-red-800';
  return 'bg-yellow-100 text-yellow-800';
};

const OrgMembersPage = () => {
  const { fetchWithToken } = useApi();
  const { listMembers, inviteMember, updateMemberRole, removeMember } = useOrgMembersApi();
  const { showError, showSuccess } = useToast();
  const {
    effectiveOrgId,
    isOrgAdmin,
    isSuperAdmin,
    isImpersonating,
    currentOrganization,
    impersonatedOrgName,
    loading: userLoading,
  } = useCurrentUser();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<MembersTab>('members');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('all');

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormState>({
    email: '',
    role: 'student',
    name: '',
  });

  const [editingMember, setEditingMember] = useState<EditFormState | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const orgName = impersonatedOrgName || currentOrganization?.name || 'Your School';

  const institutionalDomain = useMemo(() => {
    const fromDescription = parseInstitutionalDomain(currentOrganization?.description);
    return fromDescription;
  }, [currentOrganization?.description]);

  const loadMembers = useCallback(async () => {
    if (userLoading || !effectiveOrgId || !isOrgAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await listMembers(effectiveOrgId);
      const normalized = Array.isArray(data) ? data.map(normalizeMember) : [];
      setMembers(normalized);
    } catch {
      setError('Could not load organization members.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setLoading(false);
    }
  }, [effectiveOrgId, isOrgAdmin, listMembers, showError, userLoading]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return members.filter((member) => {
      const roleMatches = roleFilter === 'all' || member.role === roleFilter;
      const statusMatches = statusFilter === 'all' || member.status === statusFilter;
      const textMatches =
        term.length === 0 ||
        member.name.toLowerCase().includes(term) ||
        member.email.toLowerCase().includes(term);
      return roleMatches && statusMatches && textMatches;
    });
  }, [members, roleFilter, search, statusFilter]);

  const pendingInvitations = useMemo(
    () => members.filter((member) => member.status === 'invited' || buildInvitationStatus(member) !== 'accepted'),
    [members],
  );

  const exportCsv = () => {
    const rows = filteredMembers.map((member) => [
      member.name || '-',
      member.email,
      member.role,
      member.status,
      member.lastActivity || '-',
      member.origin || (member.status === 'invited' ? 'invite' : 'auto-provision'),
    ]);
    const content = toCsv([
      ['Name', 'Email', 'Role', 'Status', 'Last activity', 'Origin'],
      ...rows,
    ]);
    downloadCsvFile(`members-${effectiveOrgId || 'org'}.csv`, content);
  };

  const resetInviteForm = () => {
    setInviteForm({ email: '', role: 'student', name: '' });
  };

  const validateInstitutionalEmail = (email: string): string | null => {
    const trimmed = email.trim().toLowerCase();
    if (!institutionalDomain) return null;
    const requiredSuffix = `@${institutionalDomain}`;
    if (!trimmed.endsWith(requiredSuffix)) {
      return 'SOLO MIEMBROS DE TU ORGANIZATION, CONTACTA SOPORTE PARA EMAIL NO INSTITUCIONALES.';
    }
    return null;
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!effectiveOrgId) return;

    const domainValidationError = validateInstitutionalEmail(inviteForm.email);
    if (domainValidationError) {
      setError(domainValidationError);
      showError(domainValidationError);
      return;
    }

    setInviteSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await inviteMember(effectiveOrgId, {
        email: inviteForm.email.trim().toLowerCase(),
        role: inviteForm.role,
        name: inviteForm.name.trim() || undefined,
      });
      setMessage(`Invitation sent to ${inviteForm.email.trim().toLowerCase()}.`);
      showSuccess('Invitacion enviada', `Se envio invitacion a ${inviteForm.email.trim().toLowerCase()}.`);
      setIsInviteModalOpen(false);
      resetInviteForm();
      await loadMembers();
    } catch {
      setError('Could not send invitation.');
      showError('No se pudo enviar la invitacion', 'Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setInviteSubmitting(false);
    }
  };

  const openEditModal = (member: OrgMember) => {
    setError(null);
    setMessage(null);
    setEditingMember({
      id: member.id,
      name: member.name || '',
      email: member.email,
      role: member.role,
    });
  };

  const handleEditChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setEditingMember((prev) => {
      if (!prev) return prev;
      if (name === 'role') {
        return { ...prev, role: normalizeRole(value) };
      }
      if (name === 'email') {
        return { ...prev, email: value };
      }
      return { ...prev, name: value };
    });
  };

  const handleSaveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!effectiveOrgId || !editingMember) return;

    const emailValidationError = validateInstitutionalEmail(editingMember.email);
    if (emailValidationError) {
      setError(emailValidationError);
      showError(emailValidationError);
      return;
    }

    setEditSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await fetchWithToken(`/org/members/${editingMember.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingMember.name.trim(),
          email: editingMember.email.trim().toLowerCase(),
          role: editingMember.role,
        }),
      }, effectiveOrgId);
      setMessage('Member updated.');
      showSuccess('Miembro actualizado');
    } catch {
      try {
        await updateMemberRole(effectiveOrgId, editingMember.id, editingMember.role);
        setMessage('Role updated. Name/email were updated in UI and may require backend endpoint to persist.');
        showError('Sincronizacion incompleta', 'Error: reintenta mas tarde o contacta soporte.');
      } catch {
        setError('Could not save member changes.');
        showError('Error: reintenta mas tarde o contacta soporte.');
        setEditSubmitting(false);
        return;
      }
    }

    setMembers((prev) =>
      prev.map((member) =>
        member.id === editingMember.id
          ? {
              ...member,
              name: editingMember.name.trim() || member.name,
              email: editingMember.email.trim().toLowerCase(),
              role: editingMember.role,
            }
          : member,
      ),
    );
    setEditingMember(null);
    setEditSubmitting(false);
  };

  const handleRemove = async (member: OrgMember) => {
    if (!effectiveOrgId) return;
    const confirmation = window.confirm(`Remove ${member.email} from this organization?`);
    if (!confirmation) return;

    setActionLoadingId(member.id);
    setError(null);
    setMessage(null);
    try {
      await removeMember(effectiveOrgId, member.id);
      setMembers((prev) => prev.filter((item) => item.id !== member.id));
      setMessage(`${member.email} was removed from the organization.`);
      showSuccess('Miembro actualizado', `${member.email} fue removido del colegio.`);
    } catch {
      setError('Could not remove member from the organization.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResetPassword = async (member: OrgMember) => {
    if (!effectiveOrgId) return;
    setActionLoadingId(`reset-${member.id}`);
    setError(null);
    setMessage(null);
    try {
      await fetchWithToken(`/org/members/${member.id}/reset-password`, { method: 'POST' }, effectiveOrgId);
      setMessage(`Password reset flow triggered for ${member.email}.`);
      showSuccess('Miembro actualizado', `Reset de password enviado a ${member.email}.`);
    } catch {
      setError('Reset password endpoint is not enabled yet for this environment.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSendEmailChange = async (member: OrgMember) => {
    if (!effectiveOrgId) return;
    setActionLoadingId(`email-${member.id}`);
    setError(null);
    setMessage(null);
    try {
      await fetchWithToken(`/org/members/${member.id}/send-email-change-link`, { method: 'POST' }, effectiveOrgId);
      setMessage(`Email change link sent to ${member.email}.`);
      showSuccess('Miembro actualizado', `Enlace de cambio de email enviado a ${member.email}.`);
    } catch {
      setError('Send email-change link endpoint is optional and not available yet.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResendInvitation = async (member: OrgMember) => {
    if (!effectiveOrgId) return;

    const domainValidationError = validateInstitutionalEmail(member.email);
    if (domainValidationError) {
      setError(domainValidationError);
      showError(domainValidationError);
      return;
    }

    setActionLoadingId(`invite-${member.id}`);
    setError(null);
    setMessage(null);
    try {
      await inviteMember(effectiveOrgId, {
        email: member.email,
        role: member.role,
        name: member.name || undefined,
      });
      setMessage(`Invitation re-sent to ${member.email}.`);
      showSuccess('Invitacion enviada', `Invitacion reenviada a ${member.email}.`);
      await loadMembers();
    } catch {
      setError('Could not re-send invitation.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (userLoading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading...</div>;
  }

  if (!isOrgAdmin || !effectiveOrgId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600 font-medium">
          You do not have permission to view this section. Only organization admins can manage members.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 w-full">
      <h1 className="text-2xl font-bold text-[#052490] mb-2">
        Members Management - {orgName}
      </h1>
      <p className="text-sm text-[#031C44] mb-6">
        {isSuperAdmin && isImpersonating
          ? 'Super-admin impersonation mode: organization-level member management.'
          : 'Manage members, invitations, and role security for your organization.'}
      </p>

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                activeTab === 'members' ? 'bg-[#052490] text-white' : 'bg-gray-100 text-[#031C44]'
              }`}
              onClick={() => setActiveTab('members')}
            >
              Members
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                activeTab === 'invitations' ? 'bg-[#052490] text-white' : 'bg-gray-100 text-[#031C44]'
              }`}
              onClick={() => setActiveTab('invitations')}
            >
              Pending Invitations
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="px-3 py-2 rounded-md bg-[#2259F2] text-white text-sm hover:bg-[#052490]"
            >
              Invite members
            </button>
            <button
              onClick={exportCsv}
              className="px-3 py-2 rounded-md border border-gray-300 text-sm text-[#031C44] hover:bg-gray-50"
            >
              Export list (CSV)
            </button>
            <Link
              to="/org/invite"
              className="px-3 py-2 rounded-md border border-gray-300 text-sm text-[#031C44] hover:bg-gray-50"
            >
              Open invite page
            </Link>
          </div>
        </div>
      </div>

      {activeTab === 'members' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm md:col-span-2"
            />
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as 'all' | Role)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as MemberStatusFilter)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </div>

          {loading ? (
            <div className="text-[#031C44] py-8">Loading members...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-[#031C44] py-8">No members found for current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Email</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Role</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Status</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Last activity</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Origin</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => (
                    <tr key={member.id} className="border-b border-gray-100">
                      <td className="px-3 py-3 text-sm text-[#031C44]">{member.name || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{member.email}</td>
                      <td className="px-3 py-3 text-sm capitalize">{member.role}</td>
                      <td className="px-3 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(member.status)}`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">{formatDate(member.lastActivity)}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        {member.origin || (member.status === 'invited' ? 'invite' : 'auto-provision')}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(member)}
                            className="text-sm text-[#2259F2] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetPassword(member)}
                            disabled={actionLoadingId === `reset-${member.id}`}
                            className="text-sm text-[#2259F2] hover:underline disabled:opacity-50"
                          >
                            {actionLoadingId === `reset-${member.id}` ? 'Reset password...' : 'Reset password'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendEmailChange(member)}
                            disabled={actionLoadingId === `email-${member.id}`}
                            className="text-sm text-[#2259F2] hover:underline disabled:opacity-50"
                          >
                            {actionLoadingId === `email-${member.id}` ? 'Sending link...' : 'Send email change link'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(member)}
                            disabled={actionLoadingId === member.id}
                            className="text-sm text-red-600 hover:underline disabled:opacity-50"
                          >
                            Remove from school
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'invitations' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          {pendingInvitations.length === 0 ? (
            <div className="text-[#031C44] py-8">No pending invitations.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Invited email</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Requested role</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Invitation date</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Attempts</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Status</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((member) => {
                    const invitationStatus = buildInvitationStatus(member);
                    return (
                      <tr key={member.id} className="border-b border-gray-100">
                        <td className="px-3 py-3 text-sm text-gray-700">{member.email}</td>
                        <td className="px-3 py-3 text-sm capitalize">{member.role}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{formatDate(member.invitedAt)}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{member.inviteAttempts ?? 1}</td>
                        <td className="px-3 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${invitationBadgeClass(invitationStatus)}`}>
                            {invitationStatus}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => handleResendInvitation(member)}
                            disabled={actionLoadingId === `invite-${member.id}`}
                            className="text-sm text-[#2259F2] hover:underline disabled:opacity-50"
                          >
                            {actionLoadingId === `invite-${member.id}` ? 'Sending...' : 'Re-send invitation'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isInviteModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#052490]">Invite members</h3>
              <button
                type="button"
                onClick={() => {
                  setIsInviteModalOpen(false);
                  resetInviteForm();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                x
              </button>
            </div>
            <form onSubmit={handleInviteSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  value={inviteForm.name}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  required
                  type="email"
                  value={inviteForm.email}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="user@school.edu"
                />
                {institutionalDomain && (
                  <p className="text-xs text-gray-500 mt-1">Allowed domain: @{institutionalDomain}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, role: normalizeRole(event.target.value) }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsInviteModalOpen(false);
                    resetInviteForm();
                  }}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={inviteSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteSubmitting}
                  className="px-4 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490] disabled:opacity-60"
                >
                  {inviteSubmitting ? 'Sending...' : 'Send invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingMember && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#052490]">Edit member</h3>
              <button type="button" onClick={() => setEditingMember(null)} className="text-gray-500 hover:text-gray-700">
                x
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  name="name"
                  value={editingMember.name}
                  onChange={handleEditChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  name="email"
                  type="email"
                  value={editingMember.email}
                  onChange={handleEditChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  name="role"
                  value={editingMember.role}
                  onChange={handleEditChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490] disabled:opacity-60"
                  disabled={editSubmitting}
                >
                  {editSubmitting ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgMembersPage;
