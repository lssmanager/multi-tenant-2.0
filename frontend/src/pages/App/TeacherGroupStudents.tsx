import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../../api/base';
import { useOrgMembersApi, type OrgMember } from '../../api/orgMembers';
import { useToast } from '../../components/ToastProvider';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import {
  extractObjectArray,
  extractTeacherIdentity,
  isGroupForTeacher,
  mapTeacherGroup,
  normalizeText,
  type TeacherGroup,
} from '../../lib/teacherGroups';

type StudentRow = {
  id: string;
  name: string;
  email: string;
  enrollmentStatus: 'active' | 'pending' | 'suspended';
  buddyBossProfileUrl: string | null;
};

const asEnrollmentStatus = (value: unknown): StudentRow['enrollmentStatus'] => {
  const status = normalizeText(value).toLowerCase();
  if (status === 'active' || status === 'enrolled') return 'active';
  if (status === 'suspended' || status === 'inactive') return 'suspended';
  return 'pending';
};

const mapStudentRow = (row: Record<string, unknown>, index: number): StudentRow => ({
  id: normalizeText(row.id || row.userId || row.studentId) || `student-${index + 1}`,
  name: normalizeText(row.name || row.fullName || row.studentName) || '-',
  email: normalizeText(row.email || row.primaryEmail || row.studentEmail),
  enrollmentStatus: asEnrollmentStatus(row.enrollmentStatus || row.status),
  buddyBossProfileUrl: normalizeText(row.buddyBossProfileUrl || row.profileUrl || row.communityProfileUrl) || null,
});

const statusBadgeClass = (status: StudentRow['enrollmentStatus']) => {
  if (status === 'active') return 'bg-green-100 text-green-800';
  if (status === 'suspended') return 'bg-red-100 text-red-800';
  return 'bg-yellow-100 text-yellow-800';
};

const TeacherGroupStudents = () => {
  const { groupId } = useParams();
  const { fetchWithToken } = useApi();
  const { listMembers } = useOrgMembersApi();
  const { showError } = useToast();
  const {
    effectiveOrgId,
    isTeacher,
    isSuperAdmin,
    isImpersonating,
    impersonatedRole,
    userInfo,
  } = useCurrentUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [group, setGroup] = useState<TeacherGroup | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);

  const canAccessTeacherViews =
    isTeacher && (!isSuperAdmin || (isImpersonating && impersonatedRole === 'teacher'));

  const loadData = useCallback(async () => {
    if (!canAccessTeacherViews || !effectiveOrgId || !groupId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const groupsPayload = await fetchWithToken<unknown>('/org/groups', { method: 'GET' }, effectiveOrgId);
      const groups = extractObjectArray(groupsPayload).map(mapTeacherGroup);
      const targetGroup = groups.find((item) => item.id === groupId);

      if (!targetGroup) {
        setError('Group not found.');
        setGroup(null);
        setStudents([]);
        setLoading(false);
        return;
      }

      const teacherIdentity = extractTeacherIdentity(userInfo);
      const isImpersonatingTeacherWithoutIdentity =
        isSuperAdmin && isImpersonating && impersonatedRole === 'teacher' &&
        !(teacherIdentity.id || teacherIdentity.email || teacherIdentity.name);

      if (!isImpersonatingTeacherWithoutIdentity && !isGroupForTeacher(targetGroup, teacherIdentity)) {
        setError('You cannot view students from groups assigned to other teachers.');
        setGroup(null);
        setStudents([]);
        setLoading(false);
        return;
      }

      setGroup(targetGroup);

      try {
        const studentsPayload = await fetchWithToken<unknown>(
          `/org/groups/${encodeURIComponent(groupId)}/students`,
          { method: 'GET' },
          effectiveOrgId,
        );
        const parsedStudents = extractObjectArray(studentsPayload).map(mapStudentRow);
        setStudents(parsedStudents);
        setLoading(false);
        return;
      } catch {
        // fallback below
      }

      const members = await listMembers(effectiveOrgId);
      const memberRows = Array.isArray(members) ? members : [];
      const studentMembers = memberRows.filter((member) => member.role === 'student');

      if (targetGroup.studentIds.length > 0 || targetGroup.studentEmails.length > 0) {
        const filtered = studentMembers.filter((member: OrgMember) => {
          const byId = targetGroup.studentIds.includes(member.id);
          const byEmail = targetGroup.studentEmails.includes(member.email.toLowerCase());
          return byId || byEmail;
        });

        setStudents(
          filtered.map((member, index) => ({
            id: member.id || `student-${index + 1}`,
            name: member.name || '-',
            email: member.email,
            enrollmentStatus: member.status === 'active' ? 'active' : member.status === 'deactivated' ? 'suspended' : 'pending',
            buddyBossProfileUrl: null,
          })),
        );
      } else {
        setStudents([]);
        setWarning(
          'Student endpoint for this group is not available, and group payload does not include student list identifiers.',
        );
      }
    } catch {
      setError('Could not load group students.');
      showError('Error: reintenta mas tarde o contacta soporte.');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [
    canAccessTeacherViews,
    effectiveOrgId,
    fetchWithToken,
    groupId,
    impersonatedRole,
    isImpersonating,
    isSuperAdmin,
    listMembers,
    showError,
    userInfo,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const moodleCourseLink = useMemo(() => group?.moodleCourseUrl || null, [group?.moodleCourseUrl]);
  const buddyBossLink = useMemo(() => group?.buddyBossUrl || null, [group?.buddyBossUrl]);

  if (!canAccessTeacherViews) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600 font-medium">Only teachers can view this section.</p>
      </div>
    );
  }

  if (!effectiveOrgId || !groupId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600 font-medium">Missing organization or group context.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading group students...</div>;
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600 font-medium">{error}</p>
        <Link to="/teacher/groups" className="text-[#2259F2] hover:underline mt-3 inline-block">
          Back to my groups
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-[#052490]">Group Students</h1>
        <Link
          to="/teacher/groups"
          className="px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          Back to my groups
        </Link>
      </div>

      <p className="text-sm text-[#031C44] mb-4">
        Group: <strong>{group?.name || '-'}</strong> | Course: <strong>{group?.courseName || '-'}</strong>
      </p>

      {warning && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warning}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-5">
        {moodleCourseLink ? (
          <a
            href={moodleCourseLink}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490]"
          >
            Go to Moodle course
          </a>
        ) : (
          <span className="px-4 py-2 rounded-md border border-gray-200 text-gray-400">Moodle link n/a</span>
        )}

        {buddyBossLink ? (
          <a
            href={buddyBossLink}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-md border border-[#2259F2] text-[#052490] hover:bg-blue-50"
          >
            Go to community group
          </a>
        ) : (
          <span className="px-4 py-2 rounded-md border border-gray-200 text-gray-400">Community link n/a</span>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        {students.length === 0 ? (
          <div className="py-8 text-[#031C44]">No students available for this group.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Student</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Email</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Enrollment status</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">BuddyBoss profile</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-b border-gray-100">
                    <td className="px-3 py-3 text-sm text-[#031C44]">{student.name}</td>
                    <td className="px-3 py-3 text-sm text-gray-700">{student.email}</td>
                    <td className="px-3 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(student.enrollmentStatus)}`}>
                        {student.enrollmentStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">
                      {student.buddyBossProfileUrl ? (
                        <a
                          href={student.buddyBossProfileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#2259F2] hover:underline"
                        >
                          Open profile
                        </a>
                      ) : (
                        <span className="text-gray-400">n/a</span>
                      )}
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

export default TeacherGroupStudents;
