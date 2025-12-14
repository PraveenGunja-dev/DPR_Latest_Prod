import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Users, 
  FolderPlus, 
  Settings, 
  FileText, 
  BarChart3, 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  Trash2, 
  Plus,
  RefreshCw,
  Download,
  Upload,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { ChartsSection } from '@/modules/charts';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import axios from 'axios';
import {
  ViewUserModal,
  EditUserModal,
  AssignProjectModal,
  ViewProjectModal,
  EditProjectModal
} from './components';

// Define color palette for charts
const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))"];
// Type definitions
interface User {
  ObjectId: number;
  Name: string;
  Email: string;
  Role: string;
  CreatedAt: string;
  IsActive?: boolean;
}

interface Project {
  id: number;
  name: string;
  role: string;
}

interface Analytics {
  totalSheets?: number;
  approvedSheets?: number;
  pendingSheets?: number;
  lastSubmission?: string;
}

interface Sheet {
  id: string;
  date: string;
  status: string;
  project: string;
}

interface UserDetails {
  projects: Project[];
  analytics: Analytics;
  submittedSheets: Sheet[];
}

interface SystemLog {
  id: number;
  action_type: string;
  performed_by: number;
  performed_by_name: string;
  target_entity: string;
  remarks: string;
  timestamp: string;
}

// Create axios instance with base URL
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002',
  headers: {
    'Content-Type': 'application/json',
  },
});

