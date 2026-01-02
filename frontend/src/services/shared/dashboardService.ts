// Shared service functions for dashboard components
import { toast } from "sonner";

// Function to format date as YYYY-MM-DD
export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "Not set";
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
};

// Generic error handler
export const handleApiError = (error: any, defaultMessage: string = "An error occurred") => {
  console.error('API Error:', error);
  const errorMessage = error.response?.data?.message || error.message || defaultMessage;
  toast.error(errorMessage);
  throw new Error(errorMessage);
};

// Generic success handler
export const handleApiSuccess = (message: string) => {
  toast.success(message);
};

// Function to get today and yesterday dates in local timezone (IST for India)
export const getTodayAndYesterday = () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Use toLocaleDateString with 'en-CA' locale to get YYYY-MM-DD format in local timezone
  return {
    today: today.toLocaleDateString('en-CA'),
    yesterday: yesterday.toLocaleDateString('en-CA')
  };
};

// Function to check if an entry is locked (submitted within the last 2 days)
export const isEntryLocked = (entry: any): boolean => {
  if (!entry || !entry.status || !entry.submitted_at) {
    return false;
  }

  // Only submitted entries can be locked
  if (entry.status !== 'submitted_to_pm') {
    return false;
  }

  // Check if submitted within the last 2 days
  const submittedDate = new Date(entry.submitted_at);
  const now = new Date();
  const timeDiff = now.getTime() - submittedDate.getTime();
  const daysDiff = timeDiff / (1000 * 3600 * 24);

  // Lock for 2 days
  return daysDiff < 2;
};