// middleware/requireSuperAdmin.js
// Guard que verifica que el usuario tenga el rol super_admin global.
// No exige organizationId en el token — el super-admin opera a nivel global.

module.exports = function requireSuperAdmin(req, res, next) {
  const roles = req.user?.roles ?? [];
  if (!roles.includes('super-admin')) {
    return res.status(403).json({ error: 'Super-admin role required.' });
  }
  next();
};
