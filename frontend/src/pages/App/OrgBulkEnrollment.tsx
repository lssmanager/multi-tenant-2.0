import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/base';
import { useOrgMembersApi } from '../../api/orgMembers';
import { useToast } from '../../components/ToastProvider';
import { useCurrentUser } from '../../hooks/useCurrentUser';

type UnknownRecord = Record<string, unknown>;
type WizardStep = 1 | 2 | 3 | 4;
type RowAction = 'created' | 'already existed' | 'error' | 'skipped';

type TeacherOption = {
  id: string;
  name: string;
  email: string;
};

type CourseOption = {
  id: string;
  name: string;
};

type ParsedEnrollmentRow = {
  rowNumber: number;
  studentName: string;
  email: string;
  teacherId: string;
  teacherEmail: string;
  courseId: string;
  courseName: string;
  issues: string[];
};

type ProcessResult = {
  rowNumber: number;
  email: string;
  action: RowAction;
  detail: string;
};

const PREVIEW_LIMIT = 12;
const CONCURRENCY = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return fallback;
};

const extractArray = (payload: unknown): UnknownRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is UnknownRecord => typeof item === 'object' && item !== null);
  }
  if (typeof payload !== 'object' || payload === null) return [];
  const response = payload as UnknownRecord;
  const candidates = [response.items, response.data, response.courses];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is UnknownRecord => typeof item === 'object' && item !== null);
    }
  }
  return [];
};

const mapCourse = (row: UnknownRecord, index: number): CourseOption => ({
  id: asString(row.id, `course-${index + 1}`),
  name: asString(row.name || row.title || row.fullname, `Course ${index + 1}`),
});

const splitCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
};

const parseCsvText = (text: string): { headers: string[]; rows: string[][] } => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
  const rows = lines.slice(1).map(splitCsvLine);
  return { headers, rows };
};

const getFieldValue = (row: string[], headers: string[], aliases: string[]): string => {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return row[index]?.trim() || '';
  }
  return '';
};

