import { useEffect, useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useOrgMembersApi } from '../../api/orgMembers';

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'invited';
}

const roleOptions = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'admin', label: 'Admin' },
];

export default function OrgMembers() {
  const { orgId, isOrgAdmin, loading: userLoading } = useCurrentUser();
  const { listMembers, updateMemberRole, removeMember } = useOrgMembersApi();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !isOrgAdmin) return;
    setLoading(true);
    listMembers(orgId)
      .then((res) => setMembers(res || []))
      .catch(() => setError('No se pudieron cargar los miembros'))
      .finally(() => setLoading(false));
  }, [orgId, isOrgAdmin, listMembers]);

  const handleRoleChange = async (memberId: string, newRole: string) => {
    if (!orgId) return;
    setUpdating(memberId);
    try {
      await updateMemberRole(orgId, memberId, newRole);
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
    } catch {
      setError('No se pudo cambiar el rol');
    } finally {
      setUpdating(null);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!orgId) return;
    setRemoving(memberId);
    try {
      await removeMember(orgId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch {
      setError('No se pudo eliminar el miembro');
    } finally {
      setRemoving(null);
    }
  };

  if (userLoading || loading) return <div className="p-8">Cargando miembros...</div>;
  if (!isOrgAdmin) return <div className="p-8 text-red-600">No tienes permiso para esta acción.</div>;
  if (!orgId) return null;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (members.length === 0) return <div className="p-8">Todavía no hay miembros en tu colegio.</div>;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Miembros del colegio</h2>
      <table className="min-w-full bg-white rounded-lg shadow-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="py-2 px-4 text-left">Nombre</th>
            <th className="py-2 px-4 text-left">Email</th>
            <th className="py-2 px-4 text-left">Rol</th>
            <th className="py-2 px-4 text-left">Estado</th>
            <th className="py-2 px-4 text-left">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b last:border-0">
              <td className="py-2 px-4">{member.name || '-'}</td>
              <td className="py-2 px-4">{member.email}</td>
              <td className="py-2 px-4">
                <select
                  value={member.role}
                  onChange={e => handleRoleChange(member.id, e.target.value)}
                  disabled={updating === member.id}
                  className="border rounded px-2 py-1"
                >
                  {roleOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 px-4 capitalize">{member.status}</td>
              <td className="py-2 px-4">
                <button
                  onClick={() => handleRemove(member.id)}
                  disabled={removing === member.id}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  {removing === member.id ? 'Eliminando...' : 'Eliminar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
