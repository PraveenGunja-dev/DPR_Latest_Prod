import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface Project {
  ObjectId: number;
  Name: string;
  Location?: string;
  Status?: string;
  Progress?: number;
  PlanStart?: string;
  PlanEnd?: string;
  ProjectType?: string;
  appStatus?: string;
}

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  onSave: (projectId: number, data: {
    name: string;
    location: string;
    status: string;
    progress: number;
    planStart: string;
    planEnd: string;
    projectType: string;
    appStatus: string;
  }) => Promise<void>;
  loading: boolean;
}

export const EditProjectModal: React.FC<EditProjectModalProps> = ({
  isOpen,
  onClose,
  project,
  onSave,
  loading
}) => {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    status: 'planning',
    progress: 0,
    planStart: '',
    planEnd: '',
    projectType: 'solar',
    appStatus: 'live'
  });

  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (project) {
      const pName = project.Name || (project as any).name || '';
      const pLoc = project.Location || (project as any).location || '';
      const pStatus = project.Status || (project as any).status || 'planning';
      const pProgress = project.Progress || (project as any).progress || 0;
      const pPlanStart = project.PlanStart || (project as any).planStart || (project as any).PlannedStartDate;
      const pPlanEnd = project.PlanEnd || (project as any).planEnd || (project as any).PlannedFinishDate;
      const pType = project.ProjectType || (project as any).projectType || 'solar';

      setFormData({
        name: pName,
        location: pLoc,
        status: pStatus,
        progress: Number(pProgress),
        planStart: pPlanStart ? new Date(pPlanStart).toISOString().split('T')[0] : '',
        planEnd: pPlanEnd ? new Date(pPlanEnd).toISOString().split('T')[0] : '',
        projectType: pType,
        appStatus: project.appStatus || (project as any).appStatus || 'live'
      });
    }
  }, [project]);

  if (!isOpen || !project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pId = project.ObjectId || (project as any).id;
    if (pId) {
      await onSave(pId, formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md dark:bg-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">Edit Project</h2>
          <Button variant="ghost" onClick={onClose} className="dark:text-white">
            <span className="text-2xl">&times;</span>
          </Button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Project Type</label>
            <select
              className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
              value={formData.projectType}
              onChange={(e) => setFormData({ ...formData, projectType: e.target.value })}
              required
            >
              <option value="solar">Solar</option>
              <option value="wind">Wind</option>
              <option value="pss">PSS</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Project Name</label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600 opacity-70"
            />
            <p className="text-xs text-gray-500 mt-1">P6 Project names cannot be edited.</p>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Location</label>
            <Input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              disabled
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600 opacity-70"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Status</label>
            <select
              className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600 opacity-70"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              disabled
            >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on hold">On Hold</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Live/Hold Status</label>
            <select
              className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
              value={formData.appStatus}
              onChange={(e) => setFormData({ ...formData, appStatus: e.target.value })}
              required
            >
              <option value="live">Live</option>
              <option value="hold">On Hold</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">"Hold" projects are hidden from Supervisors and Site PMs.</p>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="outline" onClick={onClose} className="dark:border-gray-600 dark:text-gray-300">
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Project'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

