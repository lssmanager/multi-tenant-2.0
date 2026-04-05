
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { requireAuth, requireOrganizationAccess } = require("./middleware/auth");
const { fetchLogtoManagementApiAccessToken } = require("./lib/utils");
const { normalizeRoleName, ensureOrgRolesExist } = require("./services/logtoManagement");
const app = express();
const port = process.env.PORT || 3000;

// Routers and middleware
const authRouter = require('./routes/auth');
const orgAdminRouter = require('./routes/orgAdmin');
const { requireOrgAdmin } = require('./middleware/requireOrgAdmin');
const webhookRouter = require('./routes/webhook');
const organizationsRouter = require('./routes/organizations');
const rolesRouter = require('./routes/roles');

// Middleware
app.use(cors());

// 1. Webhook FIRST — needs express.raw(), must be before express.json()
app.use('/webhook/logto', express.raw({ type: 'application/json' }), webhookRouter);

// 2. JSON parser for all other routes
app.use(express.json());

// 3. Auth API routes (access-context, etc)
app.use('/auth', authRouter);

// 4. Organizations admin API — super-admin manages all orgs
app.use('/admin/organizations', requireAuth(process.env.API_RESOURCE_INDICATOR), organizationsRouter);

// 5. FluentCRM role-sync webhook — verify via X-Webhook-Secret
app.use('/roles', (req, res, next) => {
  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== process.env.ROLES_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}, rolesRouter);

// 6. Org admin routes (after express.json) — canonical path
app.use('/org-admin', requireAuth(process.env.API_RESOURCE_INDICATOR), requireOrgAdmin, orgAdminRouter);

// Backward compatibility redirect from /org to /org-admin
app.use('/org', (req, res) => {
  res.redirect(308, req.url.replace('/org', '/org-admin'));
});

// (Removed duplicate /auth/access-context endpoint — now served via /auth router)

// Documents routes
app.get(
  "/documents",
  requireOrganizationAccess({ requiredScopes: ["read:documents"] }),
  async (req, res) => {
    console.log("userId", req.user.id);
    console.log("organizationId", req.user.organizationId);
    // Get documents from the database by organizationId
    // ....
    // Mock data matching the frontend
    const documents = [
      {
        id: '1',
        title: 'Getting Started Guide',
        updatedAt: '2024-03-15',
        updatedBy: 'John Doe',
        preview: 'Welcome to DocuMind! This guide will help you understand the basic features...'
      },
      {
        id: '2',
        title: 'Product Requirements',
        updatedAt: '2024-03-14',
        updatedBy: 'Alice Smith',
        preview: 'The new feature should include the following requirements...'
      }
    ];

    res.json(documents);
  }
);

app.post(
  "/documents",
  requireOrganizationAccess({ requiredScopes: ["create:documents"] }),
  async (req, res) => {
    // Create document in the database
    // ....
    res.json({ data: "Document created" });
  }
);

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to the API" });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
