/**
 * Username & name normalization utilities.
 * Used by service files to ensure consistent identifiers across WordPress, Moodle, and FluentCRM.
 */

function normalizeUsername(username, email) {
  let normalized = (username || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!normalized && email) {
    normalized = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
  }
  return normalized || 'user';
}

function normalizeName(name, email) {
  if (name && name.trim()) return name.trim();
  if (email) return email.split('@')[0];
  return 'User';
}

module.exports = { normalizeUsername, normalizeName };
