const axios = require('axios');
const { normalizeUsername, normalizeName } = require('../utils/normalizeUser');

const WP_BASE = 'https://www.learnsocialstudies.com/wp-json/wp/v2';
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
 * Create a WordPress user as subscriber.
 * @param {{ email: string, username?: string, name?: string }} params
 */
async function createWordPressUser({ email, username, name }) {
  const normalizedUsername = normalizeUsername(username, email);
  const displayName = normalizeName(name, email);
  const url = `${WP_BASE}/users`;

  const payload = {
    username: normalizedUsername,
    email,
    password: require('crypto').randomBytes(24).toString('hex'),
    name: displayName,
    roles: ['subscriber'],
  };

  const doRequest = () => client.post(url, payload, { headers: wpAuthHeaders() });

  try {
    const { data } = await doRequest();
    console.log(JSON.stringify({ action: 'createWordPressUser', userId: data.id, email, status: 'ok' }));
    return data;
  } catch (err) {
    const status = err.response?.status;

    if (status === 409 || status === 422) {
      console.log(JSON.stringify({ action: 'createWordPressUser', email, status: 'already_exists' }));
      return;
    }
    if (status === 404) {
      console.log(JSON.stringify({ action: 'createWordPressUser', email, status: 'not_found' }));
      return;
    }

    // WordPress returns 500 with "existing_user_login" or "existing_user_email"
    const code = err.response?.data?.code || '';
    if (code.includes('existing_user')) {
      console.log(JSON.stringify({ action: 'createWordPressUser', email, status: 'already_exists' }));
      return;
    }

    if (!err.response) {
      console.log(JSON.stringify({ action: 'createWordPressUser', email, status: 'retrying' }));
      await delay(1000);
      try {
        const { data } = await doRequest();
        console.log(JSON.stringify({ action: 'createWordPressUser', userId: data.id, email, status: 'ok' }));
        return data;
      } catch (retryErr) {
        console.log(JSON.stringify({ action: 'createWordPressUser', email, status: 'error', message: retryErr.message }));
        return;
      }
    }

    console.log(JSON.stringify({ action: 'createWordPressUser', email, status: 'error', message: err.message }));
  }
}

/**
 * Find a WordPress user by email.
 * @param {string} email
 * @returns {Promise<object|null>} WP user object or null
 */
async function findWordPressUserByEmail(email) {
  const url = `https://www.learnsocialstudies.com/wp-json/wp/v2/users?search=${encodeURIComponent(email)}`;
  try {
    const { data } = await client.get(url, { headers: wpAuthHeaders() });
    if (Array.isArray(data)) {
      return data.find(u => u.email === email) || null;
    }
    return null;
  } catch (err) {
    throw new Error(`findWordPressUserByEmail failed: ${err.message}`);
  }
}

module.exports = { createWordPressUser, findWordPressUserByEmail };
