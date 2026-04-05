// src/pages/OrganizationsList.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../api/base';

interface Organization {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
  createdAt?: string;
}

export default function OrganizationsList() {
  const navigate = useNavigate();
  const { fetchWithToken } = useApi();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchWithToken<Organization[]>('/admin/organizations');
        setOrgs(Array.isArray(data) ? data : []);
      } catch (err) {
        setError('No se pudo cargar la lista de organizaciones.');
        console.error('Failed to load organizations:', err);
      } finally {
        setLoading(false);
      }
    };

    void loadOrganizations();
  }, [fetchWithToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizaciones</h1>
          <p className="text-sm text-gray-500 mt-1">{orgs.length} institución(es) registrada(s)</p>
        </div>
        <button
          onClick={() => navigate('/organizations/new')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Nueva organización
        </button>
      </div>

      {orgs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <p className="text-sm">No hay organizaciones aún. Crea la primera.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => navigate(`/organizations/${org.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:shadow-md hover:border-blue-300 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="bg-blue-50 rounded-lg p-2 group-hover:bg-blue-100 transition-colors">
                  <svg
                    className="w-5 h-5 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
                <svg
                  className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors mt-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1 truncate">{org.name}</h3>
              {org.description && (
                <p className="text-xs text-gray-400 truncate mb-2">{org.description}</p>
              )}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{org.memberCount ?? '—'}</span> miembros
                </span>
                {org.createdAt && (
                  <span className="text-xs text-gray-400">
                    {new Date(org.createdAt).toLocaleDateString('es-CO')}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
