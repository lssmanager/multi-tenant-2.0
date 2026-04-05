import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../api/base';
import { useToast } from '../../components/ToastProvider';
import { getSyncUiBadge } from '../../lib/syncUi';

type SyncBadge = 'ok' | 'pending' | 'partial-error';
type StepStatus = 'idle' | 'loading' | 'ok' | 'error' | 'retry';
type ProvisionStepKey =
  | 'logto'
  | 'fluentcrm'
  | 'buddyboss'
  | 'moodle'
  | 'subdomain';

interface TenantRow {
  id: string;
  name: string;
  subdomain: string;
  primaryAdmin: string;
  createdAt: string | null;
  syncBadge: SyncBadge;
}

interface Summary {
  retailUsers: number;
  roleCounts: {
    admin: number;
    teacher: number;
    student: number;
  };
}

interface CreateSchoolFormState {
  name: string;
  slug: string;
  institutionalDomain: string;
  adminName: string;
  adminEmail: string;
}

const RETAIL_WORDPRESS_URL = 'https://www.learnsocialstudies.com/my-account/';

const STEP_ORDER: { key: ProvisionStepKey; label: string }[] = [
  { key: 'logto', label: 'Crear organización en Logto' },
  { key: 'fluentcrm', label: 'Crear empresa en FluentCRM' },
  { key: 'buddyboss', label: 'Crear grupo en BuddyBoss' },
  { key: 'moodle', label: 'Crear cohorte/categoría en Moodle' },
  { key: 'subdomain', label: 'Registrar subdominio' },
];

const INITIAL_CREATE_FORM: CreateSchoolFormState = {
  name: '',
  slug: '',
  institutionalDomain: '',
  adminName: '',
  adminEmail: '',
};

const INITIAL_STEP_STATUS: Record<ProvisionStepKey, StepStatus> = {
  logto: 'idle',
  fluentcrm: 'idle',
  buddyboss: 'idle',
  moodle: 'idle',
  subdomain: 'idle',
};

const normalizeText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeStatus = (value: unknown): string => normalizeText(value).toLowerCase();

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const getNestedValue = (obj: Record<string, unknown>, key: string): unknown => {
  const value = obj[key];
  return value === undefined ? null : value;
};

const resolveSyncBadge = (row: Record<string, unknown>): SyncBadge => {
  const directStatus = normalizeStatus(
    row.syncStatus ?? row.status ?? row.provisioningStatus ?? row.sync_state,
  );
  if (directStatus.includes('error') || directStatus.includes('fail')) return 'partial-error';
  if (directStatus.includes('ok') || directStatus.includes('ready') || directStatus.includes('success')) return 'ok';
  if (directStatus.length > 0) return 'pending';

  const syncContainer = getNestedValue(row, 'sync');
  const sync = typeof syncContainer === 'object' && syncContainer !== null
    ? (syncContainer as Record<string, unknown>)
    : {};
  const wp = normalizeStatus(row.wpStatus ?? row.wordpressStatus ?? sync.wp);
  const moodle = normalizeStatus(row.moodleStatus ?? sync.moodle);
  const crm = normalizeStatus(row.crmStatus ?? row.fluentcrmStatus ?? sync.crm);
  const statuses = [wp, moodle, crm].filter((status) => status.length > 0);

  if (statuses.some((status) => status.includes('error') || status.includes('fail'))) return 'partial-error';
  if (statuses.length > 0 && statuses.every((status) => status.includes('ok') || status.includes('ready'))) {
    return 'ok';
  }
  return 'pending';
};

const extractOrganizations = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  }

  if (typeof payload !== 'object' || payload === null) return [];
  const response = payload as Record<string, unknown>;

  const candidates = [response.organizations, response.data, response.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
      );
    }
  }

  return [];
};

