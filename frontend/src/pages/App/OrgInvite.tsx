import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useOrgMembersApi } from '../../api/orgMembers';
import { useToast } from '../../components/ToastProvider';

type Role = 'admin' | 'teacher' | 'student';

const roleOptions: { value: Role; label: string }[] = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'admin', label: 'Admin' },
];

const parseInstitutionalDomain = (value: string | undefined | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-') return null;

  const explicitDomainMatch = trimmed.match(/domain\s*:\s*([^|]+)/i);
  if (explicitDomainMatch && explicitDomainMatch[1]) {
    const explicitDomain = explicitDomainMatch[1].trim().replace(/^@/, '').toLowerCase();
    if (explicitDomain) return explicitDomain;
  }

  if (trimmed.includes('@')) {
    const atIndex = trimmed.indexOf('@');
    const domain = trimmed.slice(atIndex + 1).toLowerCase();
    const clean = domain.split(/\s|\|/)[0];
    return clean || null;
  }

  return trimmed.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase() || null;
};

export default function OrgInvite() {
  const { effectiveOrgId, isOrgAdmin, currentOrganization, loading: userLoading } = useCurrentUser();
  const { inviteMember } = useOrgMembersApi();
  const { showError, showSuccess } = useToast();

  const [form, setForm] = useState<{ email: string; role: Role; name: string }>({
    email: '',
    role: 'student',
    name: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const institutionalDomain = parseInstitutionalDomain(currentOrganization?.description);

  if (userLoading) return <div className="p-8">Loading...</div>;
  if (!isOrgAdmin) return <div className="p-8 text-red-600">No tienes permiso para esta accion.</div>;
  if (!effectiveOrgId) return null;

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const field = e.target.name as keyof typeof form;
    if (field === 'role') {
      setForm((prev) => ({ ...prev, role: e.target.value as Role }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (institutionalDomain) {
      const email = form.email.trim().toLowerCase();
      if (!email.endsWith(`@${institutionalDomain}`)) {
        const message = 'SOLO MIEMBROS DE TU ORGANIZATION, CONTACTA SOPORTE PARA EMAIL NO INSTITUCIONALES.';
        setError(message);
        showError(message);
        setLoading(false);
        return;
      }
    }

    try {
      await inviteMember(effectiveOrgId, {
        email: form.email.trim().toLowerCase(),
        role: form.role,
        name: form.name.trim() || undefined,
      });
      setSuccess(`Invitation sent to ${form.email.trim().toLowerCase()}`);
      showSuccess('Invitacion enviada', `Se envio invitacion a ${form.email.trim().toLowerCase()}.`);
      setForm({ email: '', role: 'student', name: '' });
    } catch {
      setError('No se pudo enviar la invitacion.');
      showError('No se pudo enviar la invitacion', 'Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6">Invitar miembro</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block mb-1 font-medium">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
            className="w-full border rounded px-3 py-2"
            placeholder="user@email.com"
          />
          {institutionalDomain && (
            <p className="text-xs text-gray-500 mt-1">Dominio permitido: @{institutionalDomain}</p>
          )}
        </div>
        <div>
          <label className="block mb-1 font-medium">Rol</label>
          <select
            name="role"
            value={form.role}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
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
