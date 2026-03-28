import { useHandleSignInCallback } from '@logto/react';
import { Routes, Route, useNavigate, useParams, NavLink } from 'react-router-dom';

export default function Callback() {
  const navigate = useNavigate();
  const { isLoading } = useHandleSignInCallback(() => {
    // Navigate to root path when finished
    navigate('/');
  });

  // When it's working in progress
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-gray-600">Redirecting...</div>
      </div>
    );
  }

  return null;
};