const SuperAdminDashboard = () => {
  const { user, token } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'users');
  const [searchTerm, setSearchTerm] = useState('');
  const [usersData, setUsersData] = useState<User[]>([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');
  const [projectsData, setProjectsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Set up axios default headers
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, [token]);

  // Fetch users data
  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/super-admin/users');
      setUsersData(response.data);
    } catch (err) {
      setError('Failed to fetch users');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch all projects for assignment
  const fetchAllProjects = async () => {
    try {
      const response = await api.get('/api/super-admin/projects');
      setAllProjects(response.data || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setAllProjects([]);
    }
  };

  // Fetch projects data
  const fetchProjects = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/super-admin/projects');
      setProjectsData(response.data);
    } catch (err) {
      setError('Failed to fetch projects');
      console.error('Error fetching projects:', err);
    } finally {
      setLoading(false);
    }
  };

  // State for role management
  const [rolesData, setRolesData] = useState([]);
    const [editingRole, setEditingRole] = useState<any>(null);
    const [showEditRoleModal, setShowEditRoleModal] = useState(false);
    const [editRoleForm, setEditRoleForm] = useState({
      name: '',
      permissions: ''
    });
  
  // State for workflow overrides
  const [workflowOverrides, setWorkflowOverrides] = useState([]);
  
  // State for system logs
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  
  // State for logs filters
  const [timeFilter, setTimeFilter] = useState('all'); // all, 10min, 1hr, 24hr, 7days
  const [actionFilter, setActionFilter] = useState('all'); // all, submission, approval, rejection, pushed
  
  // State for analytics data
  const [analyticsData, setAnalyticsData] = useState({
    totalUsers: 0,
    totalProjects: 0,
    totalSheets: 0,
    activeUsers: 0
  });
  
  // State for chart data
  const [userGrowthData, setUserGrowthData] = useState([]);
  const [projectStatusData, setProjectStatusData] = useState([]);
  const [sheetSubmissionData, setSheetSubmissionData] = useState([]);
  const [roleDistributionData, setRoleDistributionData] = useState([]);
  const [monthlyActivityData, setMonthlyActivityData] = useState([]);
  
  // State for create user form
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'supervisor'
  });
  
  // State for view user modal
  const [showViewUserModal, setShowViewUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [viewUserLoading, setViewUserLoading] = useState(false);
  const [viewUserError, setViewUserError] = useState('');
  
  // State for edit user modal
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // State for assign project modal
  const [showAssignProjectModal, setShowAssignProjectModal] = useState(false);
  const [assigningToUser, setAssigningToUser] = useState<User | null>(null);
  const [userAssignedProjects, setUserAssignedProjects] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [assignProjectLoading, setAssignProjectLoading] = useState(false);
  const [assignProjectError, setAssignProjectError] = useState('');
  
  // State for view/edit project modals
  const [showViewProjectModal, setShowViewProjectModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [editProjectForm, setEditProjectForm] = useState({
    name: '',
    location: '',
    status: '',
    progress: 0,
    planStart: '',
    planEnd: ''
  });
  
  // State for create project form
  const [showCreateProjectForm, setShowCreateProjectForm] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    location: '',
    status: 'planning',
    progress: 0
  });
  
  // Fetch roles data
  const fetchRoles = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/super-admin/roles');
      setRolesData(response.data);
    } catch (err) {
      setError('Failed to fetch roles');
      console.error('Error fetching roles:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch workflow overrides
  const fetchWorkflowOverrides = async () => {
    setLoading(true);
    setError('');
    try {
      // In a real implementation, this would fetch from an API
      // For now, we'll use static data
      const overrides = [
        { id: 1, sheetId: 'SHT-001', projectName: 'Project Alpha', submittedBy: 'John Doe', status: 'Approved by PM', overrideAction: 'Reopen for Review' },
        { id: 2, sheetId: 'SHT-002', projectName: 'Project Beta', submittedBy: 'Jane Smith', status: 'Rejected by PMAG', overrideAction: 'Approve' },
      ];
      setWorkflowOverrides(overrides);
    } catch (err) {
      setError('Failed to fetch workflow overrides');
      console.error('Error fetching workflow overrides:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch system logs
  const fetchSystemLogs = async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      let url = '/api/super-admin/logs';
      const params = new URLSearchParams();
      
      // Add action type filter if not 'all'
      if (actionFilter !== 'all') {
        const actionTypeMap: Record<string, string> = {
          'submission': 'SHEET_SUBMITTED',
          'approval': 'SHEET_APPROVED',
          'rejection': 'SHEET_REJECTED',
          'pushed': 'SHEET_PUSHED'
        };
        params.append('actionType', actionTypeMap[actionFilter] || actionFilter.toUpperCase());
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await api.get(url);
      let logs = response.data || [];
      
      // Apply time filter on client side since API doesn't support it yet
      if (timeFilter !== 'all') {
        const now = new Date();
        const filterTime = new Date();
        
        switch (timeFilter) {
          case '10min':
            filterTime.setMinutes(now.getMinutes() - 10);
            break;
          case '1hr':
            filterTime.setHours(now.getHours() - 1);
            break;
          case '24hr':
            filterTime.setDate(now.getDate() - 1);
            break;
          case '7days':
            filterTime.setDate(now.getDate() - 7);
            break;
          default:
            break;
        }
        
        logs = logs.filter((log: SystemLog) => {
          const logTime = new Date(log.timestamp);
          return logTime >= filterTime;
        });
      }
      
      setSystemLogs(logs);
    } catch (err) {
      setLogsError('Failed to fetch system logs');
      console.error('Error fetching system logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };
  
  // Export logs to PDF
  const exportLogsToPDF = () => {
    // Import jsPDF and autoTable dynamically
    Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]).then(([jsPDF]) => {
      const doc = new jsPDF.jsPDF();
      
      // Add title
      doc.setFontSize(18);
      doc.text('System Logs Report', 14, 20);
      
      // Add filter information
      doc.setFontSize(12);
      doc.text(`Time Filter: ${timeFilter}`, 14, 30);
      doc.text(`Action Filter: ${actionFilter}`, 14, 37);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 44);
      
      // Prepare data for table
      const filteredLogs = systemLogs.filter((log: SystemLog) => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
          log.performed_by_name?.toLowerCase().includes(search) ||
          log.action_type?.toLowerCase().includes(search) ||
          log.target_entity?.toLowerCase().includes(search) ||
          log.remarks?.toLowerCase().includes(search)
        );
      });
      
      // Add table
      const headers = [['Timestamp', 'Performed By', 'Action Type', 'Target Entity', 'Details']];
      const data = filteredLogs.map((log: SystemLog) => [
        new Date(log.timestamp).toLocaleString(),
        log.performed_by_name || 'System',
        log.action_type || 'Unknown',
        log.target_entity || 'N/A',
        log.remarks || 'N/A'
      ]);
      
      // @ts-ignore - AutoTable types might not be available
      doc.autoTable({
        head: headers,
        body: data,
        startY: 50,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [22, 160, 133] },
        alternateRowStyles: { fillColor: [245, 245, 245] }
      });
      
      // Save the PDF
      doc.save('system-logs-report.pdf');
    }).catch((error) => {
      console.error('Error loading jsPDF:', error);
      alert('Failed to export PDF. Please try again.');
    });
  };

  // Export logs to Excel
  const exportLogsToExcel = () => {
    // Import xlsx dynamically
    import('xlsx').then((XLSX) => {
      // Prepare data for export
      const filteredLogs = systemLogs.filter((log: SystemLog) => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
          log.performed_by_name?.toLowerCase().includes(search) ||
          log.action_type?.toLowerCase().includes(search) ||
          log.target_entity?.toLowerCase().includes(search) ||
          log.remarks?.toLowerCase().includes(search)
        );
      });
      
      // Transform data for Excel
      const data = filteredLogs.map((log: SystemLog) => ({
        Timestamp: new Date(log.timestamp).toLocaleString(),
        'Performed By': log.performed_by_name || 'System',
        'Action Type': log.action_type || 'Unknown',
        'Target Entity': log.target_entity || 'N/A',
        Details: log.remarks || 'N/A'
      }));
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(data);
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'System Logs');
      
      // Save the file
      XLSX.writeFile(wb, 'system-logs-report.xlsx');
    }).catch((error) => {
      console.error('Error loading xlsx:', error);
      alert('Failed to export Excel. Please try again.');
    });
  };

  // Generate mock analytics data
  const generateAnalyticsData = () => {
    // Mock analytics data
    setAnalyticsData({
      totalUsers: usersData.length,
      totalProjects: projectsData.length,
      totalSheets: 1247, // Mock data
      activeUsers: usersData.filter(user => user.IsActive !== false).length
    });
    
    // Mock user growth data (last 6 months)
    setUserGrowthData([
      { month: 'Jan', users: 12 },
      { month: 'Feb', users: 19 },
      { month: 'Mar', users: 15 },
      { month: 'Apr', users: 22 },
      { month: 'May', users: 18 },
      { month: 'Jun', users: 25 }
    ]);
    
    // Mock project status data
    setProjectStatusData([
      { name: 'Planning', value: projectsData.filter(p => p.Status === 'planning').length },
      { name: 'Active', value: projectsData.filter(p => p.Status === 'active').length },
      { name: 'Completed', value: projectsData.filter(p => p.Status === 'completed').length },
      { name: 'On Hold', value: projectsData.filter(p => p.Status === 'on hold').length }
    ]);
    
    // Mock sheet submission data (last 6 months)
    setSheetSubmissionData([
      { month: 'Jan', submissions: 120 },
      { month: 'Feb', submissions: 145 },
      { month: 'Mar', submissions: 138 },
      { month: 'Apr', submissions: 182 },
      { month: 'May', submissions: 165 },
      { month: 'Jun', submissions: 205 }
    ]);
    
    // Mock role distribution data
    setRoleDistributionData([
      { name: 'Supervisor', value: usersData.filter(u => u.Role === 'supervisor').length },
      { name: 'Site PM', value: usersData.filter(u => u.Role === 'Site PM').length },
      { name: 'PMAG', value: usersData.filter(u => u.Role === 'PMAG').length },
      { name: 'Super Admin', value: usersData.filter(u => u.Role === 'Super Admin').length }
    ]);
    
    // Mock monthly activity data
    setMonthlyActivityData([
      { month: 'Jan', activity: 45 },
      { month: 'Feb', activity: 52 },
      { month: 'Mar', activity: 48 },
      { month: 'Apr', activity: 78 },
      { month: 'May', activity: 65 },
      { month: 'Jun', activity: 80 }
    ]);
  };
  
  // Fetch data when component mounts or tab changes
  useEffect(() => {
    if (!token) return;
    
    switch (activeTab) {
      case 'users':
        fetchUsers();
        break;
      case 'projects':
        fetchProjects();
        break;
      case 'roles':
        fetchRoles();
        break;
      case 'workflow':
        fetchWorkflowOverrides();
        break;
      case 'logs':
        fetchSystemLogs();
        break;
      default:
        break;
    }
  }, [activeTab, token]);
  
  // Fetch users when filters change
  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    }
  }, [roleFilter, statusFilter, activeTab]);

  // Fetch logs when filters change
  useEffect(() => {
    if (activeTab === 'logs') {
      fetchSystemLogs();
    }
  }, [timeFilter, actionFilter, searchTerm, activeTab]);

  // Generate analytics data when users or projects data changes
  useEffect(() => {
    if (usersData.length > 0 || projectsData.length > 0) {
      generateAnalyticsData();
    }
  }, [usersData, projectsData]);

  const handleCreateUser = () => {
    setShowCreateUserForm(true);
  };
  
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await api.post('/api/super-admin/users', newUser);
      setShowCreateUserForm(false);
      setNewUser({ name: '', email: '', password: '', role: 'supervisor' });
      fetchUsers(); // Refresh the users list
    } catch (err) {
      setError('Failed to create user');
      console.error('Error creating user:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = () => {
    setShowCreateProjectForm(true);
  };
  
  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await api.post('/api/super-admin/projects', newProject);
      setShowCreateProjectForm(false);
      setNewProject({ name: '', location: '', status: 'planning', progress: 0 });
      fetchProjects(); // Refresh the projects list
    } catch (err) {
      setError('Failed to create project');
      console.error('Error creating project:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (userId: number) => {
    const user = usersData.find(u => u.ObjectId === userId);
    if (user) {
      setEditingUser(user);
      setShowEditUserModal(true);
    }
  };
  
  const handleEditRole = (role: any) => {
    setEditingRole(role);
    setEditRoleForm({
      name: role.name,
      permissions: role.permissions
    });
    setShowEditRoleModal(true);
  };
  
  const handleEditRoleSave = async (roleId: number, data: { name: string; permissions: string }) => {
    console.log('Updating role:', roleId, data);
    // In a real implementation, this would call the API to update the role
    // For now, we'll just update the local state
    
    const updatedRoles = rolesData.map((role: any) => 
      role.id === roleId ? { ...role, ...data } : role
    );
    
    setRolesData(updatedRoles);
    setShowEditRoleModal(false);
    setEditingRole(null);
    
    setTimeout(() => {
      alert('Role updated successfully!');
    }, 100);
  };
  
  const handleEditRoleCancel = () => {
    setShowEditRoleModal(false);
    setEditingRole(null);
  };
  
  const handleEditRoleFormChange = (field: string, value: string) => {
    setEditRoleForm(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  const handleEditUserSave = async (userId: number, data: { role: string; isActive: boolean }) => {
    console.log('Updating user:', userId, data);
    setLoading(true);
    setError('');
    
    try {
      const response = await api.put(`/api/super-admin/users/${userId}`, data);
      console.log('User updated successfully:', response.data);
      
      setShowEditUserModal(false);
      setEditingUser(null);
      await fetchUsers();
      
      setTimeout(() => {
        alert('User updated successfully!');
      }, 100);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Failed to update user';
      setError(errorMsg);
      console.error('Error updating user:', err);
      throw err; // Re-throw to let modal handle it
    } finally {
      setLoading(false);
    }
  };

  const handleAssignProject = async (userId: number) => {
    console.log('Assign project clicked for user:', userId);
    const user = usersData.find(u => u.ObjectId === userId);
    if (!user) {
      setError('User not found');
      return;
    }
    
    setAssigningToUser(user);
    setUserAssignedProjects([]);
    setAllProjects([]);
    setAssignProjectLoading(true);
    setAssignProjectError('');
    setShowAssignProjectModal(true);
    
    try {
      const [projectsResponse, allProjectsResponse] = await Promise.all([
        api.get(`/api/super-admin/users/${userId}/projects`),
        api.get('/api/super-admin/projects')
      ]);
      
      setUserAssignedProjects(projectsResponse.data || []);
      setAllProjects(allProjectsResponse.data || []);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Failed to fetch project data';
      setAssignProjectError(errorMsg);
      console.error('Error fetching projects:', err);
    } finally {
      setAssignProjectLoading(false);
    }
  };
  
  const handleAssignProjects = async (userId: number, projectIds: number[]) => {
    setAssignProjectLoading(true);
    setAssignProjectError('');
    
    try {
      const currentProjectIds = userAssignedProjects.map(p => p.id || p.ObjectId);
      const newProjectIds = projectIds.filter(id => !currentProjectIds.includes(id));
      
      if (newProjectIds.length === 0) {
        setAssignProjectError('All selected projects are already assigned to this user');
        setAssignProjectLoading(false);
        return;
      }
      
      const assignmentPromises = newProjectIds.map(projectId => 
        api.post('/api/super-admin/users/assign-project', {
          userId: userId,
          projectId: projectId
        })
      );
      
      await Promise.all(assignmentPromises);
      
      setShowAssignProjectModal(false);
      setAssigningToUser(null);
      await fetchUsers();
      
      setTimeout(() => {
        alert(`Successfully assigned ${newProjectIds.length} project(s)!`);
      }, 100);
    } catch (err: any) {
      setAssignProjectError(err.response?.data?.message || 'Failed to assign projects');
      console.error('Error assigning projects:', err);
      throw err;
    } finally {
      setAssignProjectLoading(false);
    }
  };

  const handleViewUser = async (userId: number) => {
    console.log('View user clicked:', userId);
    setViewUserLoading(true);
    setViewUserError('');
    setShowViewUserModal(true);
    
    try {
      const [userResponse, projectsResponse] = await Promise.all([
        api.get(`/api/super-admin/users/${userId}`),
        api.get(`/api/super-admin/users/${userId}/projects`)
      ]);
      
      const userData = userResponse.data;
      const projects = projectsResponse.data || [];
      
      setUserProjects(projects);
      setSelectedUser({
        ObjectId: userData.ObjectId,
        Name: userData.Name,
        Email: userData.Email,
        Role: userData.Role,
        CreatedAt: userData.CreatedAt,
        IsActive: userData.IsActive !== false
      });
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Failed to fetch user details';
      setViewUserError(errorMsg);
      console.error('Error fetching user details:', err);
    } finally {
      setViewUserLoading(false);
    }
  };
  
  const handleCloseViewUserModal = () => {
    setShowViewUserModal(false);
    setSelectedUser(null);
    setUserProjects([]);
    setViewUserError('');
  };

  // Reset state when location changes
  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
  }, [location.state?.activeTab]);
  
  // Reset filters when switching tabs
  useEffect(() => {
    if (activeTab !== 'users') {
      setRoleFilter('all');
      setStatusFilter('all');
      setSearchTerm('');
    }
  }, [activeTab]);
  
  return (
    <div className="min-h-screen bg-background">
      <Navbar userName={user?.Name || "Super Admin"} userRole="Super Admin" />
      
      {/* Create User Modal */}
      {showCreateUserForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New User</h2>
            <form onSubmit={handleCreateUserSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Name</label>
                <Input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Password</label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  className="w-full p-2 border rounded"
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                >
                  <option value="supervisor">Supervisor</option>
                  <option value="Site PM">Site PM</option>
                  <option value="PMAG">PMAG</option>
                  <option value="Super Admin">Super Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateUserForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Creating...' : 'Create User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Create Project Modal */}
      {showCreateProjectForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New Project</h2>
            <form onSubmit={handleCreateProjectSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Project Name</label>
                <Input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Location</label>
                <Input
                  type="text"
                  value={newProject.location}
                  onChange={(e) => setNewProject({...newProject, location: e.target.value})}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  className="w-full p-2 border rounded"
                  value={newProject.status}
                  onChange={(e) => setNewProject({...newProject, status: e.target.value})}
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="on hold">On Hold</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Progress (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newProject.progress}
                  onChange={(e) => setNewProject({...newProject, progress: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateProjectForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* View User Modal */}
      <ViewUserModal
        isOpen={showViewUserModal}
        onClose={handleCloseViewUserModal}
        user={selectedUser}
        projects={userProjects}
        loading={viewUserLoading}
        error={viewUserError}
      />
      
      {/* Edit User Modal */}
      <EditUserModal
        isOpen={showEditUserModal}
        onClose={() => {
          setShowEditUserModal(false);
          setEditingUser(null);
        }}
        user={editingUser}
        onSave={handleEditUserSave}
        loading={loading}
      />
      
      {/* Assign Project Modal */}
      <AssignProjectModal
        isOpen={showAssignProjectModal}
        onClose={() => {
          setShowAssignProjectModal(false);
          setAssigningToUser(null);
          setAssignProjectError('');
        }}
        user={assigningToUser}
        assignedProjects={userAssignedProjects}
        allProjects={allProjects}
        loading={assignProjectLoading}
        error={assignProjectError}
        onAssign={handleAssignProjects}
      />
      
      {/* Edit Role Modal */}
      {showEditRoleModal && editingRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Edit Role</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleEditRoleSave(editingRole.id, editRoleForm);
            }}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Role Name</label>
                <Input
                  type="text"
                  value={editRoleForm.name}
                  onChange={(e) => handleEditRoleFormChange('name', e.target.value)}
                  required
                  disabled
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Permissions</label>
                <textarea
                  className="w-full p-2 border rounded"
                  value={editRoleForm.permissions}
                  onChange={(e) => handleEditRoleFormChange('permissions', e.target.value)}
                  rows={4}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleEditRoleCancel}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div>
              <motion.h1 
                className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                Super Admin Dashboard
              </motion.h1>
              <motion.p 
                className="text-muted-foreground"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                Full system administration and oversight
              </motion.p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleCreateUser} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create User
              </Button>
              <Button onClick={handleCreateProject} variant="outline" className="flex items-center gap-2">
                <FolderPlus className="w-4 h-4" />
                New Project
              </Button>
            </div>
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="projects" className="flex items-center gap-2">
              <FolderPlus className="w-4 h-4" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Role Management
            </TabsTrigger>
            <TabsTrigger value="workflow" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Workflow Overrides
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              System Logs
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage all system users and their roles</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        <SelectItem value="supervisor">Supervisor</SelectItem>
                        <SelectItem value="Site PM">Site PM</SelectItem>
                        <SelectItem value="PMAG">PMAG</SelectItem>
                        <SelectItem value="Super Admin">Super Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={fetchUsers}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </Button>
                  </div>
                </div>
                
                {loading ? (
                  <div className="flex justify-center items-center h-32">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    <span className="ml-2">Loading users...</span>
                  </div>
                ) : error ? (
                  <div className="flex justify-center items-center h-32 text-red-500">
                    <span>Error: {error}</span>
                  </div>
                ) : usersData.length === 0 ? (
                  <div className="flex justify-center items-center h-32">
                    <span>No users found</span>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created At</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usersData
                          .filter((user) => {
                            // Apply search filter
                            if (searchTerm) {
                              const search = searchTerm.toLowerCase();
                              if (!(
                                user.Name.toLowerCase().includes(search) ||
                                user.Email.toLowerCase().includes(search) ||
                                user.Role.toLowerCase().includes(search)
                              )) {
                                return false;
                              }
                            }
                            
                            // Apply role filter
                            if (roleFilter !== 'all' && user.Role !== roleFilter) {
                              return false;
                            }
                            
                            // Apply status filter
                            if (statusFilter !== 'all') {
                              const isActive = user.IsActive !== false;
                              if (statusFilter === 'active' && !isActive) return false;
                              if (statusFilter === 'inactive' && isActive) return false;
                            }
                            
                            return true;
                          })
                          .map((user) => (
                          <TableRow key={user.ObjectId}>
                            <TableCell className="font-medium">{user.Name}</TableCell>
                            <TableCell>{user.Email}</TableCell>
                            <TableCell>
                              <Badge variant={
                                user.Role === 'supervisor' ? 'default' :
                                user.Role === 'Site PM' ? 'secondary' :
                                user.Role === 'PMAG' ? 'destructive' : 'outline'
                              }>
                                {user.Role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.IsActive !== false ? 'default' : 'secondary'}>
                                {user.IsActive !== false ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(user.CreatedAt).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewUser(user.ObjectId);
                                  }}
                                  title="View User"
                                  className="hover:bg-gray-100 "
                                >
                                  <Eye className="w-4 h-4 hover:text-blue-500" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditUser(user.ObjectId);
                                  }}
                                  title="Edit User"
                                  className="hover:bg-gray-100"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAssignProject(user.ObjectId);
                                  }}
                                  title="Assign Project"
                                  className="hover:bg-gray-100"
                                >
                                  <FolderPlus className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Project Management</CardTitle>
                <CardDescription>Manage all projects in the system</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search projects..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Select value={projectStatusFilter} onValueChange={setProjectStatusFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={fetchProjects}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </Button>
                  </div>
                </div>
                
                {loading ? (
                  <div className="flex justify-center items-center h-32">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    <span className="ml-2">Loading projects...</span>
                  </div>
                ) : error ? (
                  <div className="flex justify-center items-center h-32 text-red-500">
                    <span>Error: {error}</span>
                  </div>
                ) : projectsData.length === 0 ? (
                  <div className="flex justify-center items-center h-32">
                    <span>No projects found</span>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project Name</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projectsData
                          .filter((project) => {
                            // Apply search filter
                            if (searchTerm) {
                              const search = searchTerm.toLowerCase();
                              if (!(
                                project.Name.toLowerCase().includes(search) ||
                                (project.Location && project.Location.toLowerCase().includes(search))
                              )) {
                                return false;
                              }
                            }
                            
                            // Apply status filter
                            if (projectStatusFilter !== 'all' && project.Status !== projectStatusFilter) {
                              return false;
                            }
                            
                            return true;
                          })
                          .map((project) => (
                          <TableRow key={project.ObjectId}>
                            <TableCell className="font-medium">{project.Name}</TableCell>
                            <TableCell>{project.Location || 'N/A'}</TableCell>
                            <TableCell>
                              <Badge variant={
                                project.Status === 'active' ? 'default' :
                                project.Status === 'planning' ? 'secondary' : 'outline'
                              }>
                                {project.Status}
                              </Badge>
                            </TableCell>
                            <TableCell>{project.Progress || 0}%</TableCell>
                            <TableCell>{project.PlanStart ? new Date(project.PlanStart).toLocaleDateString() : 'N/A'}</TableCell>
                            <TableCell>{project.PlanEnd ? new Date(project.PlanEnd).toLocaleDateString() : 'N/A'}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedProject(project);
                                    setShowViewProjectModal(true);
                                  }}
                                  title="View Project"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedProject(project);
                                    setEditProjectForm({
                                      name: project.Name,
                                      location: project.Location || '',
                                      status: project.Status || 'planning',
                                      progress: project.Progress || 0,
                                      planStart: project.PlanStart ? new Date(project.PlanStart).toISOString().split('T')[0] : '',
                                      planEnd: project.PlanEnd ? new Date(project.PlanEnd).toISOString().split('T')[0] : ''
                                    });
                                    setShowEditProjectModal(true);
                                  }}
                                  title="Edit Project"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Roles Tab */}
          <TabsContent value="roles" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Role Management</CardTitle>
                <CardDescription>Configure roles and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Role Name</TableHead>
                        <TableHead>Permissions</TableHead>
                        <TableHead>Users Count</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rolesData.map((role) => (
                        <TableRow key={role.id}>
                          <TableCell className="font-medium">{role.name}</TableCell>
                          <TableCell>{role.permissions}</TableCell>
                          <TableCell>{role.userCount}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditRole(role)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Workflow Overrides Tab */}
          <TabsContent value="workflow" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Workflow Overrides</CardTitle>
                <CardDescription>Override workflow decisions and reopen sheets</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sheet ID</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Submitted By</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Override Action</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workflowOverrides.map((override) => (
                        <TableRow key={override.id}>
                          <TableCell className="font-medium">{override.sheetId}</TableCell>
                          <TableCell>{override.projectName}</TableCell>
                          <TableCell>{override.submittedBy}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {override.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{override.overrideAction}</TableCell>
                          <TableCell className="text-right">
                            <Button 
                              size="sm"
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to execute override: ${override.overrideAction}?`)) {
                                  console.log('Executing override:', override.id);
                                  // In a real implementation, this would call the override API
                                }
                              }}
                            >
                              Execute Override
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-6">
            <div className="space-y-6">
              {/* Analytics Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analyticsData.totalUsers}</div>
                    <p className="text-xs text-muted-foreground">+12% from last month</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analyticsData.activeUsers}</div>
                    <p className="text-xs text-muted-foreground">+8% from last month</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
                    <FolderPlus className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analyticsData.totalProjects}</div>
                    <p className="text-xs text-muted-foreground">+5% from last month</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Sheets</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analyticsData.totalSheets}</div>
                    <p className="text-xs text-muted-foreground">+18% from last month</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Section */}
              <div className="mb-8">
                <ChartsSection context="SUPER_ADMIN_DASHBOARD" />
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* User Growth Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>User Growth</CardTitle>
                    <CardDescription>Monthly user registration trend</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={userGrowthData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="users" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Project Status Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>Project Status Distribution</CardTitle>
                    <CardDescription>Distribution of projects by status</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={projectStatusData}
                            cx="50%"
                            cy="50%"
                            labelLine={true}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            {projectStatusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Sheet Submission Trend */}
                <Card>
                  <CardHeader>
                    <CardTitle>Sheet Submission Trend</CardTitle>
                    <CardDescription>Monthly sheet submissions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sheetSubmissionData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="submissions" fill="hsl(var(--primary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Role Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>User Role Distribution</CardTitle>
                    <CardDescription>Distribution of users by role</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={roleDistributionData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" fill="hsl(var(--primary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Additional Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Monthly Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Activity</CardTitle>
                    <CardDescription>Overall system activity trend</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyActivityData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Area type="monotone" dataKey="activity" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Placeholder for Future Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>System Performance</CardTitle>
                    <CardDescription>Average response times and uptime</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80 flex items-center justify-center">
                      <div className="text-center">
                        <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto" />
                        <p className="mt-2 text-muted-foreground">Performance metrics coming soon</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* System Logs Tab */}
          <TabsContent value="logs" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>System Logs</CardTitle>
                <CardDescription>View system activity and audit trails</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search logs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    
                    <Select value={timeFilter} onValueChange={setTimeFilter}>
                      <SelectTrigger className="w-full sm:w-40">
                        <SelectValue placeholder="Time Range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Time</SelectItem>
                        <SelectItem value="10min">Last 10 Minutes</SelectItem>
                        <SelectItem value="1hr">Last 1 Hour</SelectItem>
                        <SelectItem value="24hr">Last 24 Hours</SelectItem>
                        <SelectItem value="7days">Last 7 Days</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={actionFilter} onValueChange={setActionFilter}>
                      <SelectTrigger className="w-full sm:w-40">
                        <SelectValue placeholder="Action Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Actions</SelectItem>
                        <SelectItem value="submission">Submissions</SelectItem>
                        <SelectItem value="approval">Approvals</SelectItem>
                        <SelectItem value="rejection">Rejections</SelectItem>
                        <SelectItem value="pushed">Pushed/Forwarded</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={exportLogsToExcel}
                    >
                      <Download className="w-4 h-4" />
                      Excel
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={exportLogsToPDF}
                    >
                      <Download className="w-4 h-4" />
                      PDF
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={fetchSystemLogs}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </Button>
                  </div>
                </div>
                
                {logsLoading ? (
                  <div className="flex justify-center items-center h-32">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    <span className="ml-2">Loading logs...</span>
                  </div>
                ) : logsError ? (
                  <div className="flex justify-center items-center h-32 text-red-500">
                    <span>Error: {logsError}</span>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>Performed By</TableHead>
                          <TableHead>Action Type</TableHead>
                          <TableHead>Target Entity</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {systemLogs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                              No logs found
                            </TableCell>
                          </TableRow>
                        ) : (
                          systemLogs
                            .filter((log: SystemLog) => {
                              if (!searchTerm) return true;
                              const search = searchTerm.toLowerCase();
                              return (
                                log.performed_by_name?.toLowerCase().includes(search) ||
                                log.action_type?.toLowerCase().includes(search) ||
                                log.target_entity?.toLowerCase().includes(search) ||
                                log.remarks?.toLowerCase().includes(search)
                              );
                            })
                            .map((log: SystemLog) => (
                              <TableRow key={log.id}>
                                <TableCell className="font-mono text-sm">
                                  {new Date(log.timestamp).toLocaleString()}
                                </TableCell>
                                <TableCell>{log.performed_by_name || 'System'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                    {log.action_type || 'Unknown'}
                                  </Badge>
                                </TableCell>
                                <TableCell>{log.target_entity || 'N/A'}</TableCell>
                                <TableCell>{log.remarks || 'N/A'}</TableCell>
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* View Project Modal */}
      <ViewProjectModal
        isOpen={showViewProjectModal}
        onClose={() => {
          setShowViewProjectModal(false);
          setSelectedProject(null);
        }}
        project={selectedProject}
      />
      
      {/* Edit Project Modal */}
      <EditProjectModal
        isOpen={showEditProjectModal}
        onClose={() => {
          setShowEditProjectModal(false);
          setSelectedProject(null);
        }}
        project={selectedProject}
        onSave={async (projectId, data) => {
          setLoading(true);
          setError('');
          try {
            await api.put(`/api/super-admin/projects/${projectId}`, {
              name: data.name,
              location: data.location,
              status: data.status,
              progress: data.progress,
              planStart: data.planStart || null,
              planEnd: data.planEnd || null
            });
            setShowEditProjectModal(false);
            setSelectedProject(null);
            await fetchProjects();
            setTimeout(() => {
              alert('Project updated successfully!');
            }, 100);
          } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update project');
            console.error('Error updating project:', err);
            throw err;
          } finally {
            setLoading(false);
          }
        }}
        loading={loading}
      />
    </div>
  );
};

export default SuperAdminDashboard;