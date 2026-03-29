import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/base';
import { useOrgMembersApi, type OrgMember } from '../../api/orgMembers';
import { useToast } from '../../components/ToastProvider';
import { useCurrentUser } from '../../hooks/useCurrentUser';

type UnknownRecord = Record<string, unknown>;

type SchoolOverview = {
  id: string;
  name: string;
  subdomain: string;
  institutionalDomain: string;
};

type GroupSummary = {
  id: string;
  status: string;
  active?: boolean;
};

type CourseSummary = {
  id: string;
};

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return fallback;
};

const extractPayloadArray = (payload: unknown): UnknownRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is UnknownRecord => typeof item === 'object' && item !== null);
  }
  if (typeof payload !== 'object' || payload === null) return [];
  const response = payload as UnknownRecord;
  const candidates = [response.items, response.data, response.groups, response.courses];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is UnknownRecord => typeof item === 'object' && item !== null);
    }
  }
  return [];
};

const mapGroup = (row: UnknownRecord, index: number): GroupSummary => ({
  id: asString(row.id, `group-${index + 1}`),
  status: asString(row.status).toLowerCase(),
  active: typeof row.active === 'boolean' ? row.active : undefined,
});

const mapCourse = (row: UnknownRecord, index: number): CourseSummary => ({
  id: asString(row.id, `course-${index + 1}`),
});

const isGroupActive = (group: GroupSummary) => {
  if (typeof group.active === 'boolean') return group.active;
  if (!group.status) return true;
  return group.status === 'active' || group.status === 'ok' || group.status === 'ready';
};

const resolveSchoolFromOrganizationsPayload = (payload: unknown, orgId: string): SchoolOverview | null => {
  const rows = Array.isArray(payload)
    ? payload
    : (payload as { organizations?: unknown[]; data?: unknown[] })?.organizations ||
      (payload as { organizations?: unknown[]; data?: unknown[] })?.data ||
      [];

  if (!Array.isArray(rows)) return null;

  const list = rows.filter((item): item is UnknownRecord => typeof item === 'object' && item !== null);
  const found = list.find((row) => asString(row.id || row.organizationId || row.orgId) === orgId);
  if (!found) return null;

  const slug = asString(found.slug || found.subdomainSlug);
  const subdomain = asString(found.subdomain || found.domain) || (slug ? `${slug}.learnsocialstudies.cloud` : '-');
  return {
    id: asString(found.id || found.organizationId || found.orgId, orgId),
    name: asString(found.name || found.organizationName || found.displayName, 'School'),
    subdomain,
    institutionalDomain: asString(found.institutionalDomain || found.domainRestriction || found.allowedDomain, '-'),
  };
};

