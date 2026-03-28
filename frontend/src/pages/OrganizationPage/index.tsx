import { Routes, Route, useNavigate, useParams, NavLink } from 'react-router-dom';
import { useCallback, useEffect, useState } from "react";
import { useLogto } from "@logto/react";
import { useOrganizationApi } from "../../api/organization";
import Topbar from "../../components/Topbar";
import Tabs, { Tab } from "../../components/Tabs";
import { type Document } from './types';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { ActionBar } from './components/ActionBar';
import { DocumentList } from './components/DocumentList';

const OrganizationPage = () => {
  const { orgId: organizationId } = useParams();
  const { isAuthenticated } = useLogto();
  const { getDocuments, getUserOrganizationScopes } = useOrganizationApi();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [userScopes, setUserScopes] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    if (!organizationId || !isAuthenticated) return;

    setLoading(true);
    setError(null);

    try {
      const [scopes, docsData] = await Promise.all([
        getUserOrganizationScopes(organizationId),
        getDocuments(organizationId),
      ]);

      setUserScopes(scopes);
      setDocuments(docsData);
    } catch (error) {
      setError(error instanceof Error ? error : new Error("Failed to fetch data"));
    } finally {
      setLoading(false);
    }
  }, [organizationId, isAuthenticated, getUserOrganizationScopes, getDocuments]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  const [activeTab, setActiveTab] = useState<string>("documents");
  const tabs: Tab[] = [
    { label: "Documents", value: "documents" },
    { label: "Members", value: "members" },
    { label: "Settings", value: "settings" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar organizationId={organizationId} showBackButton />
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {/* Main Content */}
      <div className="flex-1 bg-[#FAFBFD]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === "documents" && (
            <>
              <ActionBar canCreateDocuments={userScopes.includes("create:documents")} />
              <DocumentList documents={documents} />
            </>
          )}
          {activeTab === "members" && (
            <div className="text-[#031C44]">Members section coming soon.</div>
          )}
          {activeTab === "settings" && (
            <div className="text-[#031C44]">Settings section coming soon.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrganizationPage;
