const express = require('express');
const router = express.Router();
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const {
  createOrganization,
  ensureOrgRolesExist,
  createUser,
  findUserByEmail,
  addUserToOrganization,
  getUserRoles,
  getManagementToken,
  normalizeRoleName,
} = require('../services/logtoManagement');
const { createCategory, createCohort, addCohortMemberByEmail, createGroup, createGrouping, assignGroupToGrouping } = require('../services/moodle');
const {
  createList,
  createTag,
  findContactByEmail,
  upsertFluentCRMContact,
  findCompanyByOrgId,
  attachContactToCompany,
  createCompany,
  listSubscribers,
} = require('../services/fluentcrm');
const { findWordPressUserByEmail } = require('../services/wordpress');
const { createGroup: createBBGroup, addMemberToGroup } = require('../services/buddyboss');

// TODO: Add multer for file upload parsing when implementing batch endpoints
// const multer = require('multer');
// const upload = multer({ dest: 'uploads/' });

router.use(requireAuth(process.env.API_RESOURCE_INDICATOR));


// --- Super-admin check middleware with cache ---
const roleCache = {};
async function requireSuperAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(403).json({ error: 'Super-admin role required' });
    const userId = req.user.id;
    const now = Date.now();
    let roles = null;
    const tokenRoles = Array.isArray(req.user.roles) ? req.user.roles.map(normalizeRoleName) : [];
    if (tokenRoles.includes('super-admin')) return next();
    if (roleCache[userId] && roleCache[userId].expiresAt > now) {
      roles = roleCache[userId].roles;
    } else {
      roles = await getUserRoles(userId);
      roleCache[userId] = {
        roles,
        expiresAt: now + 5 * 60 * 1000 // 5 minutes
      };
    }
    if (!roles.map(normalizeRoleName).includes('super-admin')) return res.status(403).json({ error: 'Super-admin role required' });
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Super-admin role required' });
  }
}

// --- Admin Organization Management Routes ---


