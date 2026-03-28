const express = require('express');
const router = express.Router();
const { getManagementToken, getOrgRoleIdByName } = require('../services/logtoManagement');
const { findWordPressUserByEmail, updateWordPressUserRole } = require('../services/wordpress');
const { assignMoodleRole } = require('../services/moodle');
const axios = require('axios');

// GET /org-admin/members
router.get('/members', async (req, res) => {
  const organizationId = req.user.organizationId;
  try {
    const token = await getManagementToken();
    const response = await axios.get(
      `https://auth.learnsocialstudies.com/api/organizations/${organizationId}/users`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.status(200).json(response.data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST /org-admin/invite
router.post('/invite', async (req, res) => {
  const organizationId = req.user.organizationId;
  const { email } = req.body;
  try {
    const token = await getManagementToken();
    await axios.post(
      `https://auth.learnsocialstudies.com/api/organization-invitations`,
      { organizationId, invitee: email, organizationRoleIds: [] },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.status(200).json({ invited: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to invite user' });
  }
});

// PATCH /org-admin/members/:userId/role
router.patch('/members/:userId/role', async (req, res) => {
  const organizationId = req.user.organizationId;
  const { userId } = req.params;
  const { role } = req.body;
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
  const organizationId = req.user.organizationId;
  const { userId } = req.params;
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
