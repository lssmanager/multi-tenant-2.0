
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { requireAuth, requireOrganizationAccess } = require("./middleware/auth");
const { fetchLogtoManagementApiAccessToken } = require("./lib/utils");
const app = express();
const port = process.env.PORT || 3000;

// Routers and middleware
const orgAdminRouter = require('./routes/orgAdmin');
const { requireOrgAdmin } = require('./middleware/requireOrgAdmin');
const webhookRouter = require('./routes/webhook');
const organizationsRouter = require('./routes/organizations');
const rolesRouter = require('./routes/roles');

// Middleware
app.use(cors());

// 1. Webhook FIRST — needs express.raw(), must be before express.json()
app.use('/webhook/logto', express.raw({ type: 'application/json' }), webhookRouter);

// 1b. Organizations admin API (Phase 2C)
app.use('/organizations', organizationsRouter);

// 2. JSON parser for all other routes
app.use(express.json());

// 3. FluentCRM role-sync webhook (no auth middleware — verified via X-Webhook-Secret)
app.use('/roles', rolesRouter);

// 4. Org admin routes (after express.json)
app.use('/org-admin', requireAuth(process.env.API_RESOURCE_INDICATOR), requireOrgAdmin, orgAdminRouter);

// Organizations routes
app.post(
  "/organizations",
  requireAuth(process.env.API_RESOURCE_INDICATOR),
  async (req, res) => {
    
    const accessToken = await fetchLogtoManagementApiAccessToken();
    // Create organization in Logto
    const response = await fetch(`${process.env.LOGTO_ENDPOINT}/api/organizations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: req.body.name,
        description: req.body.description,
      }),
    });
    
    const createdOrganization = await response.json();

    // Add user to organization in Logto
    await fetch(`${process.env.LOGTO_ENDPOINT}/api/organizations/${createdOrganization.id}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        userIds: [req.user.id],
      }),
    });

    // Assign `Admin` role to the first user.
    const rolesResponse = await fetch(`${process.env.LOGTO_ENDPOINT}/api/organization-roles`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const roles = await rolesResponse.json();

    // Find the `Admin` role
    const adminRole = roles.find(role => role.name === 'Admin');

    // Assign `Admin` role to the first user.
    await fetch(`${process.env.LOGTO_ENDPOINT}/api/organizations/${createdOrganization.id}/users/${req.user.id}/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        organizationRoleIds: [adminRole.id],
      }),
    });

    res.json({ data: createdOrganization });
  }
);

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
