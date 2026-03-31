// Servicio de miembros organizacionales
// organizationId siempre debe venir del backend autenticado
const axios = require('axios');
const { getManagementToken } = require('./logtoManagement');

async function listOrgMembers(organizationId) {
  const organizationId = req.user?.accessContext?.effectiveOrganizationId || req.user?.organizationId;
  if (!organizationId) throw new Error('organizationId required from authenticated context');
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
async function listOrgMembers(req) {
  try {
    const organizationId = req.user?.accessContext?.effectiveOrganizationId || req.user?.organizationId;
    if (!organizationId) throw new Error('organizationId required from authenticated context');
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
  } catch (err) {
    // Log error for observability, but do not crash
    console.log(JSON.stringify({ action: 'listOrgMembers', status: 'error', message: err.message }));
    return [];
  }
}

module.exports = { listOrgMembers };