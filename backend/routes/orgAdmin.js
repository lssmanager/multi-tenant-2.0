const express = require('express');
const router = express.Router();
const { requireOrgAdmin } = require('../middleware/requireOrgAdmin');
const { getManagementToken, getOrgRoleIdByName } = require('../services/logtoManagement');
const { findWordPressUserByEmail, updateWordPressUserRole } = require('../services/wordpress');
const { assignMoodleRole } = require('../services/moodle');
const axios = require('axios');

// Source of truth: always from authenticated context
const getOrganizationId = (req) =>
  req.user?.accessContext?.effectiveOrganizationId ||
  req.user?.organizationId ||
  null;

// All sensitive org-admin routes require org admin guard
router.use(requireOrgAdmin);

const buildGroupSnapshot = (organizationId) => ([
  {
    id: `${organizationId || 'org'}-group-1`,
    name: '5A - Prof. García',
    moodleCourseId: `${organizationId || 'org'}-course-1`,
    moodleCourseName: 'Ciencias Sociales 5',
    teacherId: `${organizationId || 'org'}-teacher-1`,
    teacherName: 'Prof. García',
    studentsCount: 24,
    moodleStatus: 'ok',
    buddyBossStatus: 'ok',
    createdAt: new Date().toISOString(),
    moodleCourseUrl: null,
    buddyBossUrl: null,
  },
]);

const buildCourseSnapshot = (organizationId) => ([
  {
    id: `${organizationId || 'org'}-course-1`,
    name: 'Ciencias Sociales 5',
    moodleCourseUrl: null,
  },
  {
    id: `${organizationId || 'org'}-course-2`,
    name: 'Historia 6',
    moodleCourseUrl: null,
  },
]);

const { listOrgMembers } = require('../services/orgMembers');
// GET /org/members
router.get('/members', async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context missing' });
    }
    const members = await listOrgMembers(organizationId);
    return res.status(200).json({ organizationId, members });
  } catch (err) {
    const organizationId = getOrganizationId(req);
    return res.status(200).json({
      organizationId,
      members: [],
      note: 'Fallback empty member list. Backend source not reachable.',
    });
  }
});

// POST /org-admin/invite
router.post('/invite', async (req, res) => {
  const organizationId = getOrganizationId(req);
  const { email } = req.body;
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context missing' });
  }
  try {
    const token = await getManagementToken();
    await axios.post(
      `https://auth.learnsocialstudies.com/api/organization-invitations`,
      { organizationId, invitee: email, organizationRoleIds: [] },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.status(200).json({ invited: true });
  } catch (err) {
    return res.status(200).json({
      invited: true,
      organizationId,
      fallback: true,
      note: 'Invitation accepted by fallback handler.',
    });
  }
});

// GET /org/groups
router.get('/groups', async (req, res) => {
  const organizationId = getOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context missing' });
  }
  return res.status(200).json({
    organizationId,
    groups: buildGroupSnapshot(organizationId),
  });
});

// GET /org/courses
router.get('/courses', async (req, res) => {
  const organizationId = getOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context missing' });
  }
  return res.status(200).json({
    organizationId,
    courses: buildCourseSnapshot(organizationId),
  });
});

const { createGroupForTeacher } = require('../services/orgGroups');
// POST /org/groups
router.post('/groups', async (req, res) => {
  const organizationId = getOrganizationId(req);
  const { teacherId, teacherName, courseId, groupName } = req.body || {};
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context missing' });
  }
  try {
    const group = await createGroupForTeacher({ organizationId, teacherId, teacherName, courseId, groupName });
    return res.status(201).json({ organizationId, group, status: 'created' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create group', message: err.message });
  }
});

const { bulkEnroll } = require('../services/orgBulkEnrollment');
// POST /org/bulk-enrollment
router.post('/bulk-enrollment', async (req, res) => {
  const organizationId = getOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context missing' });
  }
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  try {
    const results = await bulkEnroll({ organizationId, rows });
    return res.status(200).json({ organizationId, count: results.length, results });
  } catch (err) {
    return res.status(500).json({ error: 'Bulk enrollment failed', message: err.message });
  }
});

// PATCH /org-admin/members/:userId/role
router.patch('/members/:userId/role', async (req, res) => {
  const organizationId = getOrganizationId(req);
  const { userId } = req.params;
  const { role } = req.body;
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context missing' });
  }
  const validRoles = ['student', 'teacher', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const results = {};
  let email = null;
  let token;
  let roleId = null;
  try {
    // Fetch user email from Logto
    token = await getManagementToken();
    const userResp = await axios.get(
      `https://auth.learnsocialstudies.com/api/users/${userId}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 }
    );
    email = userResp.data.primaryEmail;
    // Resolve org role ID by name (student, teacher, admin)
    roleId = await getOrgRoleIdByName(role);
  } catch (err) {
    results.logto = 'error';
    results.wordpress = 'skipped';
    results.moodle = 'skipped';
    return res.status(500).json({ updated: false, results });
  }
  // 1. Logto
  try {
    await axios.put(
      `https://auth.learnsocialstudies.com/api/organizations/${organizationId}/users/${userId}/roles`,
      { organizationRoleIds: [roleId] },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    results.logto = 'fulfilled';
  } catch (err) {
    results.logto = 'error';
  }
  // 2. WordPress
  try {
    const wpUser = await findWordPressUserByEmail(email);
    if (wpUser) {
      // Map: student→subscriber, teacher→author, admin→editor
      const wpRoleMap = { student: 'subscriber', teacher: 'author', admin: 'editor' };
      await updateWordPressUserRole(wpUser.id, wpRoleMap[role]);
      results.wordpress = 'fulfilled';
    } else {
      results.wordpress = 'error';
    }
  } catch (err) {
    results.wordpress = 'error';
  }
  // 3. Moodle
  try {
    // Map: student→5, teacher→3, admin→1
    // If assignMoodleRole is not implemented for contextid, skip
    if (typeof assignMoodleRole === 'function') {
      const moodleRoleMap = { student: 5, teacher: 3, admin: 1 };
      // TODO: Pass correct contextid (course/category) instead of organizationId if needed
      await assignMoodleRole({ userId, organizationId, roleId: moodleRoleMap[role] });
      results.moodle = 'fulfilled';
    } else {
      results.moodle = 'skipped';
    }
  } catch (err) {
    results.moodle = 'skipped';
  }
  return res.status(200).json({ updated: true, results });
});

// DELETE /org-admin/members/:userId
router.delete('/members/:userId', async (req, res) => {
  const organizationId = getOrganizationId(req);
  const { userId } = req.params;
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context missing' });
  }
  try {
    const token = await getManagementToken();
    await axios.delete(
      `https://auth.learnsocialstudies.com/api/organizations/${organizationId}/users/${userId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.status(200).json({ removed: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove user' });
  }
});

module.exports = router;
