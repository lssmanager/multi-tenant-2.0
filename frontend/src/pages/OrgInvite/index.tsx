import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOrgMembersApi } from '../../api/orgMembers';
import { useCurrentUser } from '../../hooks/useCurrentUser';

const OrgInvitePage: React.FC = () => {
  const { orgId: orgIdParam } = useParams();
  const { orgId: currentOrgId, isOrgAdmin } = useCurrentUser();
  const orgId = orgIdParam ?? currentOrgId;
  const orgMembersApi = useOrgMembersApi();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'student' | 'teacher' | 'admin'>('student');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOrgAdmin) {
    return (
      <div className="p-8 text-center text-red-600 font-semibold">
        Access denied: only organization admins can invite members.
      </div>
    );
  }

  if (!orgId) {
    return <div className="p-8 text-center text-[#031C44]">No organization found.</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    setError(null);
    setIsSubmitting(true);

    try {
      await orgMembersApi.inviteMember(orgId, { email, role });
      setSuccess(true);
      setEmail('');
      setRole('student');
    } catch {
      setError('Failed to send invitation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-10 bg-white rounded shadow p-8">
      <h2 className="text-2xl font-bold mb-6">Invite member to organization</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 font-medium">Email</label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Role</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value as 'student' | 'teacher' | 'admin')}
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 transition"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Sending invitation...' : 'Invite'}
        </button>
      </form>
      {success && <div className="mt-4 text-green-600 font-medium">Invitation sent successfully.</div>}
      {error && <div className="mt-4 text-red-600 font-medium">{error}</div>}
    </div>
  );
};

export default OrgInvitePage;
