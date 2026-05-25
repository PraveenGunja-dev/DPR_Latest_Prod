import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import apiClient from '@/services/apiClient';
import { useAuth } from './AuthContext';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  timestamp: Date;
  read: boolean;
  userId?: number;
  projectId?: number;
  entryId?: number;
  sheetType?: string; // Add sheetType to identify which table to navigate to
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  getRecentNotifications: () => Notification[]; // Add this new function
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const savedNotifications = localStorage.getItem('notifications');
    if (savedNotifications) {
      try {
        const parsed = JSON.parse(savedNotifications);
        // Convert timestamp strings back to Date objects
        return parsed.map((notification: any) => ({
          ...notification,
          timestamp: typeof notification.timestamp === 'string' 
            ? new Date(notification.timestamp) 
            : notification.timestamp
        }));
      } catch (e) {
        console.error('Error parsing notifications from localStorage:', e);
        return [];
      }
    }
    return [];
  });

  // Return all fetched notifications (backend already limits to top 50)
  const getRecentNotifications = (): Notification[] => {
    return notifications;
  };

  const recentNotifications = getRecentNotifications();
  const unreadCount = recentNotifications.filter(notification => !notification.read).length;

  // Fetch notifications from backend
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const response = await apiClient.get('/notifications/');
      const backendNotifications = response.data.map((n: any) => ({
        ...n,
        id: String(n.id),
        timestamp: new Date(n.timestamp || n.created_at),
        projectId: n.project_id || n.projectId,
        entryId: n.entry_id || n.entryId,
        sheetType: n.sheet_type || n.sheetType
      }));
      setNotifications(backendNotifications);
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  }, [token]);

  // Initial fetch and polling
  useEffect(() => {
    if (token) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 60000); // Poll every 60 seconds
      return () => clearInterval(interval);
    }
  }, [token, fetchNotifications]);

  // Save notifications to localStorage as backup/cache
  useEffect(() => {
    if (notifications.length > 0) {
      localStorage.setItem('notifications', JSON.stringify(notifications));
    }
  }, [notifications]);

  const addNotification = async (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    // In a real app, this might be triggered by server-side events,
    // but we can still have a local helper if needed.
    const newNotification: Notification = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      read: false,
      ...notification
    };
    
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markAsRead = async (id: string) => {
    try {
      if (token) {
        await apiClient.post(`/notifications/${id}/read`);
      }
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === id ? { ...notification, read: true } : notification
        )
      );
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  const markAllAsRead = async () => {
    try {
      if (token) {
        await apiClient.post('/notifications/read-all');
      }
      setNotifications(prev => 
        prev.map(notification => ({ ...notification, read: true }))
      );
    } catch (e) {
      console.error('Failed to mark all notifications as read:', e);
    }
  };

  const clearNotifications = async () => {
    try {
      if (token) {
        await apiClient.delete('/notifications/clear');
      }
      setNotifications([]);
    } catch (e) {
      console.error('Failed to clear notifications:', e);
    }
  };

  return (
    <NotificationContext.Provider value={{ 
      notifications: recentNotifications, 
      unreadCount, 
      addNotification, 
      markAsRead, 
      markAllAsRead, 
      clearNotifications,
      getRecentNotifications
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};