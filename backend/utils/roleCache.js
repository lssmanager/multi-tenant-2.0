let orgRolesCache = null;
let orgRolesCacheExpiresAt = 0;

async function getCachedOrgRoles(fetchFn) {
  const now = Date.now();
  if (!orgRolesCache || orgRolesCacheExpiresAt < now) {
    orgRolesCache = await fetchFn();
    orgRolesCacheExpiresAt = now + 60 * 60 * 1000;
  }
  return orgRolesCache;
}

function clearOrgRolesCache() {
  orgRolesCache = null;
  orgRolesCacheExpiresAt = 0;
}

module.exports = { getCachedOrgRoles, clearOrgRolesCache };
