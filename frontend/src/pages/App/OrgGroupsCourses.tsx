import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../api/base';
import { useOrgMembersApi, type OrgMember } from '../../api/orgMembers';
import { useToast } from '../../components/ToastProvider';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { getSyncUiBadge, getSyncUiMessage, type SyncUiState } from '../../lib/syncUi';

type UnknownRecord = Record<string, unknown>;
type CreateStep = 1 | 2 | 3 | 4;
type SyncBadge = 'ok' | 'pending' | 'partial-error';

type GroupRow = {
  id: string;
  name: string;
  moodleCourseId: string;
  moodleCourseName: string;
  teacherId: string;
  teacherName: string;
  studentsCount: number;
  moodleStatus: SyncBadge;
  buddyBossStatus: SyncBadge;
  createdAt: string | null;
  moodleCourseUrl: string | null;
  buddyBossUrl: string | null;
};

type CourseOption = {
  id: string;
  name: string;
  moodleCourseUrl: string | null;
};

type CreateGroupResultStatus = 'idle' | 'ok' | 'pending' | 'error';

type CreateGroupResult = {
  moodleGroup: CreateGroupResultStatus;
  cohorts: CreateGroupResultStatus;
  buddyBossSubgroup: CreateGroupResultStatus;
};

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return fallback;
};

const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeSync = (value: unknown): SyncBadge => {
  const status = asString(value).toLowerCase();
  if (status.includes('error') || status.includes('fail')) return 'partial-error';
  if (status.includes('ok') || status.includes('ready') || status.includes('active') || status.includes('success')) return 'ok';
  return 'pending';
};

