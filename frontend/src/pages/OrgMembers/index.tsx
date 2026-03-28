import { useEffect, useState } from 'react';
import Topbar from '../../components/Topbar';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useOrgMembersApi, OrgMember } from '../../api/orgMembers';

const OrgMembersPage = () => {
  const { orgId, currentOrg, isOrgAdmin, loading: userLoading } = useCurrentUser();
  const { listMembers, updateMemberRole, removeMember } = useOrgMembersApi();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading || !orgId || !isOrgAdmin) return;

    const loadMembers = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listMembers(orgId);
        setMembers(data);
      } catch (e) {
        setError('No se pudieron cargar los miembros de tu colegio.');
      } finally {
        setLoading(false);
      }
    };

    loadMembers();
  }, [userLoading, orgId, isOrgAdmin, listMembers]);

  if (userLoading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Cargando...</div>;
  }

  if (!isOrgAdmin || !orgId) {
    return (
      <div className="min-h-screen flex flex-col">
        <Topbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p className="text-red-600 font-medium">
            No tienes permiso para ver esta sección. Solo los administradores del colegio pueden gestionar miembros.
          </p>
        </div>
      </div>
    );
  }

  const handleRoleChange = async (memberId: string, role: OrgMember['role']) => {
    if (!orgId) return;
    setUpdatingId(memberId);
    try {
      await updateMemberRole(orgId, memberId, role);
      setMembers(prev =>
        prev.map(m => (m.id === memberId ? { ...m, role } : m))
      );
    } catch {
      // opcional: mostrar toast / mensaje
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!orgId || !window.confirm('¿Seguro que quieres remover este miembro del colegio?')) return;
    setUpdatingId(memberId);
    try {
      await removeMember(orgId, memberId);
      setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch {
      // opcional: mostrar toast
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />
      <div className="max-w-5xl mx-auto px-4 py-8 w-full">
        <h1 className="text-2xl font-bold text-[#052490] mb-2">
          Members — {currentOrg?.name || 'Your School'}
        </h1>
        <p className="text-sm text-[#031C44] mb-6">
          Invita profesores y estudiantes, asigna roles y revoca acceso cuando alguien deja la institución.
        </p>

        {loading ? (
          <div className="text-[#031C44]">Cargando miembros...</div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : members.length === 0 ? (
          <div className="text-[#031C44] bg-white border border-gray-200 rounded-lg p-6">
            Todavía no hay miembros en tu colegio. Comienza invitando a tus profesores y estudiantes desde la sección
            de invitaciones.
          </div>
        ) : (
          <table className="min-w-full bg-white rounded-lg shadow-sm">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left">Nombre</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Rol</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <tr key={member.id} className="border-t">
                  <td className="px-4 py-2">{member.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{member.email}</td>
                  <td className="px-4 py-2">
                    <select
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                      value={member.role}
                      disabled={updatingId === member.id}
                      onChange={e =>
                        handleRoleChange(member.id, e.target.value as OrgMember['role'])
                      }
                    >
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        member.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {member.status === 'active' ? 'Active' : 'Invited'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      className="text-red-600 hover:underline text-sm"
                      disabled={updatingId === member.id}
                      onClick={() => handleRemove(member.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default OrgMembersPage;
