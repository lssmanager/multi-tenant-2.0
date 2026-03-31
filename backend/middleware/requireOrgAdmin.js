const { getUserRoles, normalizeRoleName } = require('../services/logtoManagement');

const orgAdminCache = {};

async function requireOrgAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id)
      return res.status(403).json({ error: 'Org admin role required' });

    // 1. GLOBAL SUPER ADMIN CHECK (dominates all org logic)
    const globalRoles = Array.isArray(req.user.globalRoles)
      ? req.user.globalRoles.map(normalizeRoleName)
      : (Array.isArray(req.user.roles) ? req.user.roles.map(normalizeRoleName) : []);
    if (globalRoles.includes('super-admin') || req.user.accessContext?.isSuperAdmin) {
      // Grant access regardless of org context or org roles
      return next();
    }

    // 2. ORG CONTEXT CHECKS (only if NOT super admin)
    const accessContext = req.user.accessContext;
    const activeOrganizationId =
      accessContext?.effectiveOrganizationId || req.user.organizationId;
    if (!activeOrganizationId) {
      return res.status(403).json({ error: 'Org admin role required' });
    }

    if (accessContext?.organizationRoles?.includes('admin')) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const tokenRoles = Array.isArray(req.user.roles) ? req.user.roles.map(normalizeRoleName) : [];
    if (tokenRoles.includes('admin')) {
      return next();
    }

    let roles = null;

    if (orgAdminCache[userId] && orgAdminCache[userId].expiresAt > now) {
      roles = orgAdminCache[userId].roles;
    } else {
      roles = await getUserRoles(userId);
      orgAdminCache[userId] = { roles, expiresAt: now + 5 * 60 * 1000 };
    }

    if (!roles.includes('admin'))
      return res.status(403).json({ error: 'Org admin role required' });

    next();
  } catch (err) {
    return res.status(403).json({ error: 'Org admin role required' });
  }
}

module.exports = { requireOrgAdmin };
