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
    planEnd: ''
  });

  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.Name,
        location: project.Location || '',
        status: project.Status || 'planning',
        progress: project.Progress || 0,
        planStart: project.PlanStart ? new Date(project.PlanStart).toISOString().split('T')[0] : '',
        planEnd: project.PlanEnd ? new Date(project.PlanEnd).toISOString().split('T')[0] : ''
      });
    }
  }, [project]);

  if (!isOpen || !project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(project.ObjectId, formData);
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
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Project Name</label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Location</label>
            <Input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({...formData, location: e.target.value})}
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Status</label>
            <select
              className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
              required
            >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on hold">On Hold</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Progress (%)</label>
            <Input
              type="number"
              min="0"
              max="100"
              value={formData.progress}
              onChange={(e) => setFormData({...formData, progress: parseInt(e.target.value) || 0})}
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Plan Start Date</label>
            <Input
              type="date"
              value={formData.planStart}
              onChange={(e) => setFormData({...formData, planStart: e.target.value})}
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Plan End Date</label>
            <Input
              type="date"
              value={formData.planEnd}
              onChange={(e) => setFormData({...formData, planEnd: e.target.value})}
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
          <div className="flex justify-end gap-2">
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

