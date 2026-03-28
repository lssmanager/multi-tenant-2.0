import {
  LogtoProvider,
  LogtoConfig,
} from "@logto/react";
import { Routes, Route } from "react-router-dom";
import Landing from "./Landing";
import Dashboard from "./Dashboard";
import Callback from "../Callback";
import OrganizationPage from "../OrganizationPage";
import Organizations from "./Organizations";
import OrganizationDetails from "./OrganizationDetails";
import OrgMembersPage from "../OrgMembers";
import OrgInvite from "./OrgInvite";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { useCurrentUser } from "../../hooks/useCurrentUser";

const config: LogtoConfig = {
  endpoint: import.meta.env.VITE_LOGTO_ENDPOINT,
  appId: import.meta.env.VITE_LOGTO_APP_ID,
  resources: [import.meta.env.VITE_API_URL],
  scopes: ["read:documents", "create:documents"],
};

function App() {
  return (
    <LogtoProvider config={config}>
      <Routes>
        <Route path="/callback" element={<Callback />} />
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </LogtoProvider>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-[#031C44]">
      <h1 className="text-5xl font-bold mb-4">404</h1>
      <p className="text-xl mb-2">Oops! You should not be here.</p>
      <p className="text-md text-gray-500">The page you are looking for does not exist or you do not have permission.</p>
    </div>
  );
}

function AppContent() {
  const { loading, isAuthenticated, isSuperAdmin, isOrgAdmin } = useCurrentUser();

  if (!isAuthenticated) {
    return <Landing />;
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#FAFBFD]">
      <Topbar />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <Sidebar />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path=":orgId" element={<OrganizationPage />} />
            <Route path="/organizations" element={isSuperAdmin ? <Organizations /> : <NotFound />} />
            <Route path="/organizations/:id" element={isSuperAdmin ? <OrganizationDetails /> : <NotFound />} />
            <Route path="/org/members" element={isOrgAdmin ? <OrgMembersPage /> : <NotFound />} />
            <Route path="/org/invite" element={isOrgAdmin ? <OrgInvite /> : <NotFound />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;
