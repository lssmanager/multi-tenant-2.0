const axios = require('axios');

async function listOrganizations(token) {
  const response = await axios.get(`${process.env.LOGTO_ENDPOINT}/api/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 5000,
  });
  return Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.data?.data)
      ? response.data.data
      : [];
}

module.exports = { listOrganizations };
