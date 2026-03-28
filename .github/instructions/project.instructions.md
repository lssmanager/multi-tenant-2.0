---
applyTo: "**"
---

# Project Conventions — LearnSocialStudies Multi-Tenant SaaS

## System Overview

Multi-tenant SaaS educativo con dos tipos de cliente:
- **Retail (B2C):** usuarios individuales, email + password, org global única
- **Colegios (B2B):** instituciones completas, org independiente por tenant

## Service URLs

| Service | URL | Role |
|---|---|---|
| Logto (OIDC) | `https://auth.learnsocialstudies.com` | Identity provider, source of truth |
| Logto Management API | `https://auth.learnsocialstudies.com/api` | User/org CRUD |
| Logto Token Endpoint | `https://auth.learnsocialstudies.com/oidc/token` | Client credentials |
| Backend API | `https://api.learnsocialstudies.com` | Express app |
| WordPress REST | `https://www.learnsocialstudies.com/wp-json/wp/v2` | CMS + user CRUD |
| BuddyBoss REST | `https://www.learnsocialstudies.com/wp-json/buddyboss/v1` | Community groups |
| FluentCRM REST | `https://www.learnsocialstudies.com/wp-json/fluent-crm/v2` | CRM contacts |
| Moodle Web Services | `https://courses.learnsocialstudies.com/webservice/rest/server.php` | LMS |

---

## Architecture Rules

- **Logto is source of truth.** Never store roles or org membership outside Logto as primary. WP, Moodle, FluentCRM are consumers.
- **`organization_id` is the tenant anchor.** Every resource in every system must be traceable via `organization_id`.
- **Never mix users between organizations.** Every backend query must scope by `organization_id` from JWT.
- **Protected files — DO NOT MODIFY unless explicitly instructed:**
  - `backend/middleware/auth.js`
  - `backend/index.js` (only add route registration before `express.json()`)
  - `GET /documents` and `POST /documents` routes

---

## Logging

All logs must be structured JSON, one line per event. No plain text. Never log secrets, tokens, or passwords.

```js
// Service action log
console.log(JSON.stringify({
  action: 'actionName',       // camelCase verb_noun
  userId: 'logto_user_id',    // always include when available
  orgId: 'organization_id',   // always include when available
  status: 'ok',               // ok | error | already_exists | retrying | already_in_org | org_not_found
  message: 'error string'     // only on status: 'error'
}));

// Webhook event summary (used in route handlers only)
console.log(JSON.stringify({
  event: 'User.Created',
  userId: id,
  email: primaryEmail,
  results: {
    logto: 'fulfilled',       // from Promise.allSettled .status
    wordpress: 'fulfilled',
    moodle: 'rejected',
    fluentcrm: 'fulfilled'
  }
}));
```

---

## Error Handling

- Services must **never throw**. Catch, log, return gracefully.
- Use `Promise.allSettled()` for parallel service calls — **never** `Promise.all()`.
- Retry network errors **once** after 1000ms, then log `status: 'error'` and return.
- `409` / `422` → log `already_exists` or `already_in_org`, return silently.
- `404` → log `org_not_found`, return silently.
- Moodle returns HTTP 200 even on errors — always check `response.data.exception`. Messages containing `already` or `invalidrecord` → treat as `already_exists`.
- Webhook handlers always respond `200 { received: true }`, even on partial failure. Signature failure → `401` immediately.

---

## Environment Variables

**Naming:** `SCREAMING_SNAKE_CASE` with service prefix (`LOGTO_`, `WP_`, `MOODLE_`, `VITE_`).
**Never hardcode** secrets, URLs, or credentials. Backend reads via `process.env`, frontend via `import.meta.env`.

### Already configured (DO NOT redeclare)

```
LOGTO_MANAGEMENT_API_APPLICATION_ID
LOGTO_MANAGEMENT_API_APPLICATION_SECRET
LOGTO_JWKS_URL
LOGTO_ISSUER
LOGTO_ENDPOINT
LOGTO_MANAGEMENT_API_TOKEN_ENDPOINT   # e.g. https://auth.learnsocialstudies.com/oidc/token
LOGTO_MANAGEMENT_API_RESOURCE         # e.g. https://default.logto.app/api
API_RESOURCE_INDICATOR                # e.g. https://api.learnsocialstudies.com (JWT audience)
```

### Phase 2A

```
LOGTO_WEBHOOK_SECRET          # HMAC secret — Logto Console → Webhooks → Signing Key
RETAIL_ORG_ID                 # Logto organization_id for Retail global org
WP_API_USER                   # WordPress admin username
WP_API_PASSWORD               # WordPress application password
MOODLE_API_TOKEN              # Moodle web services token
FLUENTCRM_API_USER            # FluentCRM manager username (Settings → REST API)
FLUENTCRM_APP_PASSWORD        # WordPress Application Password for the FluentCRM user
```

### Phase 2B

```
FLUENTCRM_WEBHOOK_SECRET      # Custom header secret for FluentCRM Outgoing Webhooks
MOODLE_PREMIUM_COURSE_ID      # Moodle course ID to enroll Retail users on subscription activation
```

### Phase 2C+

```
BUDDYBOSS_SCHOOL_GROUP_TYPE   # BuddyBoss group type slug for schools
MOODLE_DEFAULT_CATEGORY_ID    # Root category ID for school sub-categories
MOODLE_COURSE_{SLUG}_ID       # Per-course IDs (e.g. MOODLE_COURSE_IB_MATH_ID)
```

### Frontend

```
VITE_LOGTO_ENDPOINT
VITE_LOGTO_APP_ID
VITE_API_URL
```

---

## Role Mapping (cross-system)

