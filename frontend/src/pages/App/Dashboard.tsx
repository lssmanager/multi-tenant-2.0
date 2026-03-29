import { useEffect, useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import DashboardSuperAdmin from './DashboardSuperAdmin';
import OrgOverview from './OrgOverview';
import TeacherGroups from './TeacherGroups';
import DashboardRetail from './DashboardRetail';

const Dashboard = () => {
  const {
    loading,
    isRetail,
    isSuperAdmin,
    isOrgAdmin,
    isTeacher,
    isStudent,
    isImpersonating,
    impersonatedRole,
  } = useCurrentUser();
  const [redirectingRetail, setRedirectingRetail] = useState(false);

  useEffect(() => {
    if (isRetail && !isSuperAdmin) {
      setRedirectingRetail(true);
      window.location.replace('https://www.learnsocialstudies.com/my-account/');
    }
  }, [isRetail, isSuperAdmin]);

  if (loading || redirectingRetail) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading...</div>;
  }

  if (isSuperAdmin && isRetail) {
    return <DashboardRetail />;
  }

  if (isSuperAdmin && isImpersonating) {
    if (impersonatedRole === 'teacher') {
      return <TeacherGroups />;
    }

    if (impersonatedRole === 'student') {
      return <div className="p-8 text-[#031C44]">Students do not use this app. They access WordPress + Moodle directly.</div>;
    }

    return <OrgOverview />;
  }

  if (isSuperAdmin) {
    return <DashboardSuperAdmin />;
  }

  if (isOrgAdmin) {
    return <OrgOverview />;
  }

  if (isTeacher) {
    return <TeacherGroups />;
  }

  if (isStudent) {
    return <div className="p-8 text-[#031C44]">Students do not use this app. They access WordPress + Moodle directly.</div>;
  }

  return <div className="p-8 text-[#031C44]">This account does not have dashboard access.</div>;
};

export default Dashboard;
