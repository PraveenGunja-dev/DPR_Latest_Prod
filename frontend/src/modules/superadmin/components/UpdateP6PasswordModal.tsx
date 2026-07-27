import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface UpdateP6PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (p6Id: string, newPassword: string) => Promise<void>;
  loading: boolean;
}

export const UpdateP6PasswordModal: React.FC<UpdateP6PasswordModalProps> = ({
  isOpen,
  onClose,
  onSave,
  loading
}) => {
  const [p6Id, setP6Id] = useState('agel.forecasting@adani.com');
  const [newPassword, setNewPassword] = useState('');

  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim() || !p6Id.trim()) return;
    await onSave(p6Id, newPassword);
    setNewPassword('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md dark:bg-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">Update P6 Password</h2>
          <Button variant="ghost" onClick={onClose} className="dark:text-white">
            <span className="text-2xl">&times;</span>
          </Button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">
              Oracle P6 Username / ID
            </label>
            <Input
              type="text"
              value={p6Id}
              onChange={(e) => setP6Id(e.target.value)}
              placeholder="Enter P6 Username"
              required
              className="dark:bg-gray-700 dark:text-white mb-4"
            />
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">
              New Oracle P6 Password
            </label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              className="dark:bg-gray-700 dark:text-white"
            />
            <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">
              This will update the .env variables directly and reset the 45-day rotation timer.
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="outline" onClick={onClose} className="dark:border-gray-600 dark:text-gray-300">
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !newPassword.trim()}>
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