| Logto Role | WordPress Role | Moodle Role | Notes |
|---|---|---|---|
| `subscriber` | `subscriber` | — (no enrollment) | Default on signup |
| `premium_student` | `premium_member` | `student` (enrolled) | After payment |
| `teacher` | `editor` | `editingteacher` | B2B org-scoped |
| `admin` (org) | `administrator` (scoped) | `manager` (category) | B2B org-scoped |

- Retail role changes: FluentCRM Outgoing Webhook → `POST /roles/sync`
- B2B role changes: Admin panel → `PUT /org/members/:userId/roles`

---

## ID Naming Conventions (cross-system)

| Resource | Pattern |
|---|---|
| Moodle cohorte base del colegio | `org_{organization_id}` |
| Moodle cohorte por profesor | `org_{organization_id}_teacher_{userId}` |
| Moodle group por clase | `org_{organization_id}_{teacherSlug}_{classSlug}` |
| Moodle categoría del colegio | `org_{organization_id}` (idnumber field) |
| BuddyBoss group del colegio | meta: `logto_org_id = organization_id` |
| BuddyBoss subgroup por clase | meta: `logto_org_id` + `moodle_group_id` |
| FluentCRM company | custom field: `logto_organization_id = organization_id` |

---

## FluentCRM Custom Fields (already configured — DO NOT create new fields)

### Logto

| Slug | Type | Written by |
|---|---|---|
| `logto_user_id` | Text | Backend (Phase 2A — `User.Created` provisioning) |
| `logto_id_organization` | Text | Backend (Phase 2A — `User.Created` provisioning) |

### Contact

| Slug | Type | Written by |
|---|---|---|
| `previous_e-mail_address` | Text | Backend / manual |
| `profile_display_name` | Text | Backend |
| `nickname` | Text | Backend |
| `username` | Text | Backend |
| `user_role` | Text | Backend |
| `ip_address` | Text | WordPress |

### Woo Orders (updated automatically by WooCommerce — backend NEVER writes these)

| Slug | Type |
|---|---|
| `total_order_count` | Text |
| `total_lifetime_value` | Text |
| `last_order_date` | Text |
| `last_coupon_used` | Text |
| `last_order_total` | Text |
| `last_order_status` | Text |
| `last_order_payment_method` | Text |

### Woo Subscriptions

| Slug | Type | Written by |
|---|---|---|
| `subscription_id` | Text | WooCommerce |
| `subscriptions_status` | Text | WooCommerce |
| `subscriptions_name` | Text | WooCommerce |
| `subscriptions_start_date` | Date | WooCommerce |
| `subscriptions_end_date` | Date | WooCommerce |
| `trial_end_date` | Date | WooCommerce |
| `subscriptions_next_paymen` | Date | WooCommerce |
| `last_subcription_payed` | Text | WooCommerce |

### Moodle

| Slug | Type | Written by |
|---|---|---|
| `last_group_enrolled` | Text | Backend (on enrollment) |
| `last_course_enrolled` | Text | Backend (on enrollment) |
| `last_lesson_completed` | Text | — (empty, no tracking integration yet) |
| `last_lesson_completed_dat` | Date | — (empty) |
| `last_topic_completed` | Text | — (empty) |
| `last_course_completed` | Text | — (empty) |
| `last_course_completed_dat` | Date | — (empty) |
| `last_course_progressed` | Text | — (empty) |

---

## FluentCRM — Write Rules by Phase

### Phase 2A (`User.Created` provisioning)

Write only these `custom_values`: `logto_user_id`, `logto_id_organization`, `username`, `user_role` (value: `subscriber`). Nothing else.

### Phase 2B (subscription lifecycle)

**Activate / Renew subscription:**
- `user_role` → new role (e.g. `premium_student`)
- `subscriptions_status` → new status
- `subscriptions_name` → plan name
- `subscriptions_start_date` → start date
- `subscriptions_end_date` → end date

**Enroll in Moodle (after activation):**
- `last_course_enrolled` → course name
- `last_group_enrolled` → group name (if applicable)

**Expire / Cancel subscription:**
- `user_role` → `subscriber`
- `subscriptions_status` → `expired` or `cancelled`

### Phase 2C (B2B org creation)

When creating a B2B organization, also create in FluentCRM:
1. A **Company** (type: `Partner`, description contains `logto_org:{organization_id}`)
2. A **List** with the school name
3. A **Tag** with the school name

Store the IDs of all three alongside the `organization_id`. When a user is associated with the org, add them to the List and assign the Tag.

---

## FluentCRM — Authentication

Uses **Basic auth** with a WordPress Application Password — NOT Bearer tokens.

```
Authorization: Basic <base64(FLUENTCRM_API_USER:FLUENTCRM_APP_PASSWORD)>
```

`FLUENTCRM_API_USER` is the FluentCRM manager user (configured in FluentCRM Settings → REST API), **not** the WordPress admin. `FLUENTCRM_APP_PASSWORD` is the Application Password generated for that user in WordPress → Users → Application Passwords.

---

## FluentCRM — Outgoing Webhook Verification

FluentCRM does not sign webhooks automatically. Verification uses a custom header:

- **Header:** `X-Webhook-Secret`
- **Env var:** `FLUENTCRM_WEBHOOK_SECRET`
- If the header is missing or does not match → respond `401` immediately.

This is configured manually when creating the Outgoing Webhook in FluentCRM.

---

## Username Normalization

- Lowercase, alphanumeric + underscore only: `/[^a-z0-9_]/g` → removed
- Fallback to email prefix if username is empty

---

## HTTP Clients

- Use `axios` with `timeout: 5000` for all external API calls
- **`axios` is NOT installed in the base project.** Run `cd backend && npm install axios` before creating any service file
- Create dedicated `axios.create()` instances per service file
- Cache management API tokens in memory; refresh only when expired

