import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/base';
import { useToast } from '../../components/ToastProvider';

type RetailSummary = {
  activeRetailUsers: number;
  membershipsActive: number;
  membershipsExpired: number;
  totalUsers: number;
};

type FilterModel = {
  search: string;
  role: string;
  membership: string;
  status: string;
};

type FlatRow = Record<string, string>;

const RETAIL_WORDPRESS_URL = 'https://www.learnsocialstudies.com/my-account/';
const DEFAULT_SUMMARY: RetailSummary = {
  activeRetailUsers: 0,
  membershipsActive: 0,
  membershipsExpired: 0,
  totalUsers: 0,
};

const initialFilters: FilterModel = {
  search: '',
  role: '',
  membership: '',
  status: '',
};

const normalize = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const flattenObject = (input: unknown, prefix = '', output: FlatRow = {}): FlatRow => {
  if (Array.isArray(input)) {
    output[prefix || 'value'] = input.map((item) => normalize(item)).join(', ');
    return output;
  }

  if (typeof input !== 'object' || input === null) {
    if (prefix) output[prefix] = normalize(input);
    return output;
  }

  const obj = input as Record<string, unknown>;
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      flattenObject(value, nextKey, output);
    } else if (Array.isArray(value)) {
      output[nextKey] = value.map((item) => normalize(item)).join(', ');
    } else {
      output[nextKey] = normalize(value);
    }
  });

  return output;
};

const toUsersArray = (payload: unknown): Record<string, unknown>[] => {
  if (typeof payload !== 'object' || payload === null) return [];
  const response = payload as Record<string, unknown>;
  const users = response.users;
  if (!Array.isArray(users)) return [];
  return users.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
};

const toSummary = (payload: unknown): RetailSummary => {
  if (typeof payload !== 'object' || payload === null) return DEFAULT_SUMMARY;
  const response = payload as Record<string, unknown>;
  const summary = (response.summary ?? {}) as Record<string, unknown>;
  return {
    activeRetailUsers: Number(summary.activeRetailUsers ?? 0),
    membershipsActive: Number(summary.membershipsActive ?? 0),
    membershipsExpired: Number(summary.membershipsExpired ?? 0),
    totalUsers: Number(summary.totalUsers ?? 0),
  };
};

export default function DashboardRetail() {
  const { fetchWithToken } = useApi();
  const { showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RetailSummary>(DEFAULT_SUMMARY);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
  const [requestFilters, setRequestFilters] = useState<FilterModel>(initialFilters);

  const loadRetailData = useCallback(async (filters: FilterModel) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (filters.search) query.set('search', filters.search);
      if (filters.role) query.set('role', filters.role);
      if (filters.membership) query.set('membership', filters.membership);
      if (filters.status) query.set('status', filters.status);

      const endpoint = query.toString()
        ? `/organizations/retail/dashboard?${query.toString()}`
        : '/organizations/retail/dashboard';
      const response = await fetchWithToken<unknown>(endpoint, { method: 'GET' });

      setRawRows(toUsersArray(response));
      setSummary(toSummary(response));
    } catch {
      setError('No se pudo cargar el dashboard retail desde CRM.');
      showError('Error: reintenta mas tarde o contacta soporte.');
      setRawRows([]);
      setSummary(DEFAULT_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [fetchWithToken, showError]);

  useEffect(() => {
    void loadRetailData(requestFilters);
  }, [loadRetailData, requestFilters]);

  const flatRows = useMemo(() => rawRows.map((row) => flattenObject(row)), [rawRows]);

  const tableColumns = useMemo(() => {
    const keys = new Set<string>();
    flatRows.forEach((row) => {
      Object.keys(row).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [flatRows]);

  const filteredRows = useMemo(() => {
    const activeTableFilters = Object.entries(tableFilters).filter(([, value]) => value.trim().length > 0);
    if (activeTableFilters.length === 0) return flatRows;

    return flatRows.filter((row) =>
      activeTableFilters.every(([key, value]) =>
        (row[key] || '').toLowerCase().includes(value.toLowerCase()),
      ));
  }, [flatRows, tableFilters]);

  const handleRequestFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestFilters((prev) => ({ ...prev }));
  };

  const requestFilterField = (field: keyof FilterModel, value: string) => {
    setRequestFilters((prev) => ({ ...prev, [field]: value }));
  };

  const updateTableFilter = (column: string, value: string) => {
    setTableFilters((prev) => ({ ...prev, [column]: value }));
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading retail dashboard...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#052490]">Dashboard Retail</h1>
          <p className="text-sm text-[#031C44]">Estado de usuarios y membresías retail desde CRM.</p>
        </div>
        <a
          href={RETAIL_WORDPRESS_URL}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 rounded-md bg-[#2259F2] text-white font-medium hover:bg-[#052490] transition-colors w-fit"
        >
          Ir a WordPress Retail
        </a>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Usuarios activos retail</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{summary.activeRetailUsers}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Membresías activas</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{summary.membershipsActive}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Membresías vencidas</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{summary.membershipsExpired}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total usuarios CRM</p>
          <p className="text-3xl font-bold text-[#052490] mt-2">{summary.totalUsers}</p>
        </div>
      </div>

      <form onSubmit={handleRequestFilterSubmit} className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <p className="text-sm font-semibold text-[#031C44] mb-3">Filtros CRM (backend)</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={requestFilters.search}
            onChange={(event) => requestFilterField('search', event.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
            placeholder="Buscar email o texto"
          />
          <input
            value={requestFilters.role}
            onChange={(event) => requestFilterField('role', event.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
            placeholder="Rol (ej. subscriber)"
          />
          <input
            value={requestFilters.membership}
            onChange={(event) => requestFilterField('membership', event.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
            placeholder="Membresía (active/expired)"
          />
          <input
            value={requestFilters.status}
            onChange={(event) => requestFilterField('status', event.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
            placeholder="Estado CRM (subscribed)"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-[#2259F2] text-white font-medium hover:bg-[#052490] disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Aplicando...' : 'Aplicar filtros'}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-[#031C44]">Usuarios retail (CRM)</h2>
          <p className="text-xs text-gray-500 mt-1">Todas las columnas detectadas permiten filtro por campo.</p>
        </div>

        {tableColumns.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600">No hay datos de CRM para mostrar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {tableColumns.map((column) => (
                    <th key={column} className="px-3 py-2 text-left text-xs uppercase tracking-wide text-gray-500 align-top">
                      <div>{column}</div>
                      <input
                        value={tableFilters[column] || ''}
                        onChange={(event) => updateTableFilter(column, event.target.value)}
                        className="mt-2 w-full border border-gray-300 rounded px-2 py-1 text-xs normal-case font-normal"
                        placeholder="Filtrar"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={`retail-row-${index}`} className="border-t border-gray-100">
                    {tableColumns.map((column) => (
                      <td key={`${column}-${index}`} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {row[column] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
