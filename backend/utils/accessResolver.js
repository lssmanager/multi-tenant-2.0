const normalizeRole = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeArray = (values) => {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(values.map(normalizeRole).filter((value) => value.length > 0))
  );
};

const parseOrganizationRolesByOrg = (organizationRoles) => {
  const map = new Map();
  normalizeArray(organizationRoles).forEach((entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex >= entry.length - 1) return;
    const orgId = entry.slice(0, separatorIndex).trim();
    const role = entry.slice(separatorIndex + 1).trim();
    if (!orgId || !role) return;
    if (!map.has(orgId)) map.set(orgId, new Set());
    map.get(orgId).add(role);
  });
  return map;
};

const ORG_ROLE_PERMISSIONS = {
  admin: [
    "read:members",
    "invite:member",
    "remove:member",
    "change:member_role",
    "manage:groups",
    "manage:bulk_enrollment",
    "read:groups",
    "read:documents",
    "write:documents",
    "delete:documents",
  ],
  teacher: [
    "read:assigned_groups",
    "read:assigned_students",
    "read:own_groups",
    "read:own_content",
    "read:documents",
  ],
  student: ["read:own_content", "read:documents"],
  coordinator: [
    "read:members",
    "read:groups",
    "read:documents",
    "read:assigned_students",
  ],
};

const GLOBAL_ROLE_PERMISSIONS = {
  "super-admin": [
    "*",
    "manage:organizations",
    "impersonate:organization",
    "manage:platform",
  ],
};

const ALL_SUPER_ADMIN_PERMISSIONS = [
  "*",
  "manage:organizations",
  "impersonate:organization",
  "manage:platform",
  "read:members",
  "invite:member",
  "remove:member",
  "change:member_role",
  "manage:groups",
  "manage:bulk_enrollment",
  "read:groups",
  "read:documents",
  "write:documents",
  "delete:documents",
  "read:assigned_groups",
  "read:assigned_students",
  "read:own_groups",
  "read:own_content",
];

const parseScopeClaimsForOrg = (user, activeOrganizationId) => {
  const normalizedOrgId =
    typeof activeOrganizationId === "string" ? activeOrganizationId.trim() : "";
  if (!normalizedOrgId) return {};

  const scopedClaims =
    user?.organizationScopes ||
    user?.organization_scopes ||
    user?.org_scopes ||
    {};

  if (!scopedClaims || typeof scopedClaims !== "object") return {};
  const byOrg = scopedClaims[normalizedOrgId];
  if (!byOrg || typeof byOrg !== "object") return {};

  return {
    shifts: normalizeArray(byOrg.shifts),
    campuses: normalizeArray(byOrg.campuses),
    groups: normalizeArray(byOrg.groups),
  };
};

const permissionsFromOrganizationRoles = (organizationRoles) => {
  const permissions = [];
  organizationRoles.forEach((role) => {
    permissions.push(...(ORG_ROLE_PERMISSIONS[role] || []));
  });
  return permissions;
};

const resolveEffectiveAccess = (user, activeOrganizationId) => {
  const globalRoles = normalizeArray(user?.roles);
  const isSuperAdmin = globalRoles.includes("super-admin");

  const organizationRolesByOrg = parseOrganizationRolesByOrg(
    user?.organizationRoles || user?.organization_roles
  );
  const normalizedActiveOrgId =
    typeof activeOrganizationId === "string" ? activeOrganizationId.trim() : "";
  const organizationRoles = normalizedActiveOrgId
    ? Array.from(organizationRolesByOrg.get(normalizedActiveOrgId) || [])
    : [];

  const globalPermissions = globalRoles.flatMap(
    (role) => GLOBAL_ROLE_PERMISSIONS[role] || []
  );
  const organizationPermissions =
    permissionsFromOrganizationRoles(organizationRoles);
  const tenantFeaturePermissions = normalizeArray(user?.tenantFeaturePermissions);

  let effectivePermissions = [
    ...globalPermissions,
    ...organizationPermissions,
    ...tenantFeaturePermissions,
  ];

  if (isSuperAdmin) {
    effectivePermissions = [
      ...ALL_SUPER_ADMIN_PERMISSIONS,
      ...organizationPermissions,
      ...tenantFeaturePermissions,
    ];
  }

  const effectiveScopes = parseScopeClaimsForOrg(user, normalizedActiveOrgId);

  return {
    isSuperAdmin,
    primaryRole: isSuperAdmin ? "super-admin" : "org-role",
    globalRoles,
    organizationRoles,
    effectivePermissions: Array.from(new Set(effectivePermissions)),
    effectiveScopes,
  };
};

module.exports = {
  resolveEffectiveAccess,
};
