import { Routes, Route, useNavigate, useParams, NavLink } from 'react-router-dom';
import { FaHome, FaUsers, FaFileAlt, FaCog } from "react-icons/fa";
import { useCurrentUser } from "../hooks/useCurrentUser";


const allMenus = [
  { label: "Dashboard", to: "/", icon: <FaHome /> },
  { label: "Organizations", to: "/organizations", icon: <FaUsers />, superOnly: true },
  { label: "Members", to: "/org/members", icon: <FaUsers />, orgAdminOnly: true },
  { label: "Invite", to: "/org/invite", icon: <FaUsers />, orgAdminOnly: true },
  { label: "Groups", to: "/org/groups", icon: <FaFileAlt />, orgAdminOnly: true },
  { label: "Enroll", to: "/org/enroll", icon: <FaCog />, orgAdminOnly: true },
  { label: "Documents", to: "/documents", icon: <FaFileAlt /> },
  { label: "Settings", to: "/settings", icon: <FaCog /> },
];


export default function Sidebar() {
  const { isSuperAdmin, isOrgAdmin, isRetail, loading } = useCurrentUser();
  if (loading || isRetail) return null;

  const menu = allMenus.filter((item) => {
    if (item.superOnly) return isSuperAdmin;
    if (item.orgAdminOnly) return isOrgAdmin;
    return true;
  });

  return (
    <aside className="h-screen w-56 bg-[#052490] text-white flex flex-col shadow-lg">
      <div className="flex items-center justify-center h-20 border-b border-[#2259F2]">
        <img src="https://media.learnsocialstudies.com/wp-content/uploads/2026/03/13213913/buudyboss-logo-180-x-80-px-1.png" alt="Logo" className="h-12" />
      </div>
      <nav className="flex-1 py-6">
        <ul className="space-y-2">
          {menu.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center px-4 py-2 rounded-lg transition-colors duration-200 hover:bg-[#ED9E1B] hover:text-[#031C44] ${
                    isActive ? "bg-[#2259F2] text-white" : "text-white"
                  }`
                }
                end={item.to === "/"}
              >
                <span className="mr-3 text-lg">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
