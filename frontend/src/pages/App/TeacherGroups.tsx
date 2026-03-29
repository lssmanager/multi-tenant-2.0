import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../api/base';
import { useToast } from '../../components/ToastProvider';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import {
  extractObjectArray,
  extractTeacherIdentity,
  formatDate,
  isGroupForTeacher,
  mapTeacherGroup,
  type TeacherGroup,
} from '../../lib/teacherGroups';

const TeacherGroups = () => {
  const { fetchWithToken } = useApi();
  const { showError } = useToast();
  const {
    effectiveOrgId,
    isTeacher,
    isSuperAdmin,
    isImpersonating,
    impersonatedRole,
    userInfo,
    currentOrganization,
    impersonatedOrgName,
  } = useCurrentUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [courseFilter, setCourseFilter] = useState('all');

  const canAccessTeacherViews =
    isTeacher && (!isSuperAdmin || (isImpersonating && impersonatedRole === 'teacher'));

  const loadGroups = useCallback(async () => {
    if (!effectiveOrgId || !canAccessTeacherViews) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchWithToken<unknown>('/org/groups', { method: 'GET' }, effectiveOrgId);
      const parsedGroups = extractObjectArray(payload).map(mapTeacherGroup);
      setGroups(parsedGroups);
    } catch {
      setError('Could not load teacher groups.');
      showError('Error: reintenta mas tarde o contacta soporte.');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [canAccessTeacherViews, effectiveOrgId, fetchWithToken, showError]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const teacherIdentity = useMemo(() => extractTeacherIdentity(userInfo), [userInfo]);
  const canFilterByIdentity = Boolean(teacherIdentity.id || teacherIdentity.email || teacherIdentity.name);
  const isImpersonatingTeacherWithoutIdentity =
    isSuperAdmin && isImpersonating && impersonatedRole === 'teacher' && !canFilterByIdentity;

  const teacherGroups = useMemo(() => {
    if (isImpersonatingTeacherWithoutIdentity) return groups;
    return groups.filter((group) => isGroupForTeacher(group, teacherIdentity));
  }, [groups, isImpersonatingTeacherWithoutIdentity, teacherIdentity]);

  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    teacherGroups.forEach((group) => {
      const key = group.courseId || group.courseName;
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, group.courseName || key);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [teacherGroups]);

  const filteredGroups = useMemo(() => {
    if (courseFilter === 'all') return teacherGroups;
    return teacherGroups.filter((group) => (group.courseId || group.courseName) === courseFilter);
  }, [courseFilter, teacherGroups]);

  const schoolName = impersonatedOrgName || currentOrganization?.name || 'School';

  if (!canAccessTeacherViews) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600 font-medium">Only teachers can view this section.</p>
      </div>
    );
  }

  if (!effectiveOrgId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600 font-medium">No active organization found.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading groups...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 w-full">
      <h1 className="text-2xl font-bold text-[#052490] mb-2">My Groups</h1>
      <p className="text-sm text-[#031C44] mb-6">
        Groups where you are the assigned teacher in {schoolName}.
      </p>

      {isImpersonatingTeacherWithoutIdentity && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Teacher impersonation is active without specific teacher identity; displaying all groups in this organization.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Filter by course</label>
        <select
          value={courseFilter}
          onChange={(event) => setCourseFilter(event.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[220px]"
        >
          <option value="all">All courses</option>
          {courseOptions.map((course) => (
            <option key={course.value} value={course.value}>
              {course.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        {filteredGroups.length === 0 ? (
          <div className="py-8 text-[#031C44]">No groups available for this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Group</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Course</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Students</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Moodle links</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">BuddyBoss</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Last activity</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group) => (
                  <tr key={group.id} className="border-b border-gray-100">
                    <td className="px-3 py-3 text-sm font-medium text-[#031C44]">{group.name}</td>
                    <td className="px-3 py-3 text-sm text-gray-700">{group.courseName || '-'}</td>
                    <td className="px-3 py-3 text-sm text-gray-700">{group.studentsCount}</td>
                    <td className="px-3 py-3 text-sm text-gray-700">
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
                    <td className="px-3 py-3 text-sm text-gray-700">
                      {group.buddyBossUrl ? (
                        <a
                          href={group.buddyBossUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                        >
                          Subgroup
                        </a>
                      ) : (
                        <span className="text-gray-400">n/a</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">
                      {formatDate(group.lastActivity || group.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <Link
                        to={`/teacher/groups/${encodeURIComponent(group.id)}/students`}
                        className="px-3 py-1.5 rounded-md bg-[#2259F2] text-white hover:bg-[#052490]"
                      >
                        View students
                      </Link>
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
};

export default TeacherGroups;
