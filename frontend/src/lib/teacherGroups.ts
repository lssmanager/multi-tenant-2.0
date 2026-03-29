type UnknownRecord = Record<string, unknown>;

export type TeacherIdentity = {
  id?: string;
  email?: string;
  name?: string;
};

export type TeacherGroup = {
  id: string;
  name: string;
  courseId: string;
  courseName: string;
  teacherId: string;
  teacherEmail: string;
  teacherName: string;
  studentsCount: number;
  moodleCourseUrl: string | null;
  moodleGradesUrl: string | null;
  buddyBossUrl: string | null;
  lastActivity: string | null;
  createdAt: string | null;
  studentIds: string[];
  studentEmails: string[];
};

export const normalizeText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
};

const normalizeLower = (value: unknown): string => normalizeText(value).toLowerCase();

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const extractObjectArray = (payload: unknown): UnknownRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is UnknownRecord => typeof item === 'object' && item !== null);
  }

  if (typeof payload !== 'object' || payload === null) return [];
  const response = payload as UnknownRecord;
  const candidates = [response.items, response.data, response.groups];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is UnknownRecord => typeof item === 'object' && item !== null);
    }
  }

  return [];
};

export const mapTeacherGroup = (row: UnknownRecord, index: number): TeacherGroup => {
  const id = normalizeText(row.id || row.groupId) || `group-${index + 1}`;
  const teacherObject =
    typeof row.teacher === 'object' && row.teacher !== null
      ? (row.teacher as UnknownRecord)
      : null;

  const studentIds = toArray(row.studentIds || row.student_ids || row.memberIds || row.members)
    .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''))
    .filter((value) => value.length > 0);

  const studentEmails = toArray(row.studentEmails || row.student_emails)
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter((value) => value.length > 0);

  return {
    id,
    name: normalizeText(row.name || row.groupName || row.title) || `Group ${index + 1}`,
    courseId: normalizeText(row.courseId || row.moodleCourseId),
    courseName: normalizeText(row.courseName || row.courseTitle || row.course) || 'Course',
    teacherId: normalizeText(row.teacherId || teacherObject?.id),
    teacherEmail: normalizeLower(row.teacherEmail || teacherObject?.email || row.teacher),
    teacherName: normalizeText(row.teacherName || teacherObject?.name || row.teacher) || 'Teacher',
    studentsCount: Number(row.studentsCount ?? row.studentCount ?? row.membersCount ?? studentIds.length) || 0,
    moodleCourseUrl: normalizeText(row.moodleCourseUrl || row.courseUrl) || null,
    moodleGradesUrl: normalizeText(row.moodleGradesUrl || row.gradesUrl) || null,
    buddyBossUrl: normalizeText(row.buddyBossUrl || row.communityUrl || row.groupUrl) || null,
    lastActivity: normalizeText(row.lastActivity || row.last_activity || row.updatedAt) || null,
    createdAt: normalizeText(row.createdAt || row.created_at || row.creationDate) || null,
    studentIds,
    studentEmails,
  };
};

export const extractTeacherIdentity = (userInfo: Record<string, unknown> | null): TeacherIdentity => ({
  id: normalizeLower(userInfo?.sub || userInfo?.id || userInfo?.userId),
  email: normalizeLower(userInfo?.primaryEmail || userInfo?.email || userInfo?.username),
  name: normalizeLower(userInfo?.name || userInfo?.displayName),
});

export const isGroupForTeacher = (group: TeacherGroup, identity: TeacherIdentity): boolean => {
  const teacherId = normalizeLower(group.teacherId);
  const teacherEmail = normalizeLower(group.teacherEmail);
  const teacherName = normalizeLower(group.teacherName);

  if (identity.id && teacherId && identity.id === teacherId) return true;
  if (identity.email && teacherEmail && identity.email === teacherEmail) return true;
  if (identity.name && teacherName && identity.name === teacherName) return true;

  return false;
};

export const formatDate = (value: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-CO');
};