const extractArray = (payload: unknown): UnknownRecord[] => {
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

const mapGroup = (row: UnknownRecord, index: number): GroupRow => {
  const id = asString(row.id, `group-${index + 1}`);
  const moodleCourseName = asString(row.courseName || row.courseTitle || row.course, 'Course');
  const teacherName = asString(row.teacherName || row.teacher || row.ownerName, 'Teacher');
  const moodleStatus = normalizeSync(row.moodleStatus || row.moodleSync || row.syncStatus || row.status);
  const buddyBossStatus = normalizeSync(row.buddyBossStatus || row.bbStatus || row.communityStatus || row.syncStatus);

  return {
    id,
    name: asString(row.name || row.groupName || row.title, `Group ${index + 1}`),
    moodleCourseId: asString(row.courseId || row.moodleCourseId),
    moodleCourseName,
    teacherId: asString(row.teacherId),
    teacherName,
    studentsCount: asNumber(row.studentsCount ?? row.studentCount ?? row.membersCount),
    moodleStatus,
    buddyBossStatus,
    createdAt: asString(row.createdAt || row.created_at || row.creationDate) || null,
    moodleCourseUrl: asString(row.moodleCourseUrl || row.courseUrl) || null,
    buddyBossUrl: asString(row.buddyBossUrl || row.communityUrl || row.groupUrl) || null,
  };
};

const mapCourse = (row: UnknownRecord, index: number): CourseOption => ({
  id: asString(row.id, `course-${index + 1}`),
  name: asString(row.name || row.title || row.fullname, `Course ${index + 1}`),
  moodleCourseUrl: asString(row.moodleCourseUrl || row.url) || null,
});

const formatDate = (value: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-CO');
};

const toSyncUiState = (status: SyncBadge): SyncUiState => {
  if (status === 'ok') return 'ok';
  if (status === 'partial-error') return 'partial-error';
  return 'pending';
};

const syncLabel = (status: SyncBadge) => getSyncUiBadge(toSyncUiState(status));

const resultLabel = (status: CreateGroupResultStatus) => {
  if (status === 'ok') return { text: 'ok', className: 'bg-green-100 text-green-800' };
  if (status === 'error') return { text: 'error', className: 'bg-red-100 text-red-800' };
  if (status === 'pending') return { text: 'pending', className: 'bg-yellow-100 text-yellow-800' };
  return { text: 'idle', className: 'bg-gray-100 text-gray-600' };
};

export default function OrgGroupsCourses() {
  const { fetchWithToken } = useApi();
  const { listMembers } = useOrgMembersApi();
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

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [teachers, setTeachers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>(1);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<CreateGroupResult>({
    moodleGroup: 'idle',
    cohorts: 'idle',
    buddyBossSubgroup: 'idle',
  });

  const orgName = impersonatedOrgName || currentOrganization?.name || 'School';
  const canCreate = isOrgAdmin && (!isSuperAdmin || isImpersonating);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );

  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.id === selectedTeacherId) || null,
    [teachers, selectedTeacherId],
  );

  const loadData = useCallback(async () => {
    if (userLoading || !effectiveOrgId || !isOrgAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [groupsResult, coursesResult, membersResult] = await Promise.allSettled([
        fetchWithToken<unknown>('/org/groups', { method: 'GET' }, effectiveOrgId),
        fetchWithToken<unknown>('/org/courses', { method: 'GET' }, effectiveOrgId),
        listMembers(effectiveOrgId),
      ]);

      if (groupsResult.status === 'fulfilled') {
        setGroups(extractArray(groupsResult.value).map(mapGroup));
      } else {
        setGroups([]);
      }

      if (coursesResult.status === 'fulfilled') {
        setCourses(extractArray(coursesResult.value).map(mapCourse));
      } else {
        setCourses([]);
      }

      if (membersResult.status === 'fulfilled') {
        const users = Array.isArray(membersResult.value) ? membersResult.value : [];
        setTeachers(users.filter((member) => member.role === 'teacher'));
      } else {
        setTeachers([]);
      }
    } catch {
      setError('Could not load groups and courses data.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setLoading(false);
    }
  }, [effectiveOrgId, fetchWithToken, isOrgAdmin, listMembers, showError, userLoading]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedCourse || !selectedTeacher) return;
    if (groupName.trim().length > 0) return;
    setGroupName(`${selectedCourse.name} - ${selectedTeacher.name || selectedTeacher.email}`);
  }, [groupName, selectedCourse, selectedTeacher]);

  const resetCreateModal = () => {
    setCreateStep(1);
    setSelectedCourseId('');
    setSelectedTeacherId('');
    setGroupName('');
    setCreating(false);
    setCreateResult({
      moodleGroup: 'idle',
      cohorts: 'idle',
      buddyBossSubgroup: 'idle',
    });
  };

  const openCreateModal = () => {
    setError(null);
    setMessage(null);
    resetCreateModal();
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    resetCreateModal();
  };

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!effectiveOrgId || !selectedCourse || !selectedTeacher) return;
    if (!canCreate) {
      setError('Only organization admins can create teacher groups.');
      showError('Error: reintenta mas tarde o contacta soporte.');
      return;
    }

    setCreating(true);
    setError(null);
    setMessage(null);
    setCreateResult({
      moodleGroup: 'pending',
      cohorts: 'pending',
      buddyBossSubgroup: 'pending',
    });

    const payload = {
      courseId: selectedCourse.id,
      teacherId: selectedTeacher.id,
      teacherName: selectedTeacher.name || selectedTeacher.email,
      groupName: groupName.trim(),
    };

    try {
      let response: unknown;
      try {
        response = await fetchWithToken('/org/groups', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, effectiveOrgId);
      } catch {
        response = await fetchWithToken(`/organizations/${effectiveOrgId}/groups`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      const results = (response as { results?: Record<string, unknown> })?.results || {};
      const moodleOk = asString(results.moodleGroup || results.moodle).toLowerCase() === 'fulfilled';
      const cohortOk = asString(results.teacherCohort || results.cohorts).toLowerCase() === 'fulfilled';
      const buddyOk = asString(results.bbSubgroup || results.buddyboss).toLowerCase() === 'fulfilled';

      setCreateResult({
        moodleGroup: moodleOk ? 'ok' : 'error',
        cohorts: cohortOk ? 'ok' : 'error',
        buddyBossSubgroup: buddyOk ? 'ok' : 'error',
      });

      if (moodleOk && cohortOk && buddyOk) {
        setMessage('Teacher group creation flow completed.');
        showSuccess('Grupo creado', 'Sincronizacion completada en Moodle, cohorts y BuddyBoss.');
      } else {
        setMessage('Sincronizacion incompleta. Revisa el estado por paso.');
        showError('Sincronizacion incompleta', 'Error: reintenta mas tarde o contacta soporte.');
      }
      await loadData();
    } catch {
      setCreateResult({
        moodleGroup: 'error',
        cohorts: 'error',
        buddyBossSubgroup: 'error',
      });
      setError('Could not create the teacher group. Verify backend endpoints for /org/groups or /organizations/:orgId/groups.');
      showError('No se pudo crear el grupo, intenta de nuevo.');
    } finally {
      setCreating(false);
      setCreateStep(4);
    }
  };

  if (userLoading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading...</div>;
  }

  if (!isOrgAdmin || !effectiveOrgId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600 font-medium">
          Access denied. Only organization admins can manage teacher groups and courses.
        </p>
      </div>
    );
  }

  if (isSuperAdmin && !isImpersonating) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-[#031C44]">
          Super-admin must impersonate an organization admin to use this panel.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 w-full">
      <h1 className="text-2xl font-bold text-[#052490] mb-2">Org Groups and Courses</h1>
      <p className="text-sm text-[#031C44] mb-6">
        Teacher groups for {orgName}. Admins can create and synchronize groups with Moodle and BuddyBoss.
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

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={openCreateModal}
          disabled={!canCreate}
          className="px-4 py-2 rounded-md bg-[#2259F2] text-white font-medium hover:bg-[#052490] disabled:opacity-60"
        >
          Create teacher group
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        {loading ? (
          <div className="py-8 text-[#031C44]">Loading groups...</div>
        ) : groups.length === 0 ? (
          <div className="py-8 text-[#031C44]">No teacher groups yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Group name</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Moodle course</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Assigned teacher</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Students</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Sync status</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Created at</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const moodleBadge = syncLabel(group.moodleStatus);
                  const buddyBadge = syncLabel(group.buddyBossStatus);
                  return (
                    <tr key={group.id} className="border-b border-gray-100">
                      <td className="px-3 py-3 text-sm text-[#031C44] font-medium">{group.name}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{group.moodleCourseName}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{group.teacherName}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{group.studentsCount}</td>
                      <td className="px-3 py-3 text-sm">
                        <div className="flex flex-wrap gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${moodleBadge.className}`}>
                            Moodle: {moodleBadge.label}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${buddyBadge.className}`}>
                            BuddyBoss: {buddyBadge.label}
                          </span>
                        </div>
                        {(group.moodleStatus === 'partial-error' || group.buddyBossStatus === 'partial-error') && (
                          <p className="text-xs text-red-600 mt-1">{getSyncUiMessage('partial-error')}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">{formatDate(group.createdAt)}</td>
                      <td className="px-3 py-3 text-sm">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to={`/org/members?groupId=${encodeURIComponent(group.id)}`}
                            className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            View students
                          </Link>
                          {group.moodleCourseUrl ? (
                            <a
                              href={group.moodleCourseUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-md bg-[#2259F2] text-white hover:bg-[#052490]"
                            >
                              Go to Moodle course
                            </a>
                          ) : (
                            <span className="px-3 py-1.5 rounded-md border border-gray-200 text-gray-400">
                              Moodle n/a
                            </span>
                          )}
                          {group.buddyBossUrl ? (
                            <a
                              href={group.buddyBossUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-md border border-[#2259F2] text-[#052490] hover:bg-blue-50"
                            >
                              Go to BuddyBoss subgroup
                            </a>
                          ) : (
                            <span className="px-3 py-1.5 rounded-md border border-gray-200 text-gray-400">
                              BuddyBoss n/a
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#052490]">Create teacher group</h3>
              <button type="button" onClick={closeCreateModal} className="text-gray-500 hover:text-gray-700">
                x
              </button>
            </div>
            <form onSubmit={createGroup} className="p-6 space-y-5">
              <div className="grid grid-cols-4 gap-2 text-xs">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`rounded-md px-2 py-1 text-center ${
                      createStep >= step ? 'bg-[#052490] text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Step {step}
                  </div>
                ))}
              </div>

              {createStep === 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Step 1: Select course</label>
                  <select
                    value={selectedCourseId}
                    onChange={(event) => setSelectedCourseId(event.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="">Select a course...</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {createStep === 2 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Step 2: Select teacher</label>
                  <select
                    value={selectedTeacherId}
                    onChange={(event) => setSelectedTeacherId(event.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="">Select a teacher...</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name || teacher.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {createStep === 3 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Step 3: Group name</label>
                  <input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="Course + section"
                  />
                  <p className="text-xs text-gray-500 mt-1">Suggested: Course + section.</p>
                </div>
              )}

              {createStep === 4 && (
                <div className="space-y-3">
                  <p className="text-sm text-[#031C44]">Step 4: Confirmation and integration results</p>
                  <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                    <p className="text-sm text-gray-700"><strong>Course:</strong> {selectedCourse?.name || '-'}</p>
                    <p className="text-sm text-gray-700"><strong>Teacher:</strong> {selectedTeacher?.name || selectedTeacher?.email || '-'}</p>
                    <p className="text-sm text-gray-700"><strong>Group name:</strong> {groupName || '-'}</p>
                  </div>
                  <div className="space-y-2">
                    {[
                      { key: 'moodleGroup', label: 'Create group in Moodle' },
                      { key: 'cohorts', label: 'Create associated cohorts' },
                      { key: 'buddyBossSubgroup', label: 'Create subgroup in BuddyBoss' },
                    ].map((item) => {
                      const status = createResult[item.key as keyof CreateGroupResult];
                      const badge = resultLabel(status);
                      return (
                        <div key={item.key} className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2">
                          <span className="text-sm text-gray-700">{item.label}</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.className}`}>{badge.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCreateStep((prev) => (prev > 1 ? ((prev - 1) as CreateStep) : prev))}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={createStep === 1 || creating}
                >
                  Back
                </button>

                {createStep < 4 ? (
                  <button
                    type="button"
                    onClick={() => setCreateStep((prev) => (prev < 4 ? ((prev + 1) as CreateStep) : prev))}
                    className="px-4 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490] disabled:opacity-60"
                    disabled={
                      (createStep === 1 && !selectedCourseId) ||
                      (createStep === 2 && !selectedTeacherId) ||
                      (createStep === 3 && groupName.trim().length === 0)
                    }
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490] disabled:opacity-60"
                    disabled={creating || !canCreate}
                  >
                    {creating ? 'Creating...' : 'Confirm and create'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
