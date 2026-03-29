import { LogtoConfig, LogtoProvider, useLogto } from '@logto/react';
import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { ToastProvider } from '../../components/ToastProvider';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { clearImpersonationContext } from '../../lib/impersonation';
import Callback from '../Callback';
import OrgMembersPage from '../OrgMembers';
import OrganizationPage from '../OrganizationPage';
import Dashboard from './Dashboard';
import Landing from './Landing';
import OrganizationDetails from './OrganizationDetails';
import Organizations from './Organizations';
import OrgGroupsCourses from './OrgGroupsCourses';
import OrgBulkEnrollment from './OrgBulkEnrollment';
import OrgInvite from './OrgInvite';
import TeacherGroups from './TeacherGroups';
import TeacherGroupStudents from './TeacherGroupStudents';

const config: LogtoConfig = {
  endpoint: import.meta.env.VITE_LOGTO_ENDPOINT,
  appId: import.meta.env.VITE_LOGTO_APP_ID,
  resources: [import.meta.env.VITE_API_URL],
  scopes: [
    'read:documents',
    'create:documents',
    'roles',
    'urn:logto:scope:organizations',
    'urn:logto:scope:organization_roles',
  ],
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
  const {
    loading,
    isAuthenticated,
    isSuperAdmin,
    isOrgAdmin,
    isTeacher,
    isImpersonating,
    impersonatedOrgName,
    impersonatedRole,
  } = useCurrentUser();
  const { getIdTokenClaims } = useLogto();

  useEffect(() => {
    (async () => {
      if (!isAuthenticated) return;
      const claims = await getIdTokenClaims();
      console.log('ID token claims:', claims);
      console.log('roles:', claims?.roles);
      console.log('organization_roles:', claims?.organization_roles);
      console.log('organizations:', claims?.organizations);
    })();
  }, [isAuthenticated, getIdTokenClaims]);

  const canAccessTeacherViews =
    isTeacher && (!isSuperAdmin || (isImpersonating && impersonatedRole === 'teacher'));
  const canAccessOrgAdminViews =
    isOrgAdmin &&
    (!isSuperAdmin || !isImpersonating || impersonatedRole === 'admin' || !impersonatedRole);

  if (!isAuthenticated) return <Landing />;
  if (loading) return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#FAFBFD]">
      <ToastProvider>
        <Topbar />
        {isSuperAdmin && isImpersonating && (
          <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm text-amber-900 flex items-center justify-between">
            <span>You are operating as {impersonatedRole || 'admin'} of {impersonatedOrgName || 'this school'}.</span>
            <button
              onClick={() => clearImpersonationContext()}
              className="px-3 py-1 rounded-md bg-white border border-amber-400 hover:bg-amber-50"
            >
              Exit impersonation
            </button>
          </div>
        )}
        <div className="flex min-h-[calc(100vh-4rem)]">
          <Sidebar />
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path=":orgId" element={<OrganizationPage />} />
              <Route path="/organizations" element={isSuperAdmin ? <Organizations /> : <NotFound />} />
              <Route path="/organizations/:id" element={isSuperAdmin ? <OrganizationDetails /> : <NotFound />} />
              <Route path="/org/members" element={canAccessOrgAdminViews ? <OrgMembersPage /> : <NotFound />} />
              <Route path="/org/invite" element={canAccessOrgAdminViews ? <OrgInvite /> : <NotFound />} />
              <Route path="/org/groups" element={canAccessOrgAdminViews ? <OrgGroupsCourses /> : <NotFound />} />
              <Route path="/org/enroll" element={canAccessOrgAdminViews ? <OrgBulkEnrollment /> : <NotFound />} />
              <Route path="/teacher/groups" element={canAccessTeacherViews ? <TeacherGroups /> : <NotFound />} />
              <Route path="/teacher/groups/:groupId/students" element={canAccessTeacherViews ? <TeacherGroupStudents /> : <NotFound />} />
            </Routes>
          </div>
        </div>
      </ToastProvider>
    </div>
  );
}

export default App;
