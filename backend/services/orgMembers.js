// Servicio de miembros organizacionales
// organizationId siempre debe venir del backend autenticado
const axios = require('axios');
const { getManagementToken } = require('./logtoManagement');

async function listOrgMembers(organizationId) {
  if (!organizationId) throw new Error('organizationId required');
  const token = await getManagementToken();
  const response = await axios.get(
    `https://auth.learnsocialstudies.com/api/organizations/${organizationId}/users`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  // Normalizar contrato para frontend: status, id, email, name, roles, etc.
  return (response.data || []).map(user => ({
    id: user.id,
    email: user.primaryEmail,
    name: user.name || user.primaryEmail,
    roles: user.organizationRoles || [],
    status: user.status || 'active',
  }));
}

module.exports = { listOrgMembers };