import React from 'react';

interface StatusChipProps {
  status: string;
}

export const StatusChip = ({ status }: StatusChipProps) => {
  const getStatusStyles = () => {
    switch (status.toLowerCase()) {
      case 'draft':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'submitted':
      case 'submitted_to_pm':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'approved':
      case 'approved_by_pm':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'rejected':
      case 'rejected_by_pm':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'pushed':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  // Format status for display
  const formatStatus = (status: string) => {
    switch (status.toLowerCase()) {
      case 'submitted_to_pm':
        return 'Submitted';
      case 'approved_by_pm':
        return 'Approved';
      case 'rejected_by_pm':
        return 'Rejected';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusStyles()}`}>
      {formatStatus(status)}
    </span>
  );
};