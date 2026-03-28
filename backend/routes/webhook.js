const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { assignToRetailOrg } = require('../services/logtoManagement');
const { createWordPressUser } = require('../services/wordpress');
const { createMoodleUser } = require('../services/moodle');
const { upsertFluentCRMContact } = require('../services/fluentcrm');

/**
 * Verify Logto webhook HMAC-SHA256 signature.
 * Header: logto-signature-sha-256
 * Format: sha256=<hex_digest>
 * Input: raw body Buffer
 */
function verifySignature(req) {
  const sigHeader = req.headers['logto-signature-sha-256'];
  if (!sigHeader || !sigHeader.startsWith('sha256=')) return false;

  const secret = process.env.LOGTO_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.body) // req.body is a raw Buffer thanks to express.raw()
    .digest('hex');

  const provided = sigHeader.slice('sha256='.length);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(provided, 'hex')
    );
  } catch {
    return false;
  }
}

// POST /webhook/logto
router.post('/', async (req, res) => {
  // 1. Verify HMAC signature
  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 2. Parse raw body
  let event, data;
  try {
    const parsed = JSON.parse(req.body.toString());
    event = parsed.event;
    data = parsed.data;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 3. Handle User.Created
  if (event === 'User.Created') {
    const { id, primaryEmail, username, name } = data;

    const results = await Promise.allSettled([
      assignToRetailOrg(id),
      createWordPressUser({ email: primaryEmail, username, name }),
      createMoodleUser({ email: primaryEmail, username, name }),
      upsertFluentCRMContact({ email: primaryEmail, name, logtoUserId: id }),
    ]);

    // NOTE: In Phase 2A all new users are Retail. B2B company attachment
    // will be added in Phase 2C/2D when users are invited to a school org.

    console.log(JSON.stringify({
      event: 'User.Created',
      userId: id,
      email: primaryEmail,
      results: {
        logto: results[0].status,
        wordpress: results[1].status,
        moodle: results[2].status,
        fluentcrm: results[3].status,
      },
    }));
  }

  // 4. Always respond 200
  return res.status(200).json({ received: true });
});

module.exports = router;