const mapTenant = (row: Record<string, unknown>, index: number): TenantRow => {
  const id = normalizeText(row.id ?? row.organizationId ?? row.orgId) || `org-${index + 1}`;
  const name = normalizeText(row.name ?? row.organizationName ?? row.displayName) || 'Sin nombre';

  const adminObject = getNestedValue(row, 'admin');
  const adminNameFromObject = typeof adminObject === 'object' && adminObject !== null
    ? normalizeText((adminObject as Record<string, unknown>).name)
    : '';
  const primaryAdmin = normalizeText(
    row.primaryAdmin ?? row.primaryAdminName ?? row.ownerName ?? row.adminName ?? adminNameFromObject,
  ) || 'Sin asignar';

  const slug = normalizeText(row.slug ?? row.subdomainSlug);
  const subdomain = normalizeText(row.subdomain ?? row.domain) || (slug ? `${slug}.learnsocialstudies.cloud` : '-');

  const createdAtRaw = row.createdAt ?? row.created_at ?? row.creationDate;
  const createdAt = normalizeText(createdAtRaw) || null;

  return {
    id,
    name,
    subdomain,
    primaryAdmin,
    createdAt,
    syncBadge: resolveSyncBadge(row),
  };
};

const computeSummary = (payload: unknown): Summary => {
  const summary: Summary = {
    retailUsers: 0,
    roleCounts: { admin: 0, teacher: 0, student: 0 },
  };

  if (typeof payload !== 'object' || payload === null) return summary;
  const response = payload as Record<string, unknown>;

  const summaryContainer = getNestedValue(response, 'summary');
  const rawSummary = typeof summaryContainer === 'object' && summaryContainer !== null
    ? (summaryContainer as Record<string, unknown>)
    : response;

  summary.retailUsers = toNumber(rawSummary.retailUsersCount ?? rawSummary.retailUsers);
  summary.roleCounts.admin = toNumber(rawSummary.adminUsers ?? rawSummary.adminCount);
  summary.roleCounts.teacher = toNumber(rawSummary.teacherUsers ?? rawSummary.teacherCount);
  summary.roleCounts.student = toNumber(rawSummary.studentUsers ?? rawSummary.studentCount);

  return summary;
};

const getStatusPill = (status: StepStatus): { label: string; className: string } => {
  if (status === 'ok') return { label: 'ok', className: 'bg-green-100 text-green-800' };
  if (status === 'error') return { label: 'error', className: 'bg-red-100 text-red-800' };
  if (status === 'retry') return { label: 'reintentar', className: 'bg-orange-100 text-orange-800' };
  if (status === 'loading') return { label: 'procesando', className: 'bg-blue-100 text-blue-800' };
  return { label: 'pendiente', className: 'bg-gray-100 text-gray-600' };
};

