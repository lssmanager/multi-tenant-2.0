const axios = require('axios');
const { normalizeUsername, normalizeName } = require('../utils/normalizeUser');

const MOODLE_URL = 'https://courses.learnsocialstudies.com/webservice/rest/server.php';
const client = axios.create({ timeout: 5000 });

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function moodleParams(wsfunction, extra) {
  const params = new URLSearchParams({
    wstoken: process.env.MOODLE_API_TOKEN,
    wsfunction,
    moodlewsrestformat: 'json',
    ...extra,
  });
  return params;
}

/**
 * Create a Moodle user with auth=oauth2 so SSO via Logto works on first access.
 * @param {{ email: string, username?: string, name?: string }} params
 */
async function createMoodleUser({ email, username, name }) {
  const normalizedUsername = normalizeUsername(username, email);
  const displayName = normalizeName(name, email);
  const nameParts = displayName.split(' ');
  const firstName = nameParts[0] || 'User';
  const lastName = nameParts.slice(1).join(' ') || '.';

  const params = moodleParams('core_user_create_users');
  params.append('users[0][username]', normalizedUsername);
  params.append('users[0][email]', email);
  params.append('users[0][firstname]', firstName);
  params.append('users[0][lastname]', lastName);
  params.append('users[0][auth]', 'oauth2');
  params.append('users[0][createpassword]', '0');

  const doRequest = () =>
    client.post(MOODLE_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

  try {
    const { data } = await doRequest();

    // Moodle returns 200 even on errors — check for exception
    if (data?.exception) {
      const msg = (data.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('invalidrecord')) {
        console.log(JSON.stringify({ action: 'createMoodleUser', email, status: 'already_exists' }));
        return;
      }
      console.log(JSON.stringify({ action: 'createMoodleUser', email, status: 'error', message: data.message }));
      return;
    }

    const moodleUserId = Array.isArray(data) && data[0]?.id;
    console.log(JSON.stringify({ action: 'createMoodleUser', email, moodleUserId: moodleUserId || null, status: 'ok' }));
    return data;
  } catch (err) {
    if (!err.response) {
      console.log(JSON.stringify({ action: 'createMoodleUser', email, status: 'retrying' }));
      await delay(1000);
      try {
        const { data } = await doRequest();
        if (data?.exception) {
          const msg = (data.message || '').toLowerCase();
          if (msg.includes('already') || msg.includes('invalidrecord')) {
            console.log(JSON.stringify({ action: 'createMoodleUser', email, status: 'already_exists' }));
            return;
          }
          console.log(JSON.stringify({ action: 'createMoodleUser', email, status: 'error', message: data.message }));
          return;
        }
        console.log(JSON.stringify({ action: 'createMoodleUser', email, status: 'ok' }));
        return data;
      } catch (retryErr) {
        console.log(JSON.stringify({ action: 'createMoodleUser', email, status: 'error', message: retryErr.message }));
        return;
      }
    }

    console.log(JSON.stringify({ action: 'createMoodleUser', email, status: 'error', message: err.message }));
  }
}

/**
 * Get a Moodle user by email.
 * @param {string} email
 * @returns {Promise<object|null>} Moodle user object or null
 */
async function getMoodleUserByEmail(email) {
  const params = moodleParams('core_user_get_users');
  params.append('criteria[0][key]', 'email');
  params.append('criteria[0][value]', email);

  try {
    const { data } = await client.post(MOODLE_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (data?.exception) {
      console.log(JSON.stringify({ action: 'getMoodleUserByEmail', email, status: 'error', message: data.message }));
      return null;
    }
    const user = data?.users?.[0] || null;
    return user;
  } catch (err) {
    console.log(JSON.stringify({ action: 'getMoodleUserByEmail', email, status: 'error', message: err.message }));
    return null;
  }
}

/**
 * Enrol a user in a Moodle course with a specific role.
 * Uses enrol_manual_enrol_users.
 *
 * @param {{ moodleUserId: number, courseId: number, roleId: number }} params
 */
async function enrolUserInCourse({ moodleUserId, courseId, roleId }) {
  const params = moodleParams('enrol_manual_enrol_users');
  params.append('enrolments[0][userid]', moodleUserId);
  params.append('enrolments[0][courseid]', courseId);
  params.append('enrolments[0][roleid]', roleId);

  const doRequest = () =>
    client.post(MOODLE_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

  try {
    const { data } = await doRequest();

    if (data?.exception) {
      const msg = (data.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('invalidrecord')) {
        console.log(JSON.stringify({ action: 'enrolUserInCourse', moodleUserId, courseId, status: 'already_exists' }));
        return;
      }
      console.log(JSON.stringify({ action: 'enrolUserInCourse', moodleUserId, courseId, status: 'error', message: data.message }));
      return;
    }

    console.log(JSON.stringify({ action: 'enrolUserInCourse', moodleUserId, courseId, roleId, status: 'ok' }));
    return data;
  } catch (err) {
    if (!err.response) {
      console.log(JSON.stringify({ action: 'enrolUserInCourse', moodleUserId, courseId, status: 'retrying' }));
      await delay(1000);
      try {
        const { data } = await doRequest();
        if (data?.exception) {
          console.log(JSON.stringify({ action: 'enrolUserInCourse', moodleUserId, courseId, status: 'error', message: data.message }));
          return;
        }
        console.log(JSON.stringify({ action: 'enrolUserInCourse', moodleUserId, courseId, status: 'ok' }));
        return data;
      } catch (retryErr) {
        console.log(JSON.stringify({ action: 'enrolUserInCourse', moodleUserId, courseId, status: 'error', message: retryErr.message }));
        return;
      }
    }
    console.log(JSON.stringify({ action: 'enrolUserInCourse', moodleUserId, courseId, status: 'error', message: err.message }));
  }
}

/**
 * Get a Moodle course by ID.
 * Uses core_course_get_courses.
 *
 * @param {number} courseId
 * @returns {Promise<object|null>} Moodle course object or null
 */
async function getMoodleCourseById(courseId) {
  const params = moodleParams('core_course_get_courses');
  params.append('options[ids][0]', courseId);

  try {
    const { data } = await client.post(MOODLE_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (data?.exception) {
      console.log(JSON.stringify({ action: 'getMoodleCourseById', courseId, status: 'error', message: data.message }));
      return null;
    }
    return Array.isArray(data) ? data[0] || null : null;
  } catch (err) {
    console.log(JSON.stringify({ action: 'getMoodleCourseById', courseId, status: 'error', message: err.message }));
    return null;
  }
}

/**
 * Unenrol a user from a Moodle course.
 * Uses enrol_manual_unenrol_users (mirrors enrolUserInCourse pattern).
 *
 * @param {{ moodleUserId: number, courseId: number }} params
 */
async function unenrolUserFromCourse({ moodleUserId, courseId }) {
  const params = moodleParams('enrol_manual_unenrol_users');
  params.append('enrolments[0][userid]', moodleUserId);
  params.append('enrolments[0][courseid]', courseId);

  const doRequest = () =>
    client.post(MOODLE_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

  try {
    const { data } = await doRequest();

    if (data?.exception) {
      const msg = (data.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('invalidrecord')) {
        console.log(JSON.stringify({ action: 'unenrolUserFromCourse', moodleUserId, courseId, status: 'already_exists' }));
        return;
      }
      console.log(JSON.stringify({ action: 'unenrolUserFromCourse', moodleUserId, courseId, status: 'error', message: data.message }));
      return;
    }

    console.log(JSON.stringify({ action: 'unenrolUserFromCourse', moodleUserId, courseId, status: 'ok' }));
    return data;
  } catch (err) {
    if (!err.response) {
      console.log(JSON.stringify({ action: 'unenrolUserFromCourse', moodleUserId, courseId, status: 'retrying' }));
      await delay(1000);
      try {
        const { data } = await doRequest();
        if (data?.exception) {
          console.log(JSON.stringify({ action: 'unenrolUserFromCourse', moodleUserId, courseId, status: 'error', message: data.message }));
          return;
        }
        console.log(JSON.stringify({ action: 'unenrolUserFromCourse', moodleUserId, courseId, status: 'ok' }));
        return data;
      } catch (retryErr) {
        console.log(JSON.stringify({ action: 'unenrolUserFromCourse', moodleUserId, courseId, status: 'error', message: retryErr.message }));
        return;
      }
    }
    console.log(JSON.stringify({ action: 'unenrolUserFromCourse', moodleUserId, courseId, status: 'error', message: err.message }));
  }
}

/**
 * Create a course category in Moodle.
 * @param {object} params — { name, idnumber, parent }
 * @returns {Promise<object>} Category object
 */
async function createCategory({ name, idnumber, parent }) {
  const params = moodleParams('core_course_create_categories');
  params.append('categories[0][name]', name);
  params.append('categories[0][idnumber]', idnumber);
  params.append('categories[0][parent]', parent);
  try {
    const { data } = await client.post(MOODLE_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (data?.exception) throw new Error(data.message);
    return Array.isArray(data) ? data[0] : null;
  } catch (err) {
    throw new Error(`Moodle createCategory failed: ${err.message}`);
  }
}

/**
 * Create a cohort in Moodle.
 * @param {object} params — { name, idnumber, categorytype }
 * @returns {Promise<object>} Cohort object
 */
async function createCohort({ name, idnumber, categorytype }) {
  const params = moodleParams('core_cohort_create_cohorts');
  params.append('cohorts[0][name]', name);
  params.append('cohorts[0][idnumber]', idnumber);
  params.append('cohorts[0][categorytype]', categorytype);
  try {
    const { data } = await client.post(MOODLE_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (data?.exception) throw new Error(data.message);
    return Array.isArray(data) ? data[0] : null;
  } catch (err) {
    throw new Error(`Moodle createCohort failed: ${err.message}`);
  }
}

/**
 * Add a member to a cohort by email (with retry if user not found).
 * @param {object} params — { cohortId, email }
 * @returns {Promise<void>}
 */
async function addCohortMemberByEmail({ cohortId, email }) {
  const params = moodleParams('core_cohort_add_cohort_members');
  params.append('members[0][cohorttype]', 'id');
  params.append('members[0][cohort]', cohortId);
  params.append('members[0][usertype]', 'email');
  params.append('members[0][user]', email);

  const doRequest = () => client.post(MOODLE_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  try {
    const { data } = await doRequest();
    if (data?.exception && data.message?.toLowerCase().includes('user not found')) {
      // Wait and retry once
      await delay(3000);
      const { data: retryData } = await doRequest();
      if (retryData?.exception) throw new Error(retryData.message);
      return;
    }
    if (data?.exception) throw new Error(data.message);
  } catch (err) {
    throw new Error(`Moodle addCohortMemberByEmail failed: ${err.message}`);
  }
}

/**
 * Create a group in a Moodle course.
 * @param {object} params — { courseId, name, idnumber }
 * @returns {Promise<object>} Group object
 */
async function createGroup({ courseId, name, idnumber }) {
  const params = moodleParams('core_group_create_groups');
  params.append('groups[0][courseid]', courseId);
  params.append('groups[0][name]', name);
  params.append('groups[0][idnumber]', idnumber);
  try {
    const { data } = await client.post(MOODLE_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (data?.exception) throw new Error(data.message);
    return Array.isArray(data) ? data[0] : null;
  } catch (err) {
    throw new Error(`Moodle createGroup failed: ${err.message}`);
  }
}

/**
 * Create a grouping in a Moodle course.
 * @param {object} params — { courseId, name }
 * @returns {Promise<object>} Grouping object
 */
async function createGrouping({ courseId, name }) {
  const params = moodleParams('core_group_create_groupings');
  params.append('groupings[0][courseid]', courseId);
  params.append('groupings[0][name]', name);
  try {
    const { data } = await client.post(MOODLE_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (data?.exception) throw new Error(data.message);
    return Array.isArray(data) ? data[0] : null;
  } catch (err) {
    throw new Error(`Moodle createGrouping failed: ${err.message}`);
  }
}

/**
 * Assign a group to a grouping in Moodle.
 * @param {object} params — { groupingId, groupId }
 * @returns {Promise<void>}
 */
async function assignGroupToGrouping({ groupingId, groupId }) {
  const params = moodleParams('core_group_assign_grouping');
  params.append('assignments[0][groupingid]', groupingId);
  params.append('assignments[0][groupid]', groupId);
  try {
    const { data } = await client.post(MOODLE_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (data?.exception) throw new Error(data.message);
  } catch (err) {
    throw new Error(`Moodle assignGroupToGrouping failed: ${err.message}`);
  }
}

module.exports = {
  createMoodleUser,
  getMoodleUserByEmail,
  getMoodleCourseById,
  enrolUserInCourse,
  unenrolUserFromCourse,
  createCategory,
  createCohort,
  addCohortMemberByEmail,
  createGroup,
  createGrouping,
  assignGroupToGrouping,
};