const toCsv = (rows: string[][]): string =>
  rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export default function OrgBulkEnrollment() {
  const { fetchWithToken } = useApi();
  const { inviteMember, listMembers } = useOrgMembersApi();
  const { showError, showSuccess } = useToast();
  const {
    effectiveOrgId,
    isOrgAdmin,
    isSuperAdmin,
    isImpersonating,
    accessContext,
    currentOrganization,
    impersonatedOrgName,
    loading: userLoading,
  } = useCurrentUser();

  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [rows, setRows] = useState<ParsedEnrollmentRow[]>([]);
  const [results, setResults] = useState<ProcessResult[]>([]);

  const orgName = impersonatedOrgName || currentOrganization?.name || 'School';
  const hasActiveOrgAdminRole = accessContext.organizationRoles.includes('admin');

  const loadReferenceData = useCallback(async () => {
    if (userLoading || !effectiveOrgId || !isOrgAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [membersResult, coursesResult] = await Promise.allSettled([
        listMembers(effectiveOrgId),
        fetchWithToken<unknown>('/org/courses', { method: 'GET' }, effectiveOrgId),
      ]);

      if (membersResult.status === 'fulfilled') {
        const users = Array.isArray(membersResult.value) ? membersResult.value : [];
        setTeachers(
          users
            .filter((member) => (member as { role?: string }).role === 'teacher')
            .map((member) => {
              const m = member as { id: string; name?: string; email: string };
              return {
                id: m.id,
                name: m.name || m.email,
                email: m.email,
              };
            }),
        );
      } else {
        setTeachers([]);
      }

      if (coursesResult.status === 'fulfilled') {
        setCourses(extractArray(coursesResult.value).map(mapCourse));
      } else {
        setCourses([]);
      }
    } catch {
      setError('Could not load teachers/courses reference data.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setLoading(false);
    }
  }, [effectiveOrgId, fetchWithToken, isOrgAdmin, listMembers, showError, userLoading]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  const teacherById = useMemo(() => {
    const map = new Map<string, TeacherOption>();
    teachers.forEach((teacher) => map.set(teacher.id.toLowerCase(), teacher));
    return map;
  }, [teachers]);

  const teacherByEmail = useMemo(() => {
    const map = new Map<string, TeacherOption>();
    teachers.forEach((teacher) => map.set(teacher.email.toLowerCase(), teacher));
    return map;
  }, [teachers]);

  const courseById = useMemo(() => {
    const map = new Map<string, CourseOption>();
    courses.forEach((course) => map.set(course.id.toLowerCase(), course));
    return map;
  }, [courses]);

  const courseByName = useMemo(() => {
    const map = new Map<string, CourseOption>();
    courses.forEach((course) => map.set(course.name.toLowerCase(), course));
    return map;
  }, [courses]);

  const hasBlockingErrors = useMemo(
    () => rows.some((row) => row.issues.length > 0),
    [rows],
  );

  const validRowsCount = useMemo(
    () => rows.filter((row) => row.issues.length === 0).length,
    [rows],
  );

  const previewRows = useMemo(
    () => rows.slice(0, PREVIEW_LIMIT),
    [rows],
  );

  const parseRows = useCallback((headers: string[], csvRows: string[][]): ParsedEnrollmentRow[] => {
    return csvRows.map((rowValues, index) => {
      const row = Array.isArray(rowValues) ? rowValues : [];
      const studentName = getFieldValue(row, headers, ['student_name', 'name', 'student']);
      const email = getFieldValue(row, headers, ['email', 'student_email']).toLowerCase();
      const teacherId = getFieldValue(row, headers, ['teacher_id', 'teacherid']);
      const teacherEmail = getFieldValue(row, headers, ['teacher_email', 'teacheremail']).toLowerCase();
      const courseId = getFieldValue(row, headers, ['course_id', 'courseid']);
      const courseName = getFieldValue(row, headers, ['course_name', 'course', 'course_title', 'coursetitle']);

      const issues: string[] = [];

      if (!studentName) issues.push('student_name is required');
      if (!email) {
        issues.push('email is required');
      } else if (!EMAIL_REGEX.test(email)) {
        issues.push('invalid email format');
      }

      const resolvedTeacherById = teacherId
        ? teacherById.get(teacherId.toLowerCase()) ?? null
        : null;
      const resolvedTeacherByEmail = teacherEmail
        ? teacherByEmail.get(teacherEmail) ?? null
        : null;
      const resolvedTeacher: TeacherOption | null =
        resolvedTeacherById ?? resolvedTeacherByEmail;

      if (!teacherId && !teacherEmail) {
        issues.push('teacher_id or teacher_email is required');
      } else if (!resolvedTeacher) {
        issues.push('teacher not found');
      }

      const resolvedCourseById = courseId
        ? courseById.get(courseId.toLowerCase()) ?? null
        : null;
      const resolvedCourseByName = courseName
        ? courseByName.get(courseName.toLowerCase()) ?? null
        : null;
      const resolvedCourse: CourseOption | null =
        resolvedCourseById ?? resolvedCourseByName;

      if (!courseId && !courseName) {
        issues.push('course_id or course_name is required');
      } else if (!resolvedCourse) {
        issues.push('course not found');
      }

      return {
        rowNumber: index + 2,
        studentName,
        email,
        teacherId: resolvedTeacher?.id || teacherId,
        teacherEmail: resolvedTeacher?.email || teacherEmail,
        courseId: resolvedCourse?.id || courseId,
        courseName: resolvedCourse?.name || courseName,
        issues,
      };
    });
  }, [courseById, courseByName, teacherByEmail, teacherById]);

  const onUploadCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setMessage(null);
    setResults([]);
    setUploadedFileName(file.name);

    try {
      const rawText = await file.text();
      const { headers, rows: csvRows } = parseCsvText(rawText);
      if (headers.length === 0) {
        setError('CSV is empty or unreadable.');
        showError('Error: reintenta mas tarde o contacta soporte.');
        setRows([]);
        return;
      }
      if (csvRows.length === 0) {
        setError('CSV has headers but no data rows.');
        showError('Error: reintenta mas tarde o contacta soporte.');
        setRows([]);
        return;
      }

      const parsed = parseRows(headers, csvRows);
      setRows(parsed);
      setStep(2);
    } catch {
      setError('Could not parse CSV file.');
      showError('Error: reintenta mas tarde o contacta soporte.');
      setRows([]);
    }
  };

  // FE-008: parallel enrollment in chunks of CONCURRENCY using Promise.allSettled
  const processEnrollment = async () => {
    if (!effectiveOrgId) return;
    if (hasBlockingErrors) {
      setError('Fix blocking errors before processing enrollment.');
      showError('Error: reintenta mas tarde o contacta soporte.');
      return;
    }

    const validRows = rows.filter((row) => row.issues.length === 0);
    if (validRows.length === 0) {
      setError('There are no valid rows to process.');
      showError('Error: reintenta mas tarde o contacta soporte.');
      return;
    }

    setProcessing(true);
    setError(null);
    setMessage(null);
    const nextResults: ProcessResult[] = [];

    for (let i = 0; i < validRows.length; i += CONCURRENCY) {
      const chunk = validRows.slice(i, i + CONCURRENCY);
      const chunkOutcomes = await Promise.allSettled(
        chunk.map((row) =>
          inviteMember(effectiveOrgId, {
            name: row.studentName,
            email: row.email,
            role: 'student',
          }).then(() => ({
            row,
            action: 'created' as RowAction,
            detail: 'Invite sent and enrollment row accepted.',
          }))
        )
      );

      for (let j = 0; j < chunkOutcomes.length; j++) {
        const outcome = chunkOutcomes[j];
        const row = chunk[j];
        if (outcome.status === 'fulfilled') {
          nextResults.push({
            rowNumber: row.rowNumber,
            email: row.email,
            action: outcome.value.action,
            detail: outcome.value.detail,
          });
        } else {
          const text = getErrorMessage(outcome.reason);
          const action: RowAction =
            text.toLowerCase().includes('conflict') ||
            text.includes('409') ||
            text.toLowerCase().includes('exist')
              ? 'already existed'
              : 'error';
          nextResults.push({
            rowNumber: row.rowNumber,
            email: row.email,
            action,
            detail:
              action === 'already existed'
                ? 'User already existed in this organization.'
                : text,
          });
        }
      }
    }

    setResults(nextResults);
    setProcessing(false);
    setStep(4);
    const failedRows = nextResults.filter((result) => result.action === 'error').length;
    if (failedRows > 0) {
      setMessage('Sincronizacion incompleta. Revisa el detalle por fila.');
      showError('Sincronizacion incompleta', 'Error: reintenta mas tarde o contacta soporte.');
    } else {
      setMessage('Bulk enrollment finished.');
      showSuccess('Membresia procesada', 'Matricula masiva completada.');
    }
  };

  const downloadReport = () => {
    const csv = toCsv([
      ['Row', 'Email', 'Action', 'Detail'],
      ...results.map((result) => [
        String(result.rowNumber),
        result.email,
        result.action,
        result.detail,
      ]),
    ]);
    downloadCsvFile(`bulk-enrollment-report-${effectiveOrgId || 'org'}.csv`, csv);
    showSuccess('Reporte descargado');
  };

  const resetWizard = () => {
    setStep(1);
    setRows([]);
    setResults([]);
    setUploadedFileName(null);
    setMessage(null);
    setError(null);
  };

  if (userLoading || loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading...</div>;
  }

  if (!isOrgAdmin || !effectiveOrgId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600 font-medium">Access denied. Only organization admins can process bulk enrollment.</p>
      </div>
    );
  }

  if (isSuperAdmin && !isImpersonating && !hasActiveOrgAdminRole) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-[#031C44]">Super-admin must impersonate an organization admin to use bulk enrollment.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 w-full">
      <h1 className="text-2xl font-bold text-[#052490] mb-2">Bulk Enrollment</h1>
      <p className="text-sm text-[#031C44] mb-6">CSV enrollment wizard for {orgName}.</p>

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

      <div className="grid grid-cols-4 gap-2 mb-6 text-xs">
        {[1, 2, 3, 4].map((value) => (
          <div
            key={value}
            className={`rounded-md px-2 py-1 text-center ${
              step >= value ? 'bg-[#052490] text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Step {value}
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[#031C44]">Upload CSV</h2>
            <p className="text-sm text-gray-700">
              Expected columns: <code>student_name</code>, <code>email</code>, <code>teacher_id</code> or <code>teacher_email</code>, and <code>course_id</code> or <code>course_name</code>.
            </p>
            <input type="file" accept=".csv,text/csv" onChange={onUploadCsv} className="block w-full text-sm" />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[#031C44]">Preview</h2>
            <p className="text-sm text-gray-700">
              File: <strong>{uploadedFileName || '-'}</strong>. Showing first {Math.min(PREVIEW_LIMIT, rows.length)} rows.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Row</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Student</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Email</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Teacher</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Course</th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowNumber} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-sm text-gray-700">{row.rowNumber}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{row.studentName || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{row.email || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{row.teacherId || row.teacherEmail || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{row.courseId || row.courseName || '-'}</td>
                      <td className="px-3 py-2 text-sm">
                        {row.issues.length === 0 ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">ok</span>
                        ) : (
                          <span className="text-red-600">{row.issues.join('; ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={resetWizard}
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Upload another CSV
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490]"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[#031C44]">Confirmation</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Valid rows</p>
                <p className="text-3xl font-bold text-[#052490]">{validRowsCount}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Rows with errors</p>
                <p className="text-3xl font-bold text-red-600">{rows.length - validRowsCount}</p>
              </div>
            </div>
            {hasBlockingErrors && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Processing is blocked: fix invalid rows (email/teacher/course) and upload corrected CSV.
              </div>
            )}
            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Back to preview
              </button>
              <button
                type="button"
                onClick={processEnrollment}
                disabled={processing || hasBlockingErrors || validRowsCount === 0}
                className="px-4 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490] disabled:opacity-60"
              >
                {processing ? 'Processing...' : 'Process enrollment'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[#031C44]">Result</h2>
            {results.length === 0 ? (
              <p className="text-sm text-gray-700">No processed rows yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Row</th>
                      <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Email</th>
                      <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Action</th>
                      <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <tr key={`${result.rowNumber}-${result.email}`} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-sm text-gray-700">{result.rowNumber}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{result.email}</td>
                        <td className="px-3 py-2 text-sm capitalize">{result.action}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{result.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={resetWizard}
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Upload corrected CSV
              </button>
              <button
                type="button"
                onClick={downloadReport}
                disabled={results.length === 0}
                className="px-4 py-2 rounded-md bg-[#2259F2] text-white hover:bg-[#052490] disabled:opacity-60"
              >
                Download report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
