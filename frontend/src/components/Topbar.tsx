import { useLogto } from '@logto/react';
import { APP_ENV } from '../env';
import { useCurrentUser } from '../hooks/useCurrentUser';

const Topbar = () => {
  const { signOut } = useLogto();
  const { currentOrganization } = useCurrentUser();

  return (
    <div className="border-b bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-6 min-w-0">
            <div className="text-[#052490] text-lg truncate">
              <span className="font-bold">Civitas</span>
              <span className="font-normal"> by Learn Social Studies</span>
            </div>
            {currentOrganization?.name && (
              <span className="text-sm text-gray-500 truncate">{currentOrganization.name}</span>
            )}
          </div>

          <button
            onClick={() => signOut(APP_ENV.app.signOutRedirectUri)}
            className="inline-flex items-center px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default Topbar;
