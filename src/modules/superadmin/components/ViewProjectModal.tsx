import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface Project {
  ObjectId: number;
  Name: string;
  Location?: string;
  Status?: string;
  Progress?: number;
  PlanStart?: string;
  PlanEnd?: string;
  CreatedAt?: string;
}

interface User {
  ObjectId: number;
  Name: string;
  Email: string;
  Role: string;
}

interface ViewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  users?: User[];
  loading?: boolean;
  error?: string;
}

export const ViewProjectModal: React.FC<ViewProjectModalProps> = ({
  isOpen,
  onClose,
  project,
  users = [],
  loading = false,
  error = ''
}) => {
  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  if (!isOpen || !project) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-2xl overflow-hidden">

        {/* ================= COVER HEADER ================= */}
        <div 
          className="relative h-40 bg-cover bg-center bg-gray-200 dark:bg-gray-700"
          style={{ backgroundImage: 'url(/coverPhoto.webp)' }}
        >
          {/* Overlay for better text readability */}
          <div className="absolute inset-0 bg-black/30 dark:bg-black/50"></div>
          
          {/* Adani Logo */}
          <img
            src="/logo.png"
            alt="Adani"
            className="absolute top-4 left-6 h-8 z-10"
          />

          <Button
            variant="ghost"
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:bg-white/20 backdrop-blur-sm bg-white/20 rounded-full"
          >
            <span className="h-5 w-5">&times;</span>
          </Button>

          {/* Project Icon */}
          <div className="absolute -bottom-8 left-6 h-20 w-20 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center border-2 border-white dark:border-gray-300">
            <div className="h-16 w-16 rounded-full bg-[#0B74B0] text-white flex items-center justify-center text-xl font-semibold">
              {project.Name?.charAt(0)}
            </div>
          </div>
        </div>

        {/* ================= PROJECT HEADER ================= */}
        <div className="pt-12 px-6 pb-4 border-b bg-white dark:bg-gray-800">
          <h2 className="text-xl font-semibold dark:text-white">{project.Name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-300">{project.Location || 'No location specified'}</p>
        </div>

        {/* ================= BODY ================= */}
        <div className="p-6 bg-white dark:bg-gray-900">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Project Information */}
            <div className="rounded-lg border bg-gray-50 p-5 dark:bg-gray-800 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase dark:text-gray-300">
                Project Information
              </h3>

              <InfoRow label="Status">
                <Badge variant={
                  project.Status === 'active' ? 'default' :
                  project.Status === 'planning' ? 'secondary' : 'outline'
                }>
                  {project.Status}
                </Badge>
              </InfoRow>

              <InfoRow label="Progress">
                <div className="flex items-center gap-2">
                  <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-600">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${project.Progress || 0}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium dark:text-white">{project.Progress || 0}%</span>
                </div>
              </InfoRow>

              <InfoRow label="Created Date">
                {project.CreatedAt ? new Date(project.CreatedAt).toLocaleDateString() : 'N/A'}
              </InfoRow>
            </div>

            {/* Timeline */}
            <div className="rounded-lg border bg-gray-50 p-5 dark:bg-gray-800 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase dark:text-gray-300">
                Timeline
              </h3>

              <InfoRow label="Plan Start">
                {project.PlanStart ? new Date(project.PlanStart).toLocaleDateString() : 'N/A'}
              </InfoRow>

              <InfoRow label="Plan End">
                {project.PlanEnd ? new Date(project.PlanEnd).toLocaleDateString() : 'N/A'}
              </InfoRow>

              <InfoRow label="Duration">
                {project.PlanStart && project.PlanEnd ? (
                  `${Math.ceil((new Date(project.PlanEnd).getTime() - new Date(project.PlanStart).getTime()) / (1000 * 60 * 60 * 24))} days`
                ) : 'N/A'}
              </InfoRow>
            </div>

            {/* Assigned Users */}
            <div className="md:col-span-2 rounded-lg border bg-gray-50 p-5 dark:bg-gray-800 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase dark:text-gray-300">
                Assigned Users
              </h3>

              {loading ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin mr-2">Loading users...</div>
                </div>
              ) : error ? (
                <div className="text-center text-red-500">{error}</div>
              ) : users.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {users.map((user) => (
                    <div
                      key={user.ObjectId}
                      className="rounded-md bg-white px-4 py-3 shadow-sm hover:shadow-md transition dark:bg-gray-700"
                    >
                      <p className="font-medium dark:text-white">{user.Name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{user.Email}</p>
                      <Badge className="mt-2" variant={
                        user.Role === 'supervisor' ? 'default' :
                        user.Role === 'Site PM' ? 'secondary' :
                        user.Role === 'PMAG' ? 'destructive' : 'outline'
                      }>
                        {user.Role}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No users assigned to this project</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoRow = ({ label, children }: any) => (
  <div className="flex justify-between items-center mb-3 text-sm">
    <span className="text-gray-600 dark:text-gray-300">{label}</span>
    <span className="font-medium dark:text-white">{children}</span>
  </div>
);

