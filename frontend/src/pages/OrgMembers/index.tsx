import { useEffect, useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useOrgMembersApi, OrgMember } from '../../api/orgMembers';

const OrgMembersPage = () => {
  const { orgId, currentOrganization, isOrgAdmin, loading: userLoading } = useCurrentUser();
  const { listMembers, updateMemberRole, removeMember } = useOrgMembersApi();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading || !orgId || !isOrgAdmin) {
      setLoading(false);
      return;
    }

    const loadMembers = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listMembers(orgId);
        setMembers(data);
      } catch {
        setError('Could not load your school members.');
      } finally {
        setLoading(false);
      }
    };

    void loadMembers();
  }, [userLoading, orgId, isOrgAdmin, listMembers]);

  if (userLoading) {
    return <div className="flex items-center justify-center min-h-screen text-[#031C44]">Loading...</div>;
  }

  if (!isOrgAdmin || !orgId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600 font-medium">
          You do not have permission to view this section. Only school admins can manage members.
        </p>
      </div>
    );
  }

  const handleRoleChange = async (memberId: string, role: OrgMember['role']) => {
    setUpdatingId(memberId);
    try {
      await updateMemberRole(orgId, memberId, role);
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!window.confirm('Are you sure you want to remove this member from the school?')) {
      return;
    }

    setUpdatingId(memberId);
    try {
      await removeMember(orgId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 w-full">
      <h1 className="text-2xl font-bold text-[#052490] mb-2">
        Members - {currentOrganization?.name || 'Your School'}
      </h1>
      <p className="text-sm text-[#031C44] mb-6">
        Invite teachers and students, assign roles, and revoke access when someone leaves the institution.
      </p>

      {loading ? (
        <div className="text-[#031C44]">Loading members...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : members.length === 0 ? (
        <div className="text-[#031C44] bg-white border border-gray-200 rounded-lg p-6">
          There are no members in your school yet. Start by inviting teachers and students.
        </div>
      ) : (
        <table className="min-w-full bg-white rounded-lg shadow-sm">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-t">
                <td className="px-4 py-2">{member.name}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{member.email}</td>
                <td className="px-4 py-2">
                  <select
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                    value={member.role}
                    disabled={updatingId === member.id}
                    onChange={(e) => handleRoleChange(member.id, e.target.value as OrgMember['role'])}
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {member.status === 'active' ? 'Active' : 'Invited'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button
                    className="text-red-600 hover:underline text-sm"
                    disabled={updatingId === member.id}
                    onClick={() => handleRemove(member.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default OrgMembersPage;
