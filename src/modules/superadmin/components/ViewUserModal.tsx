import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, X } from "lucide-react";
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export const ViewUserModal = ({
  isOpen,
  onClose,
  user,
  projects,
  loading,
  error,
}: any) => {
  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-2xl overflow-hidden">

        {/* ================= COVER HEADER ================= */}
        <div className="relative h-40 bg-cover bg-center bg-gray-200 dark:bg-gray-700" style={{ backgroundImage: "url('/coverPhoto.png')" }}>

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
            <X className="h-5 w-5" />
          </Button>

          {/* Avatar */}
          <div className="absolute -bottom-8 left-6 h-20 w-20 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center border-2 border-white dark:border-gray-300">
            <div className="h-16 w-16 rounded-full bg-[#0B74B0] text-white flex items-center justify-center text-xl font-semibold">
              {user.Name?.charAt(0)}
            </div>
          </div>
        </div>

        {/* ================= USER HEADER ================= */}
        <div className="pt-12 px-6 pb-4 border-b bg-white dark:bg-gray-800">
          <h2 className="text-xl font-semibold dark:text-white">{user.Name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-300">{user.Email}</p>
        </div>

        {/* ================= BODY ================= */}
        <div className="p-6 bg-white dark:bg-gray-900">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <RefreshCw className="animate-spin mr-2" />
              Loading user details...
            </div>
          ) : error ? (
            <div className="text-center text-red-500">{error}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* User Information */}
              <div className="rounded-lg border bg-gray-50 p-5 dark:bg-gray-800 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase dark:text-gray-300">
                  User Information
                </h3>

                <InfoRow label="Role">
                  <Badge className="bg-[#BD3861]">
                    {user.Role}
                  </Badge>
                </InfoRow>

                <InfoRow label="Status">
                  <Badge
                    className={
                      user.IsActive !== false
                        ? "bg-green-600"
                        : "bg-gray-400"
                    }
                  >
                    {user.IsActive !== false ? "Active" : "Inactive"}
                  </Badge>
                </InfoRow>

                <InfoRow label="Created Date">
                  {new Date(user.CreatedAt).toLocaleDateString()}
                </InfoRow>
              </div>

              {/* Assigned Projects */}
              <div className="rounded-lg border bg-gray-50 p-5 dark:bg-gray-800 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase dark:text-gray-300">
                  Assigned Projects
                </h3>

                {projects?.length ? (
                  <div className="space-y-2">
                    {projects.map((project: any, index: number) => (
                      <div
                        key={index}
                        className="rounded-md bg-white px-4 py-3 shadow-sm hover:shadow-md transition dark:bg-gray-700"
                      >
                        <p className="font-medium dark:text-white">
                          {project.name || project.Name}
                        </p>
                        {project.role && (
                          <p className="text-xs text-gray-500 dark:text-gray-300">
                            Role: {project.role}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-300">
                    No projects assigned
                  </p>
                )}
              </div>
            </div>
          )}
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
