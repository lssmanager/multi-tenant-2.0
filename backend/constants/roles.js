const ORG_ROLE_KEYS = Object.freeze(["admin", "teacher", "student", "coordinator"]);
const ORG_ROLE_PERMISSIONS = Object.freeze({
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
});

module.exports = { ORG_ROLE_KEYS, ORG_ROLE_PERMISSIONS };
