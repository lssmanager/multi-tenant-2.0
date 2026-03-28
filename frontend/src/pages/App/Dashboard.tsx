
import { useLogto } from "@logto/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Topbar from "../../components/Topbar";

type OrganizationData = {
  id: string;
  name: string;
  description: string | null;
  organizationRoles?: string[];
};

const Dashboard = () => {
  const { isAuthenticated, fetchUserInfo } = useLogto();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    const loadUser = async () => {
      if (!isAuthenticated) return;
      try {
        const info = await fetchUserInfo();
        setUserInfo(info);
        const organizations = info?.organization_data || [];
        const firstOrg = organizations[0];
        setOrgId(firstOrg?.id);
        setRoles(firstOrg?.organizationRoles || []);
      } catch (err) {
        // handle error if needed
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [isAuthenticated, fetchUserInfo]);

  const isOrgAdmin = roles.includes("admin");
  const isTeacher = roles.includes("teacher");

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />
      <div className="flex-1 bg-[#FAFBFD]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h2 className="text-2xl font-bold text-[#052490] mb-2">Welcome to Learn Social Studies</h2>
          {orgId && (
            <div className="text-md text-[#031C44] mb-6">{userInfo?.organization_data?.[0]?.name}</div>
          )}
          {/* Quick access blocks by role */}
          {isOrgAdmin && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <a href="/org/members" className="block bg-white rounded-lg shadow-sm p-6 hover:shadow-md border border-gray-200 text-center font-medium text-[#052490]">Members</a>
              <a href="/org/groups" className="block bg-white rounded-lg shadow-sm p-6 hover:shadow-md border border-gray-200 text-center font-medium text-[#052490]">Groups</a>
              <a href="/org/enroll" className="block bg-white rounded-lg shadow-sm p-6 hover:shadow-md border border-gray-200 text-center font-medium text-[#052490]">Bulk Enrollment</a>
            </div>
          )}
          {isTeacher && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <a href="/teacher/groups" className="block bg-white rounded-lg shadow-sm p-6 hover:shadow-md border border-gray-200 text-center font-medium text-[#052490]">My Groups</a>
              <a href="/teacher/students" className="block bg-white rounded-lg shadow-sm p-6 hover:shadow-md border border-gray-200 text-center font-medium text-[#052490]">My Students</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