// GET /organizations — List all organizations (stub, implement as needed)
router.get('/', requireSuperAdmin, async (req, res) => {
  try {
    const token = await getManagementToken();
    const response = await axios.get(`${process.env.LOGTO_ENDPOINT}/api/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    });
    const organizations = Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.data?.data)
        ? response.data.data
        : [];

    res.status(200).json(organizations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load organizations' });
  }
});

// GET /organizations/retail/dashboard — Retail CRM snapshot for super-admin
router.get('/retail/dashboard', requireSuperAdmin, async (req, res) => {
  try {
    const {
      search = '',
      role = '',
      membership = '',
      status = '',
      page = '1',
      per_page = '100',
    } = req.query;

    const subscribers = await listSubscribers({
      search,
      page,
      per_page,
      status,
    });

    const normalizedRole = String(role || '').trim().toLowerCase();
    const normalizedMembership = String(membership || '').trim().toLowerCase();
    const normalizedStatus = String(status || '').trim().toLowerCase();

    const users = (Array.isArray(subscribers) ? subscribers : []).filter((subscriber) => {
      const customValues = subscriber.custom_values || {};
      const userRole = String(customValues.user_role || '').trim().toLowerCase();
      const membershipStatus = String(customValues.subscriptions_status || '').trim().toLowerCase();
      const subscriberStatus = String(subscriber.status || '').trim().toLowerCase();

      if (normalizedRole && userRole !== normalizedRole) return false;
      if (normalizedMembership && membershipStatus !== normalizedMembership) return false;
      if (normalizedStatus && subscriberStatus !== normalizedStatus) return false;
      return true;
    });

    const membershipSummary = users.reduce(
      (acc, subscriber) => {
        const customValues = subscriber.custom_values || {};
        const membershipStatus = String(customValues.subscriptions_status || '').trim().toLowerCase();
        if (membershipStatus === 'active') acc.active += 1;
        if (membershipStatus === 'expired' || membershipStatus === 'cancelled') acc.expired += 1;
        return acc;
      },
      { active: 0, expired: 0 },
    );

    const activeRetailUsers = users.filter((subscriber) => String(subscriber.status || '').toLowerCase() === 'subscribed').length;

    res.status(200).json({
      summary: {
        activeRetailUsers,
        membershipsActive: membershipSummary.active,
        membershipsExpired: membershipSummary.expired,
        totalUsers: users.length,
      },
      users,
      filters: {
        search: String(search || ''),
        role: normalizedRole,
        membership: normalizedMembership,
        status: normalizedStatus,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load retail dashboard data' });
  }
});

// POST /organizations — Create a new organization (school) and provision in all systems
router.post('/', requireSuperAdmin, async (req, res) => {
  const { name, description } = req.body;
  const results = {};
  let org, moodleCategory, moodleCohort, fcrmList, fcrmTag, fcrmCompany, bbGroup;
  let orgId;
  try {
    // 1. Create org in Logto
    org = await createOrganization(name, description);
    orgId = org.id;
    results.logto = 'fulfilled';
  } catch (err) {
    results.logto = 'error';
    console.log(JSON.stringify({ action: 'createOrganization', status: 'error', message: err.message }));
    return res.status(500).json({ error: 'Failed to create organization in Logto' });
  }

  // 2. Ensure org roles exist (Logto global roles)
  try {
    await ensureOrgRolesExist();
    results.logto_roles = 'fulfilled';
  } catch (err) {
    results.logto_roles = 'error';
    console.log(JSON.stringify({ action: 'ensureOrgRolesExist', status: 'error', message: err.message }));
  }

  // 3. Create Moodle category and cohort
  try {
    moodleCategory = await createCategory({
      name,
      idnumber: `org_${orgId}`,
      parent: process.env.MOODLE_DEFAULT_CATEGORY_ID,
    });
    moodleCohort = await createCohort({
      name: `Cohorte ${name}`,
      idnumber: `org_${orgId}`,
      categoryid: moodleCategory.id,
    });
    results.moodle = 'fulfilled';
  } catch (err) {
    results.moodle = 'error';
    console.log(JSON.stringify({ action: 'provisionMoodleOrg', orgId, status: 'error', message: err.message }));
  }

  // 4. Create List, Tag, and Company in FluentCRM
  try {
    fcrmList = await createList(name);
    fcrmTag = await createTag(name);
    fcrmCompany = await createCompany(name, orgId);
    results.fluentcrm = 'fulfilled';
  } catch (err) {
    results.fluentcrm = 'error';
    console.log(JSON.stringify({ action: 'provisionFluentCRMOrg', orgId, status: 'error', message: err.message }));
  }

  // 5. Create BuddyBoss group for the school
  try {
    bbGroup = await createBBGroup({
      name,
      type: process.env.BUDDYBOSS_SCHOOL_GROUP_TYPE,
      meta: { logto_org_id: orgId },
    });
    results.buddyboss = 'fulfilled';
  } catch (err) {
    results.buddyboss = 'error';
    console.log(JSON.stringify({ action: 'provisionBuddyBossOrg', orgId, status: 'error', message: err.message }));
  }

  // Log webhook event summary
  console.log(JSON.stringify({
    event: 'Organization.Created',
    orgId,
    name,
    results
  }));

  res.status(201).json({
    org,
    moodleCategory,
    moodleCohort,
    fcrmList,
    fcrmTag,
    fcrmCompany,
    bbGroup,
    results
  });
});




const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');
const csv = require('csv-parse/sync');
const axios = require('axios');



const BATCH_CONCURRENCY = 5;

// POST /organizations/:orgId/enroll-batch
router.post('/:orgId/enroll-batch', requireSuperAdmin, upload.single('file'), async (req, res) => {
  const { orgId } = req.params;
  const results = [];
  // ...existing code...
  // Read CSV file
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file required' });
  }

  let students;
  try {
    const fileContent = fs.readFileSync(req.file.path);
    students = csv.parse(fileContent, { columns: true });
  } // <-- add closing brace for try block
  catch (err) {
    return res.status(400).json({ error: 'Failed to read CSV file' });
  }

  // Lookup org resources (do not create)
  // 1. Moodle cohort
  let moodleCohort = null;
  try {
    // Assume a findCohortByIdnumber helper exists
    moodleCohort = await require('../services/moodle').findCohortByIdnumber(`org_${orgId}`);
  } catch {}
  // 2. FluentCRM List/Tag/Company
  let fcrmList = null, fcrmTag = null, fcrmCompany = null;
  try {
    fcrmList = await require('../services/fluentcrm').findListByName(`Org ${orgId}`);
    fcrmTag = await require('../services/fluentcrm').findTagByName(`Org ${orgId}`);
    fcrmCompany = await findCompanyByOrgId(orgId);
  } catch {}
  // 3. BuddyBoss group
  let bbGroup = null;
  try {
    bbGroup = await require('../services/buddyboss').findGroupByOrgId(orgId);
  } catch {}

  // Helper for concurrency
  async function processBatch(batch) {
    return await Promise.allSettled(batch.map(async (student) => {
      const { email, name } = student;
      const result = { email };
      // 1. Find or create user in Logto
      let user;
      try {
        user = await findUserByEmail(email);
        if (!user) {
          user = await createUser({ email, name, orgId });
        }
        await addUserToOrganization(user.id, orgId);
        result.logto = 'fulfilled';
      } catch (err) {
        result.logto = 'error';
      }
      // 2. Enroll in Moodle cohort
      try {
        if (moodleCohort) await addCohortMemberByEmail(moodleCohort.id, email);
        result.moodle = 'fulfilled';
      } catch (err) {
        result.moodle = 'error';
      }
      // 3. Upsert in FluentCRM, add to List/Tag
      try {
        const contact = await upsertFluentCRMContact({ email, name, logtoUserId: user?.id, orgId });
        // Optionally attach to List/Tag here
        result.fluentcrm = 'fulfilled';
      } catch (err) {
        result.fluentcrm = 'error';
      }
      // 4. Add to BuddyBoss group (must use WP user ID)
      try {
        if (bbGroup) {
          // Lookup WP user by email
          let wpUserId = null;
          try {
            let wpUser = await findWordPressUserByEmail(email);
            if (!wpUser) {
              await new Promise(r => setTimeout(r, 2000));
              wpUser = await findWordPressUserByEmail(email);
            }
            if (wpUser) wpUserId = wpUser.id;
          } catch {}
          if (wpUserId) {
            await addMemberToGroup(bbGroup.id, wpUserId);
            result.buddyboss = 'fulfilled';
          } else {
            result.buddyboss = 'error';
          }
        }
      } catch (err) {
        result.buddyboss = 'error';
      }
      return result;
    }));
  }

  // Batch with concurrency
  let i = 0;
  while (i < students.length) {
    const batch = students.slice(i, i + BATCH_CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const batchResults = await processBatch(batch);
    results.push(...batchResults.map(r => r.value || r.reason));
    i += BATCH_CONCURRENCY;
  }

  // Log webhook event summary
  console.log(JSON.stringify({
    event: 'BatchEnroll',
    orgId,
    count: students.length,
    results: results.map(r => ({ email: r.email, logto: r.logto, moodle: r.moodle, fluentcrm: r.fluentcrm, buddyboss: r.buddyboss }))
  }));

  res.status(200).json({
    orgId,
    count: students.length,
    results
  });
});

// POST /organizations/:orgId/groups — Create a teacher group
router.post('/:orgId/groups', requireSuperAdmin, async (req, res) => {
  // Required: teacherId, teacherName, courseId, groupName
  const { teacherId, teacherName, courseId, groupName } = req.body;
  const orgId = req.params.orgId;
  const results = {};
  let moodleGroup, teacherCohort, grouping, bbSubgroup;
  let parentGroup = null;
  try {
    // 1. Create Moodle group
    moodleGroup = await createGroup({
      name: groupName,
      idnumber: `org_${orgId}_${teacherId}_${groupName}`,
      courseid: courseId,
    });
    results.moodleGroup = 'fulfilled';
  } catch (err) {
    results.moodleGroup = 'error';
  }
  try {
    // 2. Create teacher cohort
    teacherCohort = await createCohort({
      name: `Cohorte ${teacherName}`,
      idnumber: `org_${orgId}_teacher_${teacherId}`,
    });
    results.teacherCohort = 'fulfilled';
  } catch (err) {
    results.teacherCohort = 'error';
  }
  try {
    // 3. Create grouping
    grouping = await createGrouping({
      name: `${groupName} grouping`,
      courseid: courseId,
    });
    results.grouping = 'fulfilled';
  } catch (err) {
    results.grouping = 'error';
  }
  try {
    // 4. Assign group to grouping
    if (moodleGroup && grouping) {
      await assignGroupToGrouping({ groupid: moodleGroup.id, groupingid: grouping.id });
      results.assignGroup = 'fulfilled';
    }
  } catch (err) {
    results.assignGroup = 'error';
  }
  try {
    // 5. Find parent BuddyBoss group (main school group)
    parentGroup = await require('../services/buddyboss').findGroupByOrgId(orgId);
  } catch (err) {
    parentGroup = null;
  }
  try {
    // 6. Create BuddyBoss subgroup with parentId and moodle groupId in meta
    bbSubgroup = await createBBGroup({
      name: groupName,
      type: process.env.BUDDYBOSS_SCHOOL_GROUP_TYPE,
      parentId: parentGroup?.id,
      meta: { logto_org_id: orgId, moodle_group_id: moodleGroup?.id },
    });
    results.bbSubgroup = 'fulfilled';
  } catch (err) {
    results.bbSubgroup = 'error';
  }
  res.status(201).json({ moodleGroup, teacherCohort, grouping, bbSubgroup, results });
});

// Additional endpoints as needed for admin org management

module.exports = router;
