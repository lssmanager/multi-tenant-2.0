const axios = require('axios');
const { normalizeUsername } = require('../utils/normalizeUser');

const FCRM_BASE = 'https://www.learnsocialstudies.com/wp-json/fluent-crm/v2';
const client = axios.create({ timeout: 5000 });

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function fcrmHeaders() {
  const credentials = Buffer.from(
    `${process.env.FLUENTCRM_API_USER}:${process.env.FLUENTCRM_APP_PASSWORD}`
  ).toString('base64');
  return {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Create or update a contact in FluentCRM.
 * Always includes logto_user_id and logto_id_organization in custom_values.
 *
 * @param {{ email: string, name?: string, logtoUserId: string, orgId?: string }} params
 */
async function upsertFluentCRMContact({ email, name, logtoUserId, orgId }) {
  const url = `${FCRM_BASE}/subscribers`;
  const organizationId = orgId || process.env.RETAIL_ORG_ID;
  const normalizedUsername = normalizeUsername('', email);
  const nameParts = (name || email.split('@')[0]).split(' ');

  const payload = {
    email,
    first_name: nameParts[0] || '',
    last_name: nameParts.slice(1).join(' ') || '',
    status: 'subscribed',
    custom_values: {
      logto_user_id: logtoUserId,
      logto_id_organization: organizationId,
      user_role: 'subscriber',
      username: normalizedUsername,
    },
  };

  const doRequest = () => client.post(url, payload, { headers: fcrmHeaders() });

  try {
    const { data } = await doRequest();
    const contactId = data?.contact?.id || data?.id || null;
    console.log(JSON.stringify({ action: 'upsertFluentCRMContact', email, contactId, status: 'ok' }));
    return data;
  } catch (err) {
    const status = err.response?.status;

    if (status === 409 || status === 422) {
      console.log(JSON.stringify({ action: 'upsertFluentCRMContact', email, status: 'already_exists' }));
      return;
    }

    if (!err.response) {
      console.log(JSON.stringify({ action: 'upsertFluentCRMContact', email, status: 'retrying' }));
      await delay(1000);
      try {
        const { data } = await doRequest();
        console.log(JSON.stringify({ action: 'upsertFluentCRMContact', email, status: 'ok' }));
        return data;
      } catch (retryErr) {
        console.log(JSON.stringify({ action: 'upsertFluentCRMContact', email, status: 'error', message: retryErr.message }));
        return;
      }
    }

    console.log(JSON.stringify({ action: 'upsertFluentCRMContact', email, status: 'error', message: err.message }));
  }
}

/**
 * Find a FluentCRM company by searching for its logto_org: prefix in description.
 * @param {string} orgId — Logto organization_id
 * @returns {Promise<object|null>} company object or null
 */
async function findCompanyByOrgId(orgId) {
  const url = `${FCRM_BASE}/companies/search`;

  try {
    const { data } = await client.post(url, { search: `logto_org:${orgId}` }, {
      headers: fcrmHeaders(),
    });
    const companies = data?.companies?.data || data?.data || [];
    return companies.find((c) => (c.description || '').includes(`logto_org:${orgId}`)) || null;
  } catch (err) {
    console.log(JSON.stringify({ action: 'findCompanyByOrgId', orgId, status: 'error', message: err.message }));
    return null;
  }
}

/**
 * Attach a contact to a FluentCRM company.
 * @param {number} subscriberId — FluentCRM contact ID
 * @param {number} companyId — FluentCRM company ID
 */
async function attachContactToCompany(subscriberId, companyId) {
  const url = `${FCRM_BASE}/companies/attach-subscribers`;

  const payload = {
    subscriber_ids: [subscriberId],
    company_ids: [companyId],
  };

  const doRequest = () => client.put(url, payload, { headers: fcrmHeaders() });

  try {
    await doRequest();
    console.log(JSON.stringify({ action: 'attachContactToCompany', subscriberId, companyId, status: 'ok' }));
  } catch (err) {
    if (!err.response) {
      console.log(JSON.stringify({ action: 'attachContactToCompany', status: 'retrying' }));
      await delay(1000);
      try {
        await doRequest();
        console.log(JSON.stringify({ action: 'attachContactToCompany', subscriberId, companyId, status: 'ok' }));
      } catch (retryErr) {
        console.log(JSON.stringify({ action: 'attachContactToCompany', subscriberId, companyId, status: 'error', message: retryErr.message }));
      }
      return;
    }

    console.log(JSON.stringify({ action: 'attachContactToCompany', subscriberId, companyId, status: 'error', message: err.message }));
  }
}

/**
 * Update custom_values for a contact found by logto_user_id.
 * Searches by logto_user_id, then PUTs the new custom_values.
 *
 * @param {string} logtoUserId — the Logto user ID to search by
 * @param {object} customValues — object of custom_values to update
 */
async function updateContactCustomValues(logtoUserId, customValues) {
  // 1. Search for contact by logto_user_id
  const searchUrl = `${FCRM_BASE}/subscribers`;

  try {
    const { data: searchResult } = await client.get(searchUrl, {
      params: { search: logtoUserId },
      headers: fcrmHeaders(),
    });

    const contacts = searchResult?.subscribers?.data || searchResult?.data || [];
    const contact = contacts.find((c) =>
      c.custom_values?.logto_user_id === logtoUserId
    );

    if (!contact) {
      console.log(JSON.stringify({ action: 'updateContactCustomValues', logtoUserId, status: 'not_found', message: 'Contact not found by logto_user_id' }));
      return;
    }

    // 2. Update the contact with new custom_values
    const updateUrl = `${FCRM_BASE}/subscribers/${contact.id}`;
    const { data } = await client.put(updateUrl, { custom_values: customValues }, { headers: fcrmHeaders() });
    console.log(JSON.stringify({ action: 'updateContactCustomValues', logtoUserId, contactId: contact.id, status: 'ok' }));
    return data;
  } catch (err) {
    if (!err.response) {
      console.log(JSON.stringify({ action: 'updateContactCustomValues', logtoUserId, status: 'retrying' }));
      await delay(1000);
      try {
        // Simplified retry for search+update — just log
        console.log(JSON.stringify({ action: 'updateContactCustomValues', logtoUserId, status: 'error', message: 'Retry not attempted for multi-step operation' }));
      } catch (retryErr) {
        console.log(JSON.stringify({ action: 'updateContactCustomValues', logtoUserId, status: 'error', message: retryErr.message }));
      }
      return;
    }
    console.log(JSON.stringify({ action: 'updateContactCustomValues', logtoUserId, status: 'error', message: err.message }));
  }
}

/**
 * Create a List in FluentCRM.
 * @param {string} title
 * @returns {Promise<object>} List object
 */
async function createList(title) {
  const url = `${FCRM_BASE}/lists`;
  try {
    const { data } = await client.post(url, { title }, { headers: fcrmHeaders() });
    return data;
  } catch (err) {
    throw new Error(`FluentCRM createList failed: ${err.message}`);
  }
}

/**
 * Create a Tag in FluentCRM.
 * @param {string} title
 * @returns {Promise<object>} Tag object
 */
async function createTag(title) {
  const url = `${FCRM_BASE}/tags`;
  try {
    const { data } = await client.post(url, { title }, { headers: fcrmHeaders() });
    return data;
  } catch (err) {
    throw new Error(`FluentCRM createTag failed: ${err.message}`);
  }
}

/**
 * Create a Company in FluentCRM.
 * @param {string} name
 * @param {string} orgId
 * @returns {Promise<object>} Company object
 */
async function createCompany(name, orgId) {
  const url = `${FCRM_BASE}/companies`;
  const payload = {
    name,
    type: 'Partner',
    description: `logto_org:${orgId}`
  };
  try {
    const { data } = await client.post(url, payload, { headers: fcrmHeaders() });
    return data;
  } catch (err) {
    throw new Error(`FluentCRM createCompany failed: ${err.message}`);
  }
}

/**
 * Find a contact by email in FluentCRM.
 * @param {string} email
 * @returns {Promise<object|null>} Contact object or null
 */
async function findContactByEmail(email) {
  const url = `${FCRM_BASE}/subscribers`;
  try {
    const { data } = await client.get(url, { params: { search: email }, headers: fcrmHeaders() });
    const contacts = data?.subscribers?.data || data?.data || [];
    return contacts.find((c) => c.email === email) || null;
  } catch (err) {
    throw new Error(`FluentCRM findContactByEmail failed: ${err.message}`);
  }
}

module.exports = {
  upsertFluentCRMContact,
  findCompanyByOrgId,
  attachContactToCompany,
  updateContactCustomValues,
  createList,
  createTag,
  createCompany,
  findContactByEmail,
};
