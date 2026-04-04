const { createRemoteJWKSet, jwtVerify } = require("jose");
const { normalizeRoleName } = require("../services/logtoManagement");
const { resolveEffectiveAccess } = require("../utils/accessResolver");

const getTokenFromHeader = (headers) => {
  const { authorization } = headers;
  const bearerTokenIdentifier = "Bearer";

  if (!authorization) {
    throw new Error("Authorization header missing");
  }

  if (!authorization.startsWith(bearerTokenIdentifier)) {
    throw new Error("Authorization token type not supported");
  }

  return authorization.slice(bearerTokenIdentifier.length + 1);
};

/**
 * Throws 403 if the user is not a super-admin and the requestedOrgId is not
 * in their JWT organizations list. Super admin bypasses entirely.
 */
function assertOrgAccessible(payload, requestedOrgId, isSuperAdmin) {
  if (!requestedOrgId) return;
  if (isSuperAdmin) return; // super admin: bypass — can operate in any org

  const userOrgIds = Array.isArray(payload.organizations)
    ? payload.organizations
        .map((o) => (typeof o === 'string' ? o : o?.id))
        .filter(Boolean)
    : [];

  const payloadOrgId = payload.organization_id || payload.organizationId;
  if (requestedOrgId === payloadOrgId) return;
  if (userOrgIds.includes(requestedOrgId)) return;

  const err = new Error('Organization not accessible');
  err.status = 403;
  throw err;
}

// The `aud` (audience) claim in the JWT token follows the format:
// "urn:logto:organization:<organization_id>"
// For example: "urn:logto:organization:123456789"
// This format allows us to extract the organization ID from the token
// by removing the "urn:logto:organization:" prefix
const extractOrganizationId = (aud) => {
  if (
    !aud ||
    typeof aud !== "string" ||
    !aud.startsWith("urn:logto:organization:")
  ) {
    throw new Error("Invalid organization token");
  }
  return aud.replace("urn:logto:organization:", "");
};

const decodeJwtPayload = (token) => {
  try {
    const [, payloadBase64] = token.split(".");
    if (!payloadBase64) {
      throw new Error("Invalid token format");
    }
    const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf-8");
    return JSON.parse(payloadJson);
  } catch (error) {
    throw new Error("Failed to decode token payload");
  }
};

const hasRequiredScopes = (tokenScopes, requiredScopes) => {
  if (!requiredScopes || requiredScopes.length === 0) {
    return true;
  }
  const scopeSet = new Set(tokenScopes);
  return requiredScopes.every((scope) => scopeSet.has(scope));
};

const verifyJwt = async (token, audience) => {
  const JWKS = createRemoteJWKSet(new URL(process.env.LOGTO_JWKS_URL));
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: process.env.LOGTO_ISSUER,
    audience,
  });
  return payload;
};

