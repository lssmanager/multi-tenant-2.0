import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../api/base';
import { useToast } from '../../components/ToastProvider';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { setImpersonationContext } from '../../lib/impersonation';
import { getSyncUiBadge } from '../../lib/syncUi';

interface Organization {
  id: string;
  name: string;
  slug?: string;
  subdomain: string;
  institutionalDomain: string;
  adminAssigned: string;
  syncStatus: 'active' | 'pending' | 'error';
  createdAt: string | null;
}

const Organizations = () => {
  const { fetchWithToken } = useApi();
  const { showError, showInfo } = useToast();
  const { isSuperAdmin } = useCurrentUser();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'error'>('all');
  const [impersonatingOrgId, setImpersonatingOrgId] = useState<string | null>(null);

  const navigate = useNavigate();

  const normalize = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const normalizedStatus = (value: unknown): 'active' | 'pending' | 'error' => {
    const status = normalize(value).toLowerCase();
    if (status.includes('error') || status.includes('fail')) return 'error';
    if (status.includes('ready') || status.includes('ok') || status.includes('active')) return 'active';
    return 'pending';
  };

  const mapOrganization = (row: Record<string, unknown>, index: number): Organization => {
    const id = normalize(row.id || row.organizationId) || `org-${index + 1}`;
    const name = normalize(row.name || row.organizationName) || 'Unnamed school';
    const slug = normalize(row.slug || row.subdomainSlug) || undefined;
    const subdomain = normalize(row.subdomain || row.domain) || (slug ? `${slug}.learnsocialstudies.cloud` : '-');
    const institutionalDomain = normalize(row.institutionalDomain || row.domainRestriction || row.allowedDomain) || '-';
    const adminAssigned = normalize(row.primaryAdmin || row.adminName || row.ownerName) || 'Sin asignar';
    const createdAtRaw = normalize(row.createdAt || row.created_at || row.creationDate);
    const syncStatus = normalizedStatus(row.syncStatus || row.status || row.provisioningStatus);

    return {
      id,
      name,
      slug,
      subdomain,
      institutionalDomain,
      adminAssigned,
      syncStatus,
      createdAt: createdAtRaw || null,
    };
  };

  useEffect(() => {
    const fetchOrgs = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchWithToken<unknown>('/organizations', { method: 'GET' });
        const list = Array.isArray(payload)
          ? payload
          : (payload as { organizations?: unknown[]; data?: unknown[] }).organizations ||
            (payload as { organizations?: unknown[]; data?: unknown[] }).data ||
            [];
        const rows = Array.isArray(list)
          ? list.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
          : [];
        setOrganizations(rows.map(mapOrganization));
      } catch {
        setError('Failed to load organizations.');
        showError('Error: reintenta mas tarde o contacta soporte.');
      } finally {
        setLoading(false);
      }
    };
    void fetchOrgs();
  }, [fetchWithToken, showError]);

  const filteredOrganizations = organizations.filter((org) => {
    const statusMatches = statusFilter === 'all' || org.syncStatus === statusFilter;
    const term = search.trim().toLowerCase();
    const textMatches =
      term.length === 0 ||
      org.name.toLowerCase().includes(term) ||
      org.id.toLowerCase().includes(term) ||
      (org.slug || '').toLowerCase().includes(term);
    return statusMatches && textMatches;
  });

  const syncBadge = (status: Organization['syncStatus']) =>
    getSyncUiBadge(status === 'error' ? 'partial-error' : status === 'active' ? 'ok' : 'pending');

  const formatDate = (value: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-CO');
  };

  const handleImpersonate = (org: Organization) => {
    if (!isSuperAdmin) return;
    setImpersonatingOrgId(org.id);
    setImpersonationContext({ orgId: org.id, orgName: org.name });
    showInfo('Impersonacion iniciada', `Ahora operas como admin de ${org.name}.`);
    navigate('/');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 w-full">
      <h1 className="text-2xl font-bold text-[#052490] mb-6">Organizations List</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, slug u organizationId"
            className="border border-gray-300 rounded-md px-3 py-2"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'pending' | 'error')}
            className="border border-gray-300 rounded-md px-3 py-2"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activo</option>
            <option value="pending">Pendiente</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-[#031C44]">Loading organizations...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : filteredOrganizations.length === 0 ? (
        <div className="text-[#031C44]">No organizations found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg shadow-sm">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left">Nombre</th>
                <th className="px-4 py-2 text-left">Subdominio</th>
                <th className="px-4 py-2 text-left">Organization ID</th>
                <th className="px-4 py-2 text-left">Dominio institucional</th>
                <th className="px-4 py-2 text-left">Admin asignado</th>
                <th className="px-4 py-2 text-left">Estado sincronización</th>
                <th className="px-4 py-2 text-left">Fecha creación</th>
                <th className="px-4 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrganizations.map((org) => {
                const badge = syncBadge(org.syncStatus);
                return (
                  <tr key={org.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{org.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{org.subdomain}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 font-mono">{org.id}</td>
                    <td className="px-4 py-2 text-sm">{org.institutionalDomain}</td>
                    <td className="px-4 py-2 text-sm">{org.adminAssigned}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">{formatDate(org.createdAt)}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          className="text-blue-600 hover:underline font-medium text-left"
                          onClick={() => navigate(`/organizations/${org.id}`)}
                        >
                          Ver detalle
                        </button>
                        <button
                          className="text-[#052490] hover:underline font-medium text-left"
                          onClick={() => handleImpersonate(org)}
                          disabled={impersonatingOrgId === org.id}
                        >
                          {impersonatingOrgId === org.id ? 'Impersonificando...' : 'Impersonificar como admin del colegio'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Organizations;
