import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface User {
  ObjectId: number;
  Name: string;
  Email: string;
  Role: string;
  IsActive?: boolean;
}

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSave: (userId: number, data: { role: string; isActive: boolean }) => Promise<void>;
  loading: boolean;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  isOpen,
  onClose,
  user,
  onSave,
  loading
}) => {
  const [formData, setFormData] = useState({
    role: '',
    isActive: true
  });

  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (user) {
      setFormData({
        role: user.Role,
        isActive: user.IsActive !== false
      });
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(user.ObjectId, formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md dark:bg-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">Edit User</h2>
          <Button variant="ghost" onClick={onClose} className="dark:text-white">
            <span className="text-2xl">&times;</span>
          </Button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Name</label>
            <Input
              type="text"
              value={user.Name}
              disabled
              className="bg-gray-100 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Email</label>
            <Input
              type="email"
              value={user.Email}
              disabled
              className="bg-gray-100 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Role</label>
            <select
              className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
              value={formData.role}
              onChange={(e) => setFormData({...formData, role: e.target.value})}
              required
            >
              <option value="supervisor">Supervisor</option>
              <option value="Site PM">Site PM</option>
              <option value="PMAG">PMAG</option>
              <option value="Super Admin">Super Admin</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Status</label>
            <select
              className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
              value={formData.isActive ? 'active' : 'inactive'}
              onChange={(e) => setFormData({...formData, isActive: e.target.value === 'active'})}
              required
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="dark:border-gray-600 dark:text-gray-300">
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update User'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