const requireOrganizationAccess = ({ requiredScopes = [] } = {}) => {
  return async (req, res, next) => {
    try {
      // Extract the token
      const token = getTokenFromHeader(req.headers);

      // Always use the expected audience from config, never from token
      const expectedAudience = process.env.API_RESOURCE_INDICATOR;
      if (!expectedAudience) {
        throw new Error("API resource indicator (audience) not configured");
      }

      // Verify the token with the expected audience
      const payload = await verifyJwt(token, expectedAudience);

      // Resolve global roles and super-admin flag
      const globalRoles = Array.isArray(payload.roles)
        ? payload.roles.map(normalizeRoleName)
        : [];
      const isSuperAdmin = globalRoles.includes('super-admin');

      // Build the requested org from headers/query
      const headerActiveOrganizationId =
        typeof req.headers["x-active-organization-id"] === "string"
          ? req.headers["x-active-organization-id"]
          : undefined;
      const headerImpersonationOrganizationId =
        typeof req.headers["x-impersonation-organization-id"] === "string"
          ? req.headers["x-impersonation-organization-id"]
          : undefined;
      const queryActiveOrganizationId =
        typeof req.query?.activeOrganizationId === "string"
          ? req.query.activeOrganizationId
          : undefined;
      const queryImpersonationOrganizationId =
        typeof req.query?.impersonationOrganizationId === "string"
          ? req.query.impersonationOrganizationId
          : undefined;

      const requestedOrg =
        headerImpersonationOrganizationId ||
        queryImpersonationOrganizationId ||
        headerActiveOrganizationId ||
        queryActiveOrganizationId;

      // Validate org access (throws 403 for non-super-admin accessing foreign org)
      assertOrgAccessible(payload, requestedOrg, isSuperAdmin);

      // Extract organization ID from the audience claim
      const organizationId = payload.organization_id;

      // Get scopes from the token
      const scopes = payload.scope?.split(" ") || [];

      // Verify required scopes
      if (!hasRequiredScopes(scopes, requiredScopes)) {
        throw new Error("Insufficient permissions");
      }

      const effectiveOrganizationId =
        requestedOrg ||
        organizationId;

      // Add organization info to request
      req.user = {
        id: payload.sub,
        organizationId: effectiveOrganizationId || organizationId,
        isSuperAdmin,
        roles: globalRoles,
        globalRoles,
        organizations: Array.isArray(payload.organizations) ? payload.organizations : [],
        organizationRoles: Array.isArray(payload.organization_roles) ? payload.organization_roles : [],
        impersonationOrganizationId:
          headerImpersonationOrganizationId || queryImpersonationOrganizationId || undefined,
      };
      req.user.accessContext = resolveEffectiveAccess(
        req.user,
        effectiveOrganizationId || organizationId
      );

      next();
    } catch (error) {
      const status = error.status === 403 ? 403 : 401;
      const errorMessage =
        error.status === 403
          ? 'Forbidden: organization not accessible'
          : error.message === 'Insufficient permissions'
          ? 'Unauthorized - Insufficient permissions'
          : 'Unauthorized - Invalid organization access';
      res.status(status).json({ error: errorMessage });
    }
  };
};

const requireAuth = (resource) => {
  if (!resource) {
    throw new Error("Resource parameter is required for authentication");
  }

  return async (req, res, next) => {
    try {
      // Extract the token
      const token = getTokenFromHeader(req.headers);

      // Verify the token
      const payload = await verifyJwt(token, resource);

      // Resolve global roles and super-admin flag
      const globalRoles = Array.isArray(payload.roles)
        ? payload.roles.map(normalizeRoleName)
        : [];
      const isSuperAdmin = globalRoles.includes('super-admin');

      // Extract organization ID from token
      const payloadOrganizationId = payload.organization_id || payload.organizationId || undefined;

      // Build the requested org from headers/query
      const headerActiveOrganizationId =
        typeof req.headers["x-active-organization-id"] === "string"
          ? req.headers["x-active-organization-id"]
          : undefined;
      const headerImpersonationOrganizationId =
        typeof req.headers["x-impersonation-organization-id"] === "string"
          ? req.headers["x-impersonation-organization-id"]
          : undefined;
      const queryActiveOrganizationId =
        typeof req.query?.activeOrganizationId === "string"
          ? req.query.activeOrganizationId
          : undefined;
      const queryImpersonationOrganizationId =
        typeof req.query?.impersonationOrganizationId === "string"
          ? req.query.impersonationOrganizationId
          : undefined;

      const requestedOrg =
        headerImpersonationOrganizationId ||
        queryImpersonationOrganizationId ||
        headerActiveOrganizationId ||
        queryActiveOrganizationId;

      // Validate org access (throws 403 for non-super-admin accessing foreign org)
      assertOrgAccessible(payload, requestedOrg, isSuperAdmin);

      const effectiveOrganizationId =
        requestedOrg ||
        payloadOrganizationId;

      req.user = {
        id: payload.sub,
        scopes: payload.scope?.split(" ") || [],
        organizationId: effectiveOrganizationId,
        isSuperAdmin,
        roles: globalRoles,
        globalRoles,
        organizations: Array.isArray(payload.organizations) ? payload.organizations : [],
        organizationRoles: Array.isArray(payload.organization_roles) ? payload.organization_roles : [],
        impersonationOrganizationId:
          headerImpersonationOrganizationId || queryImpersonationOrganizationId || undefined,
      };
      req.user.accessContext = resolveEffectiveAccess(
        req.user,
        effectiveOrganizationId
      );

      next();
    } catch (error) {
      const status = error.status === 403 ? 403 : 401;
      const errorMessage =
        error.status === 403
          ? 'Forbidden: organization not accessible'
          : 'Unauthorized';
      res.status(status).json({ error: errorMessage });
    }
  };
};

module.exports = {
  requireAuth,
  requireOrganizationAccess,
};