export default function OrgOverview() {
  const { fetchWithToken } = useApi();
  const { listMembers } = useOrgMembersApi();
  const { showError, showSuccess } = useToast();
  const {
    effectiveOrgId,
    currentOrganization,
    impersonatedOrgName,
    isSuperAdmin,
    isImpersonating,
  } = useCurrentUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [school, setSchool] = useState<SchoolOverview | null>(null);

  const [editingDomain, setEditingDomain] = useState(false);
  const [savingDomain, setSavingDomain] = useState(false);
  const [institutionalDomainDraft, setInstitutionalDomainDraft] = useState('');
  const [domainMessage, setDomainMessage] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!effectiveOrgId) {
      setLoading(false);
      setError('No active organization.');
      return;
    }

    setLoading(true);
    setError(null);
    setDomainMessage(null);

    try {
      const membersPromise = listMembers(effectiveOrgId);
      const groupsPromise = fetchWithToken<unknown>('/org/groups', { method: 'GET' }, effectiveOrgId);
      const coursesPromise = fetchWithToken<unknown>('/org/courses', { method: 'GET' }, effectiveOrgId);

      const [membersResult, groupsResult, coursesResult] = await Promise.allSettled([
        membersPromise,
        groupsPromise,
        coursesPromise,
      ]);

      if (membersResult.status === 'fulfilled') {
        setMembers(Array.isArray(membersResult.value) ? membersResult.value : []);
      } else {
        setMembers([]);
      }

      if (groupsResult.status === 'fulfilled') {
        setGroups(extractPayloadArray(groupsResult.value).map(mapGroup));
      } else {
        setGroups([]);
      }

      if (coursesResult.status === 'fulfilled') {
        setCourses(extractPayloadArray(coursesResult.value).map(mapCourse));
      } else {
        setCourses([]);
      }

      if (isSuperAdmin) {
        try {
          const orgPayload = await fetchWithToken<unknown>('/organizations', { method: 'GET' });
          const resolved = resolveSchoolFromOrganizationsPayload(orgPayload, effectiveOrgId);
          if (resolved) {
            setSchool(resolved);
            setInstitutionalDomainDraft(resolved.institutionalDomain === '-' ? '' : resolved.institutionalDomain);
          }
        } catch {
          // no-op fallback below
        }
      }
    } catch {
      setError('Could not load school overview.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setLoading(false);
    }
  }, [effectiveOrgId, fetchWithToken, isSuperAdmin, listMembers, showError]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!school) {
      setSchool({
        id: effectiveOrgId || '-',
        name: impersonatedOrgName || currentOrganization?.name || 'School',
        subdomain: '-',
        institutionalDomain: '-',
      });
      setInstitutionalDomainDraft('');
    }
  }, [currentOrganization?.name, effectiveOrgId, impersonatedOrgName, school]);

  const teacherCount = useMemo(() => members.filter((member) => member.role === 'teacher').length, [members]);
  const studentCount = useMemo(() => members.filter((member) => member.role === 'student').length, [members]);
  const activeGroupsCount = useMemo(() => groups.filter(isGroupActive).length, [groups]);
  const coursesCount = courses.length;

  const handleSaveInstitutionalDomain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!effectiveOrgId || !isSuperAdmin) return;

    const newDomain = institutionalDomainDraft.trim();
    setSavingDomain(true);
    try {
      await fetchWithToken(`/organizations/${effectiveOrgId}`, {
        method: 'PATCH',
        body: JSON.stringify({ institutionalDomain: newDomain }),
      });
      setSchool((prev) => (prev ? { ...prev, institutionalDomain: newDomain || '-' } : prev));
      setDomainMessage('Institutional domain updated.');
      showSuccess('Colegio actualizado', 'Dominio institucional actualizado.');
      setEditingDomain(false);
    } catch {
      setSchool((prev) => (prev ? { ...prev, institutionalDomain: newDomain || '-' } : prev));
      setDomainMessage('Sincronizacion incompleta. Dominio actualizado en UI.');
      showError('Sincronizacion incompleta', 'Error: reintenta mas tarde o contacta soporte.');
      setEditingDomain(false);
    } finally {
      setSavingDomain(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading school panel...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-600">{error}</div>;
  }

  if (!effectiveOrgId) {
    return <div className="p-8 text-red-600">No active organization.</div>;
  }

  const schoolName = school?.name || 'School';
  const subdomain = school?.subdomain || '-';
  const institutionalDomain = school?.institutionalDomain || '-';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#052490]">My School</h1>
        <p className="text-sm text-[#031C44]">
          {isImpersonating
            ? `Institutional panel for ${schoolName} (impersonation mode).`
            : `Institutional panel for ${schoolName}.`}
        </p>
      </div>

      {domainMessage && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {domainMessage}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">School name</p>
            <p className="text-lg font-semibold text-[#031C44] mt-1">{schoolName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Subdomain</p>
            <p className="text-sm text-[#031C44] mt-1">{subdomain}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Institutional invite domain</p>
            {!isSuperAdmin || !editingDomain ? (
              <div className="mt-1">
                <p className="text-sm text-[#031C44]">{institutionalDomain}</p>
                {isSuperAdmin ? (
                  <button
                    type="button"
                    onClick={() => setEditingDomain(true)}
                    className="mt-2 text-sm text-[#2259F2] hover:underline"
                  >
                    Edit domain
                  </button>
                ) : (
                  <p className="text-xs text-gray-500 mt-2">Read-only. Only super-admin can edit this field.</p>
                )}
              </div>
            ) : (
              <form onSubmit={handleSaveInstitutionalDomain} className="mt-1 flex flex-col gap-2">
                <input
                  value={institutionalDomainDraft}
                  onChange={(event) => setInstitutionalDomainDraft(event.target.value)}
                  placeholder="@school.edu"
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-md bg-[#2259F2] text-white text-sm hover:bg-[#052490] disabled:opacity-60"
                    disabled={savingDomain}
                  >
                    {savingDomain ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDomain(false);
                      setInstitutionalDomainDraft(institutionalDomain === '-' ? '' : institutionalDomain);
                    }}
                    className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                    disabled={savingDomain}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Teachers</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{teacherCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Students</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{studentCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Active groups</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{activeGroupsCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Courses</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{coursesCount}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-base font-semibold text-[#031C44] mb-3">Quick links</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/org/members"
            className="px-4 py-2 rounded-md bg-[#2259F2] text-white font-medium hover:bg-[#052490] transition-colors"
          >
            View members
          </a>
          <a
            href="/org/groups"
            className="px-4 py-2 rounded-md bg-white border border-gray-300 text-[#052490] font-medium hover:bg-gray-50 transition-colors"
          >
            View groups and courses
          </a>
          <a
            href="/org/enroll"
            className="px-4 py-2 rounded-md bg-white border border-gray-300 text-[#052490] font-medium hover:bg-gray-50 transition-colors"
          >
            Bulk enrollment
          </a>
        </div>
      </div>
    </div>
  );
}
