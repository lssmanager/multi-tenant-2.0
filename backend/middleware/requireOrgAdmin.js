const { getUserRoles } = require('../services/logtoManagement');

const orgAdminCache = {};

async function requireOrgAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id)
      return res.status(403).json({ error: 'Org admin role required' });

    const userId = req.user.id;
    const now = Date.now();
    let roles = null;

    if (orgAdminCache[userId] && orgAdminCache[userId].expiresAt > now) {
      roles = orgAdminCache[userId].roles;
    } else {
      roles = await getUserRoles(userId);
      orgAdminCache[userId] = { roles, expiresAt: now + 5 * 60 * 1000 };
    }

    if (!roles.includes('admin') && !roles.includes('super-admin'))
      return res.status(403).json({ error: 'Org admin role required' });

    next();
  } catch (err) {
    return res.status(403).json({ error: 'Org admin role required' });
  }
}

module.exports = { requireOrgAdmin };
