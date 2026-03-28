import React, { useState } from 'react';
import { useOrgMembersApi } from '../../api/orgMembers';
import { useCurrentUser } from '../../hooks/useCurrentUser';

const OrgInvitePage: React.FC = () => {
  const { orgId, isOrgAdmin } = useCurrentUser();
  const { inviteMember, loading, error } = useOrgMembersApi();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('subscriber');
  const [success, setSuccess] = useState(false);

  if (!isOrgAdmin) {
    return (
      <div className="p-8 text-center text-red-600 font-semibold">
        Acceso denegado: solo administradores de la organización pueden invitar miembros.
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    const result = await inviteMember(orgId, { email, role });
    if (result && !error) {
      setSuccess(true);
      setEmail('');
      setRole('student');
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-10 bg-white rounded shadow p-8">
      <h2 className="text-2xl font-bold mb-6">Invitar miembro a la organización</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 font-medium">Correo electrónico</label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Rol</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            <option value="student">Estudiante</option>
            <option value="teacher">Profesor</option>
          </select>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 transition"
          disabled={loading}
        >
          {loading ? 'Enviando invitación...' : 'Invitar'}
        </button>
      </form>
      {success && (
        <div className="mt-4 text-green-600 font-medium">Invitación enviada correctamente.</div>
      )}
      {error && (
        <div className="mt-4 text-red-600 font-medium">{error}</div>
      )}
    </div>
  );
};

export default OrgInvitePage;
