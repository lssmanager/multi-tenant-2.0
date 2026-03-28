import { useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useOrgMembersApi } from '../../api/orgMembers';

type OrgRole = 'admin' | 'teacher' | 'student';

const roleOptions: { value: OrgRole; label: string }[] = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'admin', label: 'Admin' },
];

export default function OrgInvite() {
  const { orgId, isOrgAdmin, loading: userLoading } = useCurrentUser();
  const { inviteMember } = useOrgMembersApi();
  const [form, setForm] = useState<{ email: string; role: OrgRole; name: string }>({
    email: '',
    role: 'student',
    name: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (userLoading) return <div className="p-8">Cargando...</div>;
  if (!isOrgAdmin) return <div className="p-8 text-red-600">No tienes permiso para esta acción.</div>;
  if (!orgId) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const field = e.target.name as keyof typeof form;
    const value = field === 'role' ? (e.target.value as OrgRole) : e.target.value;
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await inviteMember(orgId, form);
      setSuccess(`Invitation sent to ${form.email}`);
      setForm({ email: '', role: 'student', name: '' });
    } catch {
      setError('No se pudo enviar la invitación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6">Invitar miembro</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block mb-1 font-medium">Email <span className="text-red-500">*</span></label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
            className="w-full border rounded px-3 py-2"
            placeholder="user@email.com"
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Rol</label>
          <select
            name="role"
            value={form.role}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
          >
            {roleOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1 font-medium">Nombre (opcional)</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            placeholder="Nombre del usuario"
          />
        </div>
        {error && <div className="text-red-600 bg-red-50 px-4 py-2 rounded">{error}</div>}
        {success && <div className="text-green-700 bg-green-50 px-4 py-2 rounded">{success}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Enviando...' : 'Invitar'}
        </button>
      </form>
    </div>
  );
}
