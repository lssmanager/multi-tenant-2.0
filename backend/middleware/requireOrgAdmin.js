async function requireOrgAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(403).json({ error: 'Org admin role required' });
    }

    // 1. SUPER ADMIN ALWAYS PASSES — no org context needed
    if (req.user.isSuperAdmin || req.user.accessContext?.isSuperAdmin) {
      return next();
    }

    // 2. Must have an active org context
    const activeOrganizationId =
      req.user.accessContext?.effectiveOrganizationId ||
      req.user.accessContext?.activeOrganizationId ||
      req.user.organizationId;

    if (!activeOrganizationId) {
      return res.status(403).json({ error: 'Org admin role required' });
    }

    // 3. Check resolved org roles for the active org
    const orgRoles = Array.isArray(req.user.accessContext?.organizationRoles)
      ? req.user.accessContext.organizationRoles
      : [];

    if (orgRoles.includes('admin')) {
      return next();
    }

    return res.status(403).json({ error: 'Org admin role required' });
  } catch (err) {
    return res.status(403).json({ error: 'Org admin role required' });
  }
}

module.exports = { requireOrgAdmin };
