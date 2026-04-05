import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrgMembersApi, type OrgMember } from '../../api/orgMembers';
import { useApi } from '../../api/base';
import { useToast } from '../../components/ToastProvider';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { setImpersonationContext } from '../../lib/impersonation';
import { setActiveOrgId } from '../../lib/apiClient';
import { getSyncUiBadge, getSyncUiMessage, type SyncUiState } from '../../lib/syncUi';

type DetailTab = 'summary' | 'org-admin';
type SyncHealth = 'ok' | 'pending' | 'partial-error';
type ImpersonationRole = 'admin' | 'teacher' | 'student';

type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  institutionalDomain: string;
  syncStatus: SyncHealth;
  createdAt: string | null;
  primaryAdminName: string;
  primaryAdminEmail: string;
  logoUrl: string | null;
};

type EditBasicsForm = {
  name: string;
  institutionalDomain: string;
  logoUrl: string;
};

const DEFAULT_SCHOOL_IMAGE =
  'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80';

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeStatus = (value: unknown): SyncHealth => {
  const status = normalizeText(value).toLowerCase();
  if (status.includes('error') || status.includes('fail')) return 'partial-error';
  if (status.includes('ok') || status.includes('ready') || status.includes('active') || status.includes('success')) {
    return 'ok';
  }
  return 'pending';
};

const toOrganizationRecord = (row: Record<string, unknown>): OrganizationRecord => {
  const id = normalizeText(row.id || row.organizationId || row.orgId);
  const name = normalizeText(row.name || row.organizationName || row.displayName) || 'Unnamed school';
  const slug = normalizeText(row.slug || row.subdomainSlug);
  const subdomain = normalizeText(row.subdomain || row.domain) || (slug ? `${slug}.learnsocialstudies.cloud` : '-');
  const institutionalDomain =
    normalizeText(row.institutionalDomain || row.domainRestriction || row.allowedDomain) || '-';

  const adminObject = typeof row.admin === 'object' && row.admin !== null
    ? (row.admin as Record<string, unknown>)
    : null;
  const primaryAdminName =
    normalizeText(row.primaryAdmin || row.primaryAdminName || row.adminName || adminObject?.name) || 'Unassigned';
  const primaryAdminEmail =
    normalizeText(row.primaryAdminEmail || row.adminEmail || row.ownerEmail || adminObject?.email) || '-';

  const createdAtRaw = normalizeText(row.createdAt || row.created_at || row.creationDate);
  const logoUrl = normalizeText(row.logoUrl || row.logo || row.image || row.coverImage) || null;

  return {
    id,
    name,
    slug,
    subdomain,
    institutionalDomain,
    syncStatus: normalizeStatus(row.syncStatus || row.status || row.provisioningStatus),
    createdAt: createdAtRaw || null,
    primaryAdminName,
    primaryAdminEmail,
    logoUrl,
  };
};

const formatDate = (value: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-CO');
};

const toSyncUiState = (status: SyncHealth): SyncUiState => {
  if (status === 'ok') return 'ok';
  if (status === 'partial-error') return 'partial-error';
  return 'pending';
};

const roleLabel = (role: ImpersonationRole) => {
  if (role === 'admin') return 'Admin';
  if (role === 'teacher') return 'Teacher';
  return 'Student';
};

const updateAsDataUrl = (file: File, onDone: (dataUrl: string) => void) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') onDone(reader.result);
  };
  reader.readAsDataURL(file);
};

const OrganizationDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSuperAdmin } = useCurrentUser();
  const { fetchWithToken } = useApi();
  const { showError, showInfo, showSuccess } = useToast();
  const { listMembers, updateMemberRole } = useOrgMembersApi();

  const [activeTab, setActiveTab] = useState<DetailTab>('summary');
  const [organization, setOrganization] = useState<OrganizationRecord | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [savingBasics, setSavingBasics] = useState(false);
  const [assigningAdmins, setAssigningAdmins] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditBasicsForm>({
    name: '',
    institutionalDomain: '',
    logoUrl: '',
  });

  const orgId = id || '';

  // Set the active org context for super-admin accessing /org/* routes
  useEffect(() => {
    if (orgId) {
      setActiveOrgId(orgId);
    }
    // Clean up when component unmounts or orgId changes
    return () => setActiveOrgId(null);
  }, [orgId]);

  useEffect(() => {
    if (!isSuperAdmin || !orgId) return;

    const loadOrganization = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchWithToken<unknown>('/organizations', { method: 'GET' });
        const rows = Array.isArray(payload)
          ? payload
          : (payload as { organizations?: unknown[]; data?: unknown[] }).organizations ||
            (payload as { organizations?: unknown[]; data?: unknown[] }).data ||
            [];
        const list = Array.isArray(rows)
          ? rows.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
          : [];

        const found = list.find((row) => normalizeText(row.id || row.organizationId || row.orgId) === orgId);
        if (!found) {
          setError('School was not found.');
          showError('Error: reintenta mas tarde o contacta soporte.');
          setOrganization(null);
          return;
        }

        const mapped = toOrganizationRecord(found);
        setOrganization(mapped);
        setEditForm({
          name: mapped.name,
          institutionalDomain: mapped.institutionalDomain === '-' ? '' : mapped.institutionalDomain,
          logoUrl: mapped.logoUrl || '',
        });
      } catch {
        setError('Could not load school details.');
        showError('Error: reintenta mas tarde o contacta soporte.');
      } finally {
        setLoading(false);
      }
    };

    void loadOrganization();
  }, [fetchWithToken, isSuperAdmin, orgId, showError]);

  useEffect(() => {
    if (!isSuperAdmin || !orgId) return;

    const loadMembers = async () => {
      setLoadingMembers(true);
      setMembersError(null);
      try {
        const data = await listMembers(orgId);
        const normalized = Array.isArray(data) ? data : [];
        setMembers(normalized);
        setSelectedAdminIds(normalized.filter((member) => member.role === 'admin').map((member) => member.id));
      } catch {
        setMembersError('Could not load tenant users.');
        showError('Error: reintenta mas tarde o contacta soporte.');
      } finally {
        setLoadingMembers(false);
      }
    };

    void loadMembers();
  }, [isSuperAdmin, listMembers, orgId, showError]);

  const adminMembers = useMemo(() => members.filter((member) => member.role === 'admin'), [members]);

  const filteredMembers = useMemo(() => {
    const term = assignSearch.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) => {
      const name = (member.name || '').toLowerCase();
      const email = member.email.toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [assignSearch, members]);

  const recentLogs = useMemo(() => {
    if (!organization) return [];
    const now = new Date().toISOString();
    const wpState = toSyncUiState(organization.syncStatus);
    const moodleState: SyncUiState = organization.syncStatus === 'partial-error' ? 'pending' : wpState;
    const crmState: SyncUiState = organization.syncStatus === 'pending' ? 'pending' : wpState;
    return [
      {
        id: `${organization.id}-wp`,
        source: 'WordPress',
        status: getSyncUiBadge(wpState).label,
        timestamp: organization.createdAt || now,
        details: getSyncUiMessage(wpState),
      },
      {
        id: `${organization.id}-moodle`,
        source: 'Moodle',
        status: getSyncUiBadge(moodleState).label,
        timestamp: now,
        details: getSyncUiMessage(moodleState),
      },
      {
        id: `${organization.id}-crm`,
        source: 'CRM',
        status: getSyncUiBadge(crmState).label,
        timestamp: now,
        details: getSyncUiMessage(crmState),
      },
    ];
  }, [organization]);

  const handleImpersonate = (role: ImpersonationRole) => {
    if (!organization) return;
    setImpersonationContext({
      orgId: organization.id,
      orgName: organization.name,
      role,
    });
    showInfo('Impersonacion iniciada', `Ahora operas como ${roleLabel(role)} de ${organization.name}.`);
    navigate('/');
  };

  const handleOpenEditModal = () => {
    if (!organization) return;
    setActionError(null);
    setActionSuccess(null);
    setEditForm({
      name: organization.name,
      institutionalDomain: organization.institutionalDomain === '-' ? '' : organization.institutionalDomain,
      logoUrl: organization.logoUrl || '',
    });
    setIsEditModalOpen(true);
  };

  const handleEditImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateAsDataUrl(file, (dataUrl) => setEditForm((prev) => ({ ...prev, logoUrl: dataUrl })));
  };

  const handleSaveBasics = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization) return;
    setSavingBasics(true);
    setActionError(null);
    setActionSuccess(null);

    const payload = {
      name: editForm.name.trim(),
      institutionalDomain: editForm.institutionalDomain.trim(),
      logoUrl: editForm.logoUrl.trim(),
    };

    try {
      await fetchWithToken(`/organizations/${organization.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setActionSuccess('Basic data was updated.');
      showSuccess('Colegio actualizado', 'Los datos basicos se guardaron correctamente.');
    } catch {
      setActionSuccess('Sincronizacion incompleta. Los datos fueron aplicados en UI.');
      showError('Sincronizacion incompleta', 'Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setOrganization((prev) =>
        prev
          ? {
              ...prev,
              name: payload.name || prev.name,
              institutionalDomain: payload.institutionalDomain || '-',
              logoUrl: payload.logoUrl || prev.logoUrl,
            }
          : prev,
      );
      setSavingBasics(false);
      setIsEditModalOpen(false);
    }
  };

  const toggleAdminCandidate = (memberId: string) => {
    setSelectedAdminIds((prev) =>
      prev.includes(memberId) ? prev.filter((idValue) => idValue !== memberId) : [...prev, memberId],
    );
  };

  const handleAssignAdmins = async () => {
    if (!organization || selectedAdminIds.length === 0) {
      setActionError('Select at least one user.');
      return;
    }
    setAssigningAdmins(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const results = await Promise.allSettled(
        selectedAdminIds.map((memberId) => updateMemberRole(organization.id, memberId, 'admin')),
      );
      const failed = results.filter((result) => result.status === 'rejected').length;
      setMembers((prev) =>
        prev.map((member) => (selectedAdminIds.includes(member.id) ? { ...member, role: 'admin' } : member)),
      );
      if (failed > 0) {
        setActionError(`Admins were assigned partially. ${failed} update(s) failed.`);
        showError('Sincronizacion incompleta', `${failed} actualizacion(es) fallaron.`);
      } else {
        setActionSuccess('Organization admins were updated.');
        showSuccess('Miembro actualizado', 'Los roles de admin se actualizaron correctamente.');
      }
      setIsAssignModalOpen(false);
    } catch {
      setActionError('Could not assign organization admins.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setAssigningAdmins(false);
    }
  };

  if (!isSuperAdmin) return <div className="p-8 text-red-600">Only super-admin can access this page.</div>;
  if (!orgId) return <div className="p-8 text-red-600">Invalid organization id.</div>;
  if (loading) return <div className="p-8 text-[#031C44]">Loading organization detail...</div>;
  if (error || !organization) return <div className="p-8 text-red-600">{error || 'Could not load organization.'}</div>;

  const syncState = toSyncUiState(organization.syncStatus);
  const badge = getSyncUiBadge(syncState);
  const syncMessage = getSyncUiMessage(syncState);
  const displayedImage = editForm.logoUrl || organization.logoUrl || DEFAULT_SCHOOL_IMAGE;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#052490]">Organizations Detail</h1>
        <button
          type="button"
          onClick={() => navigate('/organizations')}
          className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Back to list
        </button>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>
      )}
      {actionSuccess && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{actionSuccess}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
          <div className="h-full min-h-[260px] bg-gray-100">
            <img src={displayedImage} alt={organization.name} className="h-full w-full object-cover" />
          </div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[#031C44]">{organization.name}</h2>
                <p className="text-sm text-gray-500 mt-1">{organization.slug || organization.subdomain}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.className}`}>{badge.label}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
              <div>
                <p className="text-xs text-gray-500">Organization ID</p>
                <p className="text-sm font-mono text-[#031C44]">{organization.id}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Institutional domain</p>
                <p className="text-sm text-[#031C44]">{organization.institutionalDomain}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Primary admin</p>
                <p className="text-sm text-[#031C44]">{organization.primaryAdminName}</p>
                <p className="text-xs text-gray-500">{organization.primaryAdminEmail}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Created at</p>
                <p className="text-sm text-[#031C44]">{formatDate(organization.createdAt)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-6">
              <button
                type="button"
                onClick={handleOpenEditModal}
                className="px-3 py-2 rounded-md border border-[#2259F2] text-[#052490] hover:bg-blue-50"
              >
                Edit basic data
              </button>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(true)}
                className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Assign organization admin
              </button>
              {(['admin', 'teacher', 'student'] as ImpersonationRole[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleImpersonate(role)}
                  className="px-3 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490]"
                >
                  Impersonate as {roleLabel(role)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex gap-1 p-3 border-b border-gray-200">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              activeTab === 'summary' ? 'bg-[#052490] text-white' : 'text-[#031C44] hover:bg-gray-100'
            }`}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              activeTab === 'org-admin' ? 'bg-[#052490] text-white' : 'text-[#031C44] hover:bg-gray-100'
            }`}
            onClick={() => setActiveTab('org-admin')}
          >
            Organization admin
          </button>
        </div>

        {activeTab === 'summary' ? (
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-500">WordPress</p>
                <p className="text-lg font-semibold text-[#031C44]">{badge.label}</p>
                <p className="text-xs text-gray-500 mt-1">{syncMessage}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Moodle</p>
                <p className="text-lg font-semibold text-[#031C44]">{badge.label}</p>
                <p className="text-xs text-gray-500 mt-1">{syncMessage}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-500">CRM</p>
                <p className="text-lg font-semibold text-[#031C44]">{badge.label}</p>
                <p className="text-xs text-gray-500 mt-1">{syncMessage}</p>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-[#031C44] mb-3">Recent logs</h3>
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div key={log.id} className="rounded-md border border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-[#031C44]">{log.source}</p>
                    <span className="text-xs text-gray-500">{formatDate(log.timestamp)}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{log.details}</p>
                  <p className="text-xs mt-2 text-[#052490]">Status: {log.status}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#031C44]">Current school admins</h3>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(true)}
                className="px-3 py-1.5 rounded-md border border-[#2259F2] text-[#052490] hover:bg-blue-50 text-sm"
              >
                Assign organization admin
              </button>
            </div>

            {loadingMembers ? (
              <div className="text-sm text-gray-600">Loading tenant users...</div>
            ) : membersError ? (
              <div className="text-sm text-red-600">{membersError}</div>
            ) : adminMembers.length === 0 ? (
              <div className="text-sm text-gray-600">No admins assigned yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-xs uppercase text-gray-500">Name</th>
                      <th className="text-left py-2 text-xs uppercase text-gray-500">Email</th>
                      <th className="text-left py-2 text-xs uppercase text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminMembers.map((member) => (
                      <tr key={member.id} className="border-b border-gray-100">
                        <td className="py-2 text-sm text-[#031C44]">{member.name || '-'}</td>
                        <td className="py-2 text-sm text-gray-700">{member.email}</td>
                        <td className="py-2 text-xs text-gray-600 capitalize">{member.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {isEditModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#052490]">Edit basic data</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                x
              </button>
            </div>
            <form onSubmit={handleSaveBasics} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">School name</label>
                <input
                  required
                  value={editForm.name}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Institutional domain</label>
                <input
                  value={editForm.institutionalDomain}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, institutionalDomain: event.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="@school.edu"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL (optional)</label>
                <input
                  value={editForm.logoUrl}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, logoUrl: event.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload card image</label>
                <input type="file" accept="image/*" onChange={handleEditImage} className="block w-full text-sm" />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={savingBasics}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490] disabled:opacity-60"
                  disabled={savingBasics}
                >
                  {savingBasics ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#052490]">Select organization admin</h3>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                x
              </button>
            </div>
            <div className="p-6">
              <input
                value={assignSearch}
                onChange={(event) => setAssignSearch(event.target.value)}
                placeholder="Search by name or email"
                className="w-full border border-gray-300 rounded-md px-3 py-2 mb-4"
              />

              {loadingMembers ? (
                <div className="text-sm text-gray-600">Loading users...</div>
              ) : membersError ? (
                <div className="text-sm text-red-600">{membersError}</div>
              ) : filteredMembers.length === 0 ? (
                <div className="text-sm text-gray-600">No users match this search.</div>
              ) : (
                <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-md">
                  <ul>
                    {filteredMembers.map((member) => {
                      const checked = selectedAdminIds.includes(member.id);
                      return (
                        <li key={member.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAdminCandidate(member.id)}
                              className="mt-1"
                            />
                            <div>
                              <p className="text-sm font-medium text-[#031C44]">{member.name || '-'}</p>
                              <p className="text-xs text-gray-600">{member.email}</p>
                              <p className="text-xs text-gray-500 mt-1">Current role: {member.role}</p>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={assigningAdmins}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAssignAdmins}
                  className="px-4 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490] disabled:opacity-60"
                  disabled={assigningAdmins}
                >
                  {assigningAdmins ? 'Assigning...' : 'Assign admin'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationDetails;
