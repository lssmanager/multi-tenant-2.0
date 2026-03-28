const axios = require('axios');

const WP_BASE = 'https://www.learnsocialstudies.com/wp-json/buddyboss/v1';
const client = axios.create({ timeout: 5000 });

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function wpAuthHeaders() {
  const credentials = Buffer.from(
    `${process.env.WP_API_USER}:${process.env.WP_API_PASSWORD}`
  ).toString('base64');
  return {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Create a BuddyBoss group (school or subgroup).
 * @param {object} params — { name, description, groupType, orgId, parentId, meta, visibility }
 * @returns {Promise<object>} Group object
 */
async function createGroup({ name, description, groupType, orgId, parentId, meta = {}, visibility = 'private' }) {
  const url = `${WP_BASE}/groups`;
  const payload = {
    name,
    description,
    status: visibility,
    group_types: groupType ? [groupType] : undefined,
    parent_id: parentId || undefined,
    meta: { ...meta, logto_org_id: orgId },
  };
  try {
    const { data } = await client.post(url, payload, { headers: wpAuthHeaders() });
    return data;
  } catch (err) {
    throw new Error(`BuddyBoss createGroup failed: ${err.message}`);
  }
}

/**
 * Add a member to a BuddyBoss group.
 * @param {number} groupId
 * @param {number} userId — WordPress user ID
 * @returns {Promise<void>}
 */
async function addMemberToGroup(groupId, userId) {
  const url = `${WP_BASE}/groups/${groupId}/members`;
  try {
    await client.post(url, { user_id: userId }, { headers: wpAuthHeaders() });
  } catch (err) {
    throw new Error(`BuddyBoss addMemberToGroup failed: ${err.message}`);
  }
}

module.exports = {
  createGroup,
  addMemberToGroup,
};
