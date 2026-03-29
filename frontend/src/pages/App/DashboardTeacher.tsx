import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/base';
import { OrgMember, useOrgMembersApi } from '../../api/orgMembers';
import { useCurrentUser } from '../../hooks/useCurrentUser';

interface TeacherGroup {
  id: string;
  name: string;
  courseName: string;
  studentsCount: number;
  moodleCourseUrl: string | null;
  moodleGradesUrl: string | null;
  buddyBossUrl: string | null;
}

type JsonObject = Record<string, unknown>;

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
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

const asObjectArray = (payload: unknown): JsonObject[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is JsonObject => typeof item === 'object' && item !== null);
  }

  if (typeof payload !== 'object' || payload === null) return [];
  const response = payload as JsonObject;
  const candidates = [response.items, response.data, response.groups];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is JsonObject => typeof item === 'object' && item !== null);
    }
  }

  return [];
};

const toTeacherGroup = (row: JsonObject, index: number): TeacherGroup => {
  const id = asString(row.id, `group-${index + 1}`);
  const name = asString(row.name, asString(row.groupName, 'Group'));
  const courseName = asString(row.courseName, asString(row.courseTitle, asString(row.course, 'Course')));
  const studentsCount = asNumber(row.studentsCount ?? row.studentCount ?? row.membersCount);

  const moodleCourseUrl =
    asString(row.moodleCourseUrl) ||
    asString(row.courseUrl) ||
    null;

  const moodleGradesUrl =
    asString(row.moodleGradesUrl) ||
    asString(row.gradesUrl) ||
    null;

  const buddyBossUrl =
    asString(row.buddyBossUrl) ||
    asString(row.communityUrl) ||
    asString(row.groupUrl) ||
    null;

  return {
    id,
    name,
    courseName,
    studentsCount,
    moodleCourseUrl,
    moodleGradesUrl,
    buddyBossUrl,
  };
};

export default function DashboardTeacher() {
  const { effectiveOrgId, currentOrganization, impersonatedOrgName } = useCurrentUser();
  const { fetchWithToken } = useApi();
  const { listMembers } = useOrgMembersApi();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);

  const loadTeacherData = useCallback(async () => {
    if (!effectiveOrgId) {
      setError('No active organization found.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [groupsResult, membersResult] = await Promise.allSettled([
        fetchWithToken<unknown>('/org/groups', { method: 'GET' }, effectiveOrgId),
        listMembers(effectiveOrgId),
      ]);

      if (groupsResult.status === 'fulfilled') {
        setGroups(asObjectArray(groupsResult.value).map(toTeacherGroup));
      } else {
        setGroups([]);
      }

      if (membersResult.status === 'fulfilled') {
        setMembers(Array.isArray(membersResult.value) ? membersResult.value : []);
      } else {
        setMembers([]);
      }
    } catch {
      setError('Could not load teacher dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [effectiveOrgId, fetchWithToken, listMembers]);

  useEffect(() => {
    void loadTeacherData();
  }, [loadTeacherData]);

  const assignedStudents = useMemo(() => {
    const fromGroups = groups.reduce((total, group) => total + group.studentsCount, 0);
    if (fromGroups > 0) return fromGroups;
    return members.filter((member) => member.role === 'student').length;
  }, [groups, members]);

  const teacherCoursesCount = useMemo(() => {
    const set = new Set(
      groups
        .map((group) => group.courseName.trim())
        .filter((courseName) => courseName.length > 0),
    );
    return set.size;
  }, [groups]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading dashboard...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#052490]">Teacher Dashboard</h1>
        <p className="text-sm text-[#031C44]">
          {impersonatedOrgName
            ? `Your groups in ${impersonatedOrgName}`
            : currentOrganization?.name
              ? `Your groups in ${currentOrganization.name}`
              : 'Your assigned teaching groups'}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Assigned students</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{assignedStudents}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Courses you teach</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{teacherCoursesCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-[#031C44]">My Groups</h2>
        </div>

        {groups.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600">No groups assigned yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Group</th>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Course</th>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Students</th>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Moodle links</th>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-sm text-[#031C44] font-medium">{group.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{group.courseName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{group.studentsCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex flex-wrap gap-2">
                        {group.moodleCourseUrl ? (
                          <a
                            href={group.moodleCourseUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                          >
                            Course
                          </a>
                        ) : (
                          <span className="text-gray-400">Course n/a</span>
                        )}
                        {group.moodleGradesUrl ? (
                          <a
                            href={group.moodleGradesUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                          >
                            Grades
                          </a>
                        ) : (
                          <span className="text-gray-400">Grades n/a</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <a
                          href="/org/members"
                          className="px-3 py-1.5 rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          Ver alumnos
                        </a>
                        {group.moodleCourseUrl && (
                          <a
                            href={group.moodleCourseUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-md bg-[#2259F2] text-white hover:bg-[#052490]"
                          >
                            Ir al curso en Moodle
                          </a>
                        )}
                        {group.buddyBossUrl && (
                          <a
                            href={group.buddyBossUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-md bg-white border border-[#2259F2] text-[#052490] hover:bg-blue-50"
                          >
                            Ir al grupo en comunidad
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