const formatDate = (value: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-CO');
};

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export default function DashboardSuperAdmin() {
  const { fetchWithToken } = useApi();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();

  const [organizations, setOrganizations] = useState<TenantRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    retailUsers: 0,
    roleCounts: { admin: 0, teacher: 0, student: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateSchoolFormState>(INITIAL_CREATE_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [stepStatus, setStepStatus] = useState<Record<ProvisionStepKey, StepStatus>>(INITIAL_STEP_STATUS);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithToken<unknown>('/admin/organizations', { method: 'GET' });
      const parsedOrganizations = extractOrganizations(response).map(mapTenant);
      const parsedSummary = computeSummary(response);

      setOrganizations(parsedOrganizations);
      setSummary(parsedSummary);
    } catch {
      setError('Error: reintenta mas tarde o contacta soporte.');
      showError('Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setLoading(false);
    }
  }, [fetchWithToken, showError]);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  const topTenTenants = useMemo(() => organizations.slice(0, 10), [organizations]);

  const resetModalState = () => {
    setCreateForm(INITIAL_CREATE_FORM);
    setCreateError(null);
    setCreateSuccess(null);
    setStepStatus(INITIAL_STEP_STATUS);
    setCreating(false);
  };

  const openCreateModal = () => {
    resetModalState();
    setIsModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsModalOpen(false);
    resetModalState();
  };

  const handleInputChange = (
    field: keyof CreateSchoolFormState,
    value: string,
  ) => {
    if (field === 'name') {
      const suggestedSlug = toSlug(value);
      setCreateForm((prev) => ({
        ...prev,
        name: value,
        slug: prev.slug ? prev.slug : suggestedSlug,
      }));
      return;
    }

    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };

  const applyStepStatus = (status: StepStatus) => {
    setStepStatus({
      logto: status,
      fluentcrm: status,
      buddyboss: status,
      moodle: status,
      subdomain: status,
    });
  };

  const handleCreateTenant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    setCreating(true);
    applyStepStatus('loading');

    try {
      await fetchWithToken('/admin/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name,
          description: `Slug: ${createForm.slug} | Domain: ${createForm.institutionalDomain} | Admin: ${createForm.adminName} <${createForm.adminEmail}>`,
          slug: createForm.slug,
          institutionalDomain: createForm.institutionalDomain,
          admin: {
            name: createForm.adminName,
            email: createForm.adminEmail,
          },
        }),
      });

      applyStepStatus('ok');
      setCreateSuccess('Colegio creado correctamente. Puedes revisar su detalle en la tabla.');
      showSuccess('Colegio creado', 'Puedes revisar su detalle en la tabla.');
      await fetchDashboardData();
    } catch {
      setStepStatus({
        logto: 'error',
        fluentcrm: 'retry',
        buddyboss: 'retry',
        moodle: 'retry',
        subdomain: 'retry',
      });
      setCreateError('Error: reintenta mas tarde o contacta soporte.');
      showError('No se pudo crear el colegio', 'Error: reintenta mas tarde o contacta soporte.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading dashboard...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#052490]">Dashboard Super Admin</h1>
          <p className="text-sm text-[#031C44]">Visión global de tenants y estado de aprovisionamiento.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={openCreateModal}
            className="px-4 py-2 rounded-md bg-[#2259F2] text-white font-medium hover:bg-[#052490] transition-colors"
          >
            Crear colegio
          </button>
          <a
            href={RETAIL_WORDPRESS_URL}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-md bg-white border border-gray-300 text-[#052490] font-medium hover:bg-gray-50 transition-colors"
          >
            Ver retail en WordPress
          </a>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total colegios</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{organizations.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Usuarios retail</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{summary.retailUsers}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Usuarios admin</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{summary.roleCounts.admin}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Usuarios teacher / student</p>
          <p className="text-xl font-bold text-[#052490] mt-2">
            {summary.roleCounts.teacher} / {summary.roleCounts.student}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-[#031C44]">Colegios (primeras 10 filas)</h2>
        </div>
        {topTenTenants.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600">No hay colegios para mostrar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-gray-500">Nombre del colegio</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-gray-500">Subdominio</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-gray-500">Organization ID</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-gray-500">Admin principal</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-gray-500">Estado sincronización</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-gray-500">Fecha creación</th>
                </tr>
              </thead>
              <tbody>
                {topTenTenants.map((tenant) => {
                  const badge = getSyncUiBadge(tenant.syncBadge);
                  return (
                    <tr
                      key={tenant.id}
                      className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer"
                      onClick={() => navigate(`/organizations/${tenant.id}`)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-[#052490]">{tenant.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{tenant.subdomain}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-mono">{tenant.id}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{tenant.primaryAdmin}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDate(tenant.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#052490]">Crear colegio</h3>
              <button
                onClick={closeCreateModal}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Cerrar modal"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateTenant} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del colegio</label>
                  <input
                    required
                    value={createForm.name}
                    onChange={(event) => handleInputChange('name', event.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                  <input
                    required
                    value={createForm.slug}
                    onChange={(event) => handleInputChange('slug', toSlug(event.target.value))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="colegio-san-jose"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dominio institucional</label>
                  <input
                    required
                    value={createForm.institutionalDomain}
                    onChange={(event) => handleInputChange('institutionalDomain', event.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="@colegiosanjose.edu"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin inicial (nombre)</label>
                  <input
                    required
                    value={createForm.adminName}
                    onChange={(event) => handleInputChange('adminName', event.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin inicial (email)</label>
                <input
                  required
                  type="email"
                  value={createForm.adminEmail}
                  onChange={(event) => handleInputChange('adminEmail', event.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-[#031C44] mb-3">Estado de aprovisionamiento</p>
                <ul className="space-y-2">
                  {STEP_ORDER.map((step) => {
                    const status = stepStatus[step.key];
                    const pill = getStatusPill(status);
                    return (
                      <li key={step.key} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-700">{step.label}</span>
                        <div className="flex items-center gap-2">
                          {status === 'loading' && (
                            <span className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                          )}
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${pill.className}`}>
                            {pill.label}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {createError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </div>
              )}
              {createSuccess && (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  {createSuccess}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-[#2259F2] text-white font-medium hover:bg-[#052490] disabled:opacity-60"
                  disabled={creating}
                >
                  {creating ? 'Creando...' : 'Crear colegio'}
                </button>
                {createError && (
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-md border border-orange-300 text-orange-700 hover:bg-orange-50"
                    disabled={creating}
                  >
                    Reintentar
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
