import { Routes, Route, useNavigate, useParams, NavLink } from 'react-router-dom';
import Topbar from "../../components/Topbar";

const OrganizationDetails = () => {
  const { id } = useParams();
  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />
      <div className="max-w-3xl mx-auto px-4 py-8 w-full">
        <h1 className="text-2xl font-bold text-[#052490] mb-6">Organization Details</h1>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <p className="text-[#031C44] mb-2">Organization ID: <span className="font-mono text-xs">{id}</span></p>
          <p className="text-[#031C44]">(Placeholder) Here you will see the full details and provisioning status for this school organization.</p>
        </div>
      </div>
    </div>
  );
};

export default OrganizationDetails;
