// routes/auth.js
// Authentication and access context endpoints.

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

/**
 * GET /auth/access-context
 * Devuelve el contexto de acceso del usuario autenticado.
 * El frontend lo llama para determinar permisos (super-admin, org-admin, etc).
 */
router.get('/access-context', authenticate, (req, res) => {
  const user = req.user;

  res.json({
    userId:            user.id,
    organizationId:    user.organizationId    ?? null,
    organizationRoles: user.organizationRoles ?? [],
    userRoles:         user.roles              ?? [],
    isSuperAdmin:      (user.roles ?? []).includes('super-admin'),
  });
});

module.exports = router;
