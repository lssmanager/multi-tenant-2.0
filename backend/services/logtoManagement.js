
let orgRolesCache = null;
let orgRolesCacheExpiresAt = 0;

async function getOrgRoleIdByName(roleName) {
  const normalizedRoleName = normalizeRoleName(roleName);
  const now = Date.now();
  if (!orgRolesCache || orgRolesCacheExpiresAt < now) {
    const headers = await authHeaders();
    const response = await axios.get(
      `${process.env.LOGTO_ENDPOINT}/api/organization-roles`,
      { headers, timeout: 5000 }
    );
    orgRolesCache = response.data;
    orgRolesCacheExpiresAt = now + 60 * 60 * 1000;
  }
  const found = orgRolesCache.find((r) => normalizeRoleName(r.name) === normalizedRoleName);
  if (!found) throw new Error(`Org role not found: ${roleName}`);
  return found.id;
}

// ...existing code...

const axios = require('axios');
const { fetchLogtoManagementApiAccessToken } = require('../lib/utils');

const client = axios.create({ timeout: 5000 });

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeRoleName(roleName) {
  return String(roleName || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

async function authHeaders() {
  const token = await fetchLogtoManagementApiAccessToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function getManagementToken() {
  return fetchLogtoManagementApiAccessToken();
}

/**
 * Assign a user to the global Retail organization in Logto.
 */
async function assignToRetailOrg(userId) {
  const orgId = process.env.RETAIL_ORG_ID;
  const url = `${process.env.LOGTO_ENDPOINT}/api/organizations/${orgId}/users`;

  const doRequest = async () => {
    const headers = await authHeaders();
    return client.post(url, { userIds: [userId] }, { headers });
  };

  try {
    await doRequest();
    console.log(JSON.stringify({ action: 'assignToRetailOrg', userId, orgId, status: 'ok' }));
  } catch (err) {
    const status = err.response?.status;

    if (status === 409 || status === 422) {
      console.log(JSON.stringify({ action: 'assignToRetailOrg', userId, orgId, status: 'already_in_org' }));
      return;
    }
    if (status === 404) {
      console.log(JSON.stringify({ action: 'assignToRetailOrg', userId, orgId, status: 'org_not_found' }));
      return;
    }

    if (!err.response) {
      console.log(JSON.stringify({ action: 'assignToRetailOrg', status: 'retrying' }));
      await delay(1000);
      try {
        await doRequest();
        console.log(JSON.stringify({ action: 'assignToRetailOrg', userId, orgId, status: 'ok' }));
      } catch (retryErr) {
        console.log(JSON.stringify({ action: 'assignToRetailOrg', userId, orgId, status: 'error', message: retryErr.message }));
      }
      return;
    }

    console.log(JSON.stringify({ action: 'assignToRetailOrg', userId, orgId, status: 'error', message: err.message }));
  }
}

/**
 * Sync a user's role in Logto: revoke all current roles and assign the new one.
 * If roleName is 'subscriber' and that role doesn't exist in Logto, just revoke all.
 *
 * @param {string} userId — Logto user ID
 * @param {string} roleName — target role name (e.g. 'premium_student', 'subscriber')
 */
async function syncUserRole(userId, roleName) {
  const base = `${process.env.LOGTO_ENDPOINT}/api`;

  try {
    // 1. Get all system roles
    const headers = await authHeaders();
    const { data: allRoles } = await client.get(`${base}/roles`, { headers });
    console.log(JSON.stringify({ action: 'syncUserRole', userId, step: 'fetchedSystemRoles', count: allRoles.length, status: 'ok' }));

    // 2. Find target role
    const targetRole = allRoles.find((r) => r.name === roleName);
    if (!targetRole && roleName !== 'subscriber') {
      console.log(JSON.stringify({ action: 'syncUserRole', userId, roleName, status: 'error', message: `Role '${roleName}' not found in Logto` }));
      return;
    }

    // 3. Get current roles of the user
    const refreshedHeaders = await authHeaders();
    const { data: currentRoles } = await client.get(`${base}/users/${userId}/roles`, { headers: refreshedHeaders });
    console.log(JSON.stringify({ action: 'syncUserRole', userId, step: 'fetchedUserRoles', current: currentRoles.map((r) => r.name), status: 'ok' }));

    // 4. Revoke all current roles
    if (currentRoles.length > 0) {
      const roleIds = currentRoles.map((r) => r.id);
      const deleteHeaders = await authHeaders();
      await client.delete(`${base}/users/${userId}/roles`, { headers: deleteHeaders, data: { roleIds } });
      console.log(JSON.stringify({ action: 'syncUserRole', userId, step: 'revokedRoles', roleIds, status: 'ok' }));
    }

    // 5. Assign new role (skip if subscriber role doesn't exist)
    if (targetRole) {
      const assignHeaders = await authHeaders();
      await client.post(`${base}/users/${userId}/roles`, { roleIds: [targetRole.id] }, { headers: assignHeaders });
      console.log(JSON.stringify({ action: 'syncUserRole', userId, step: 'assignedRole', roleName, roleId: targetRole.id, status: 'ok' }));
    } else {
      console.log(JSON.stringify({ action: 'syncUserRole', userId, step: 'noRoleToAssign', roleName, status: 'ok' }));
    }
  } catch (err) {
    if (!err.response) {
      console.log(JSON.stringify({ action: 'syncUserRole', userId, roleName, status: 'retrying', message: err.message }));
      await delay(1000);
      try {
        // Simplified retry: just attempt the full sync again is too complex,
        // log the error and let the caller handle it
        console.log(JSON.stringify({ action: 'syncUserRole', userId, roleName, status: 'error', message: 'Retry not attempted for multi-step operation' }));
      } catch (retryErr) {
        console.log(JSON.stringify({ action: 'syncUserRole', userId, roleName, status: 'error', message: retryErr.message }));
      }
      return;
    }

    console.log(JSON.stringify({ action: 'syncUserRole', userId, roleName, status: 'error', message: err.message }));
  }
}

/**
 * Create a new organization in Logto.
 * @param {string} name
 * @param {string} [description]
 * @returns {Promise<object>} Organization object
 */
async function createOrganization(name, description) {
  const url = `${process.env.LOGTO_ENDPOINT}/api/organizations`;
  const headers = await authHeaders();
  const payload = { name, description };
  try {
    const { data } = await client.post(url, payload, { headers });
    return data;
  } catch (err) {
    throw new Error(`Logto createOrganization failed: ${err.message}`);
  }
}

/**
 * Ensure org roles student, teacher, admin exist globally in Logto. Create if missing.
 * @returns {Promise<object>} Map of roleName to role object
 */
async function ensureOrgRolesExist() {
  const url = `${process.env.LOGTO_ENDPOINT}/api/organization-roles`;
  const headers = await authHeaders();
  const requiredRoles = ['student', 'teacher', 'admin'];
  const roleMap = {};
  try {
    const { data: allRoles } = await client.get(url, { headers });
    for (const roleName of requiredRoles) {
      let role = allRoles.find((r) => normalizeRoleName(r.name) === roleName);
      if (!role) {
        // Create role if missing
        const { data: created } = await client.post(url, { name: roleName }, { headers });
        role = created;
      }
      roleMap[roleName] = role;
    }
    return roleMap;
  } catch (err) {
    throw new Error(`Logto ensureOrgRolesExist failed: ${err.message}`);
  }
}

/**
 * Create a user in Logto.
 * @param {object} userObj — { email, username, name }
 * @returns {Promise<object>} User object
 */
async function createUser(userObj) {
  const url = `${process.env.LOGTO_ENDPOINT}/api/users`;
  const headers = await authHeaders();
  try {
    const { data } = await client.post(url, userObj, { headers });
    return data;
  } catch (err) {
    throw new Error(`Logto createUser failed: ${err.message}`);
  }
}

/**
 * Find a user by email in Logto.
 * @param {string} email
 * @returns {Promise<object|null>} User object or null
 */
async function findUserByEmail(email) {
  const url = `${process.env.LOGTO_ENDPOINT}/api/users`;
  const headers = await authHeaders();
  try {
    const { data } = await client.get(url, { headers, params: { search: email } });
    const user = Array.isArray(data) ? data.find((u) => u.primaryEmail === email) : null;
    return user || null;
  } catch (err) {
    throw new Error(`Logto findUserByEmail failed: ${err.message}`);
  }
}

/**
 * Add a user to an organization in Logto.
 * @param {string} orgId
 * @param {string} userId
 */
async function addUserToOrganization(orgId, userId) {
  const url = `${process.env.LOGTO_ENDPOINT}/api/organizations/${orgId}/users`;
  const headers = await authHeaders();
  try {
    await client.post(url, { userIds: [userId] }, { headers });
  } catch (err) {
    const status = err.response?.status;
    if (status === 409 || status === 422) return; // already in org
    if (status === 404) return; // org not found
    throw new Error(`Logto addUserToOrganization failed: ${err.message}`);
  }
}

/**
 * Get user roles from Logto Management API
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
async function getUserRoles(userId) {
  const url = `${process.env.LOGTO_ENDPOINT}/api/users/${userId}/roles`;
  const headers = await authHeaders();
  try {
    const { data } = await client.get(url, { headers });
    return Array.isArray(data) ? data.map((r) => normalizeRoleName(r.name)) : [];
  } catch (err) {
    throw new Error(`getUserRoles failed: ${err.message}`);
  }
}

module.exports = {
  normalizeRoleName,
  getManagementToken,
  assignToRetailOrg,
  syncUserRole,
  createOrganization,
  ensureOrgRolesExist,
  createUser,
  findUserByEmail,
  addUserToOrganization,
  getUserRoles,
  getOrgRoleIdByName,
};
