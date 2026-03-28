import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../api/base';

interface Organization {
  id: string;
  name: string;
  description?: string;
  status?: 'provisioning' | 'ready' | 'error';
}

const Organizations = () => {
  const { fetchWithToken } = useApi();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  useEffect(() => {
    const fetchOrgs = async () => {
      setLoading(true);
      setError(null);
      try {
        const orgs = await fetchWithToken('/organizations', { method: 'GET' });
        setOrganizations(orgs);
      } catch {
        setError('Failed to load organizations.');
      } finally {
        setLoading(false);
      }
    };
    void fetchOrgs();
  }, [fetchWithToken]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 w-full">
      <h1 className="text-2xl font-bold text-[#052490] mb-6">School Organizations</h1>
      {loading ? (
        <div className="text-[#031C44]">Loading organizations...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : organizations.length === 0 ? (
        <div className="text-[#031C44]">No organizations found.</div>
      ) : (
        <table className="min-w-full bg-white rounded-lg shadow-sm">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">School Name</th>
              <th className="px-4 py-2 text-left">Organization ID</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr key={org.id} className="border-t">
                <td className="px-4 py-2 font-medium">{org.name}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{org.id}</td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      org.status === 'ready'
                        ? 'bg-green-100 text-green-800'
                        : org.status === 'error'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {org.status ? org.status.charAt(0).toUpperCase() + org.status.slice(1) : 'Provisioning'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button
                    className="text-blue-600 hover:underline font-medium"
                    onClick={() => navigate(`/organizations/${org.id}`)}
                  >
                    View details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Organizations;
