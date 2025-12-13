import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface User {
  ObjectId: number;
  Name: string;
}

interface Project {
  ObjectId: number;
  Name: string;
  Location?: string;
  id?: number;
  name?: string;
}

interface AssignProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  assignedProjects: Project[];
  allProjects: Project[];
  loading: boolean;
  error: string;
  onAssign: (userId: number, projectIds: number[]) => Promise<void>;
}

export const AssignProjectModal: React.FC<AssignProjectModalProps> = ({
  isOpen,
  onClose,
  user,
  assignedProjects,
  allProjects,
  loading,
  error,
  onAssign
}) => {
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedProjects([]);
    }
  }, [isOpen]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProjects.length === 0) return;
    
    await onAssign(user.ObjectId, selectedProjects);
    setSelectedProjects([]);
  };

  // Get currently assigned project IDs
  const assignedProjectIds = assignedProjects.map(p => p.id || p.ObjectId);

  // Filter out already assigned projects
  const availableProjects = allProjects.filter(p => 
    !assignedProjectIds.includes(p.ObjectId)
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Assign Projects to {user.Name}</h2>
          <Button variant="ghost" onClick={onClose}>
            <span className="text-2xl">&times;</span>
          </Button>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}
        
        <div className="mb-4">
          <h3 className="text-sm font-medium mb-2">Currently Assigned Projects:</h3>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Loading projects...</span>
            </div>
          ) : assignedProjects.length > 0 ? (
            <div className="space-y-1 mb-4">
              {assignedProjects.map((project: any, index: number) => (
                <div key={project.id || project.ObjectId || index} className="p-2 bg-gray-50 rounded text-sm">
                  {project.name || project.Name}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm mb-4">No projects currently assigned</p>
          )}
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Select Projects to Assign:</label>
            <div className="max-h-64 overflow-y-auto border rounded p-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-500">Loading projects...</span>
                </div>
              ) : availableProjects.length > 0 ? (
                availableProjects.map((project: any) => (
                  <div key={project.ObjectId} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                    <input
                      type="checkbox"
                      id={`project-${project.ObjectId}`}
                      checked={selectedProjects.includes(project.ObjectId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProjects([...selectedProjects, project.ObjectId]);
                        } else {
                          setSelectedProjects(selectedProjects.filter(id => id !== project.ObjectId));
                        }
                      }}
                      className="rounded"
                    />
                    <label htmlFor={`project-${project.ObjectId}`} className="flex-1 cursor-pointer">
                      {project.Name} {project.Location && `- ${project.Location}`}
                    </label>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No available projects</p>
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || selectedProjects.length === 0}>
              {loading ? 'Assigning...' : 'Assign Projects'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

