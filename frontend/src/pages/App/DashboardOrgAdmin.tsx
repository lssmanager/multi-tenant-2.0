import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/base';
import { OrgMember, useOrgMembersApi } from '../../api/orgMembers';
import { useToast } from '../../components/ToastProvider';
import { useCurrentUser } from '../../hooks/useCurrentUser';

interface OrgGroup {
  id: string;
  name: string;
  createdAt?: string;
  active?: boolean;
  status?: string;
}

interface OrgCourse {
  id: string;
  title?: string;
  name?: string;
}

type UnknownRecord = Record<string, unknown>;

const parseArray = <T,>(value: unknown, mapper: (input: UnknownRecord, index: number) => T): T[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is UnknownRecord => typeof item === 'object' && item !== null)
    .map(mapper);
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

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
};

const mapGroup = (row: UnknownRecord, index: number): OrgGroup => ({
  id: asString(row.id, `group-${index + 1}`),
  name: asString(row.name, asString(row.title, 'Grupo sin nombre')),
  createdAt: asString(row.createdAt, asString(row.created_at)),
  active: typeof row.active === 'boolean' ? row.active : undefined,
  status: asString(row.status),
});

const mapCourse = (row: UnknownRecord, index: number): OrgCourse => ({
  id: asString(row.id, `course-${index + 1}`),
  title: asString(row.title),
  name: asString(row.name),
});

const byCreatedDateDesc = (a: { createdAt?: string }, b: { createdAt?: string }) => {
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return bTime - aTime;
};

export default function DashboardOrgAdmin() {
  const { effectiveOrgId, currentOrganization, impersonatedOrgName } = useCurrentUser();
  const { listMembers } = useOrgMembersApi();
  const { fetchWithToken } = useApi();
  const { showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [courses, setCourses] = useState<OrgCourse[]>([]);

  const fetchOrgAdminData = useCallback(async () => {
    if (!effectiveOrgId) {
      setLoading(false);
      setError('No se encontro organizacion activa.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const membersResult = await listMembers(effectiveOrgId);
      setMembers(Array.isArray(membersResult) ? membersResult : []);

      const [groupsResult, coursesResult] = await Promise.allSettled([
        fetchWithToken<unknown>('/org/groups', { method: 'GET' }, effectiveOrgId),
        fetchWithToken<unknown>('/org/courses', { method: 'GET' }, effectiveOrgId),
      ]);

      if (groupsResult.status === 'fulfilled') {
        setGroups(parseArray(extractPayloadArray(groupsResult.value), mapGroup));
      } else {
        setGroups([]);
      }

      if (coursesResult.status === 'fulfilled') {
        setCourses(parseArray(extractPayloadArray(coursesResult.value), mapCourse));
      } else {
        setCourses([]);
      }
    } catch {
      setError('No se pudo cargar el dashboard del colegio.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setLoading(false);
    }
  }, [effectiveOrgId, fetchWithToken, listMembers, showError]);

  useEffect(() => {
    void fetchOrgAdminData();
  }, [fetchOrgAdminData]);

  const teacherCount = useMemo(
    () => members.filter((member) => member.role === 'teacher').length,
    [members],
  );
  const studentCount = useMemo(
    () => members.filter((member) => member.role === 'student').length,
    [members],
  );
  const activeGroupsCount = useMemo(
    () =>
      groups.filter((group) => {
        if (typeof group.active === 'boolean') return group.active;
        const status = group.status?.toLowerCase() ?? '';
        return status ? status === 'active' || status === 'ok' || status === 'ready' : true;
      }).length,
    [groups],
  );
  const coursesCount = courses.length;

  const latestMembers = useMemo(() => members.slice(0, 5), [members]);
  const latestGroups = useMemo(() => [...groups].sort(byCreatedDateDesc).slice(0, 5), [groups]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading dashboard...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#052490]">Dashboard del Colegio</h1>
        <p className="text-sm text-[#031C44]">
          {impersonatedOrgName
            ? `Resumen de ${impersonatedOrgName}`
            : currentOrganization?.name
              ? `Resumen de ${currentOrganization.name}`
              : 'Resumen administrativo del colegio'}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Profesores</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{teacherCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Alumnos</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{studentCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Grupos activos</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{activeGroupsCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Cursos asociados</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{coursesCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <a
          href="/org/invite"
          className="px-4 py-2 rounded-md bg-[#2259F2] text-white font-medium hover:bg-[#052490] transition-colors"
        >
          Invitar miembros
        </a>
        <a
          href="/org/groups"
          className="px-4 py-2 rounded-md bg-white border border-gray-300 text-[#052490] font-medium hover:bg-gray-50 transition-colors"
        >
          Crear grupo de profesor
        </a>
        <a
          href="/org/enroll"
          className="px-4 py-2 rounded-md bg-white border border-gray-300 text-[#052490] font-medium hover:bg-gray-50 transition-colors"
        >
          Matricula masiva (CSV)
        </a>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-[#031C44]">Ultimos miembros agregados</h2>
          </div>
          {latestMembers.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-600">Aun no hay miembros para mostrar.</div>
          ) : (
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Nombre</th>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Email</th>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Rol</th>
                </tr>
              </thead>
              <tbody>
                {latestMembers.map((member) => (
                  <tr key={member.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-sm text-[#031C44]">{member.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{member.email}</td>
                    <td className="px-4 py-3 text-sm capitalize">{member.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-[#031C44]">Ultimos grupos creados</h2>
          </div>
          {latestGroups.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-600">Aun no hay grupos para mostrar.</div>
          ) : (
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Grupo</th>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Estado</th>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Creacion</th>
                </tr>
              </thead>
              <tbody>
                {latestGroups.map((group) => (
                  <tr key={group.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-sm text-[#031C44]">{group.name}</td>
                    <td className="px-4 py-3 text-sm capitalize">{group.status || (group.active ? 'active' : 'pending')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {group.createdAt ? new Date(group.createdAt).toLocaleDateString('es-CO') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
