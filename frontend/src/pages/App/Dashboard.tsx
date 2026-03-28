import { useEffect, useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';

const Dashboard = () => {
  const { loading, isRetail, currentOrganization, isOrgAdmin, isTeacher } = useCurrentUser();
  const [redirectingRetail, setRedirectingRetail] = useState(false);

  useEffect(() => {
    if (isRetail) {
      setRedirectingRetail(true);
      window.location.replace('https://www.learnsocialstudies.com/my-account/');
    }
  }, [isRetail]);

  if (loading || redirectingRetail) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading...</div>;
  }

  return (
    <div className="flex-1 bg-[#FAFBFD]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-bold text-[#052490] mb-2">Welcome to Learn Social Studies</h2>
        {currentOrganization?.name && <div className="text-md text-[#031C44] mb-6">{currentOrganization.name}</div>}

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
  );
};

export default Dashboard;
