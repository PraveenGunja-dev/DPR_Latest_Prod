import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string | string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole
}) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const userRole = (user?.Role || user?.role || "").toString().trim().toLowerCase();

  // If user has pending_approval role, redirect to access-pending page
  if (userRole === 'pending_approval') {
    return <Navigate to="/access-pending" replace />;
  }

  // If a specific role is required and user doesn't have it, redirect to projects
  if (requiredRole && userRole) {
    let isAllowed = false;
    if (Array.isArray(requiredRole)) {
      isAllowed = requiredRole.some(r => r.trim().toLowerCase() === userRole);
    } else {
      isAllowed = requiredRole.trim().toLowerCase() === userRole;
    }

    if (!isAllowed) {
      return <Navigate to="/projects" replace />;
    }
  }

  return <>{children}</>;
};