const express = require('express');
const router = express.Router();

const { syncUserRole } = require('../services/logtoManagement');
const { getMoodleUserByEmail, getMoodleCourseById, enrolUserInCourse, unenrolUserFromCourse } = require('../services/moodle');
const { updateContactCustomValues } = require('../services/fluentcrm');

/**
 * Map a subscription plan name to the target Logto role and Moodle role ID.
 * For now any active plan maps to premium_student / roleId 5.
 *
 * @param {string} subscriptionName — the subscriptions_name from FluentCRM
 * @param {string} event — the webhook event type
 * @returns {{ logtoRole: string, moodleRoleId: number|null }}
 */
function mapSubscriptionToRole(subscriptionName, event) {
  const expiredEvents = ['subscription_expired', 'subscription_cancelled'];
  if (expiredEvents.includes(event)) {
    return { logtoRole: 'subscriber', moodleRoleId: null };
  }
  // Any active subscription → premium_student
  return { logtoRole: 'premium_student', moodleRoleId: 5 };
}

// POST /roles/sync — called by FluentCRM Outgoing Webhook
router.post('/sync', async (req, res) => {
  // 1. Verify X-Webhook-Secret header using timing-safe comparison
  const secret = req.headers['x-webhook-secret'];
  const expectedSecret = process.env.FLUENTCRM_WEBHOOK_SECRET;
  if (!secret || !expectedSecret) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  const secretBuf = Buffer.from(secret);
  const expectedBuf = Buffer.from(expectedSecret);
  if (secretBuf.length !== expectedBuf.length || !require('crypto').timingSafeEqual(secretBuf, expectedBuf)) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const { event, contact } = req.body || {};
  if (!event || typeof event !== 'string' || !contact || typeof contact !== 'object') {
    console.log(JSON.stringify({ action: 'rolesSync', status: 'error', message: 'Invalid or missing event/contact in payload' }));
    return res.status(200).json({ received: true });
  }
  if (!contact.custom_values || typeof contact.custom_values !== 'object') {
    console.log(JSON.stringify({ action: 'rolesSync', status: 'error', message: 'Missing custom_values in contact' }));
    return res.status(200).json({ received: true });
  }
  const customValues = contact.custom_values;
  const logtoUserId = customValues.logto_user_id;
  const email = contact.email;
  const subscriptionName = customValues.subscriptions_name || '';

  // 2. Validate logto_user_id
  if (!logtoUserId) {
    console.log(JSON.stringify({ action: 'rolesSync', email, status: 'error', message: 'Contact has no logto_user_id' }));
    return res.status(200).json({ received: true });
  }

  const { logtoRole, moodleRoleId } = mapSubscriptionToRole(subscriptionName, event);
  const courseId = parseInt(process.env.MOODLE_PREMIUM_COURSE_ID, 10);

  // 3. Handle activation / renewal / upgrade
  if (['subscription_activated', 'subscription_renewed', 'subscription_upgraded'].includes(event)) {
    // Find Moodle user for enrollment and course name for FluentCRM
    const [moodleUser, moodleCourse] = await Promise.all([
      email ? getMoodleUserByEmail(email) : null,
      courseId ? getMoodleCourseById(courseId) : null,
    ]);
    const courseName = moodleCourse ? moodleCourse.fullname : null;

    const operations = [
      syncUserRole(logtoUserId, logtoRole),
      // Enrol in Moodle premium course
      moodleUser && courseId
        ? enrolUserInCourse({ moodleUserId: moodleUser.id, courseId, roleId: moodleRoleId })
        : Promise.resolve(),
      // Update FluentCRM custom_values
      updateContactCustomValues(logtoUserId, {
        user_role: logtoRole,
        subscriptions_status: 'active',
        subscriptions_name: subscriptionName,
        ...(courseName ? { last_course_enrolled: courseName } : {}),
      }),
    ];

    const results = await Promise.allSettled(operations);

    console.log(JSON.stringify({
      event,
      logtoUserId,
      email,
      results: {
        logto: results[0].status,
        moodle: results[1].status,
        fluentcrm: results[2].status,
      },
    }));

    return res.status(200).json({ received: true });
  }

  // 4. Handle expiration / cancellation
  if (['subscription_expired', 'subscription_cancelled'].includes(event)) {
    const subscriptionStatus = event === 'subscription_expired' ? 'expired' : 'cancelled';

    // Find Moodle user for unenrolment
    const moodleUser = email ? await getMoodleUserByEmail(email) : null;

    const operations = [
      syncUserRole(logtoUserId, 'subscriber'),
      // Unenrol from Moodle premium course
      moodleUser && courseId
        ? unenrolUserFromCourse({ moodleUserId: moodleUser.id, courseId })
        : Promise.resolve(),
      // Update FluentCRM custom_values
      updateContactCustomValues(logtoUserId, {
        user_role: 'subscriber',
        subscriptions_status: subscriptionStatus,
      }),
    ];

    const results = await Promise.allSettled(operations);

    console.log(JSON.stringify({
      event,
      logtoUserId,
      email,
      results: {
        logto: results[0].status,
        moodle: results[1].status,
        fluentcrm: results[2].status,
      },
    }));

    return res.status(200).json({ received: true });
  }

  // 5. Unknown event — log and respond 200
  console.log(JSON.stringify({ action: 'rolesSync', event, logtoUserId, status: 'ok', message: 'Unhandled event type' }));
  return res.status(200).json({ received: true });
});

module.exports = router;
