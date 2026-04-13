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
  Activity,
  CheckCircle,
  MoreVertical,
  AlertCircle
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
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useFilter } from '@/modules/auth/contexts/FilterContext';
import axios from 'axios';
import {
  SuperAdminHeader,
  SuperAdminTabs,
  SuperAdminAnalytics,
  SuperAdminLogs,
  ViewUserModal,
  EditUserModal,
  AssignProjectModal,
  ViewProjectModal,
  EditProjectModal,
  SnapshotFilterModal,
  SuperAdminSheetEntries,
  AccessRequestsTab
} from './components';
import { syncP6Data } from '@/services/p6ActivityService';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
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

// Define color palette for charts
const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))"];

// Create axios instance with base URL
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});
const SuperAdminDashboard = () => {
  const { user, token } = useAuth();
  const location = useLocation();
  const displayRole = user?.role || user?.Role || '';
  const isPMAGOnly = displayRole === 'PMAG';
  
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || (isPMAGOnly ? 'projects' : 'users'));
  const { searchTerm, setSearchTerm, yearFilter: projectYearFilter, setYearFilter: setProjectYearFilter, typeFilter: projectTypeFilter, setTypeFilter: setProjectTypeFilter } = useFilter();
  const [usersData, setUsersData] = useState<User[]>([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');
  const [showSnapshotFilter, setShowSnapshotFilter] = useState(false);
  const [projectsData, setProjectsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [syncingProjectId, setSyncingProjectId] = useState<number | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Set up axios default headers
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, [token]);

  // Extract FY year from P6Id or fallback to StartDate (April-March FY)
  const extractFY = (project: any): string => {
    const p6Id = project.P6Id || project.p6Id || project.Id || '';
    if (p6Id) {
      const match = p6Id.match(/FY\d{2}/i);
      if (match) return match[0].toUpperCase();
    }
    
    const startDate = project.PlannedStartDate || project.PlanStart || project.planStart || project.StartDate;
    if (startDate && startDate !== 'N/A') {
      const date = new Date(startDate);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = date.getMonth(); // 0 is January
        const fyYear = month >= 3 ? year + 1 : year;
        return `FY${String(fyYear).slice(-2)}`;
      }
    }
    return '';
  };

  // Compute unique available years from all projects
  const availableYears = React.useMemo(() => {
    const years = new Set<string>();
    if (Array.isArray(projectsData)) {
      projectsData.forEach(p => {
        const fy = extractFY(p);
        if (fy) years.add(fy);
      });
    }
    return Array.from(years).sort();
  }, [projectsData]);

  const filteredProjectsData = React.useMemo(() => {
    if (!Array.isArray(projectsData)) return [];
    return projectsData.filter(project => {
      // Apply search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!(
          (project.Name || "").toLowerCase().includes(search) ||
          (project.Location && project.Location.toLowerCase().includes(search))
        )) {
          return false;
        }
      }

      // Apply status filter
      if (projectStatusFilter !== 'all' && project.Status !== projectStatusFilter) {
        return false;
      }

      // Apply type filter
      if (projectTypeFilter !== 'ALL' && (project.ProjectType?.toLowerCase() || 'solar') !== projectTypeFilter.toLowerCase()) {
        return false;
      }

      // Apply year filter
      const fy = extractFY(project);
      if (projectYearFilter !== 'ALL' && fy !== projectYearFilter) {
        return false;
      }

      // Apply appStatus filter
      if (statusFilter !== 'all' && (project.appStatus || 'live') !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [projectsData, searchTerm, projectStatusFilter, projectTypeFilter, projectYearFilter, statusFilter]);

  const toggleProjectSelection = (projectId: number) => {
    setSelectedProjectIds(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const toggleSelectAll = () => {
    if (filteredProjectsData.length > 0 && selectedProjectIds.length === filteredProjectsData.length) {
      setSelectedProjectIds([]);
    } else {
      setSelectedProjectIds(filteredProjectsData.map(p => p.ObjectId));
    }
  };

  const handleBulkSync = async () => {
    if (selectedProjectIds.length === 0) return;
    
    setIsBulkSyncing(true);
    try {
      // Seq sync to avoid hitting P6 API limits too hard
      for (const id of selectedProjectIds) {
        setSyncingProjectId(id);
        await syncP6Data(id);
      }
      fetchProjects();
      setSelectedProjectIds([]);
    } catch (err) {
      console.error("Bulk sync error:", err);
    } finally {
      setIsBulkSyncing(false);
      setSyncingProjectId(null);
    }
  };

  const handleBulkStatusUpdate = async (newStatus: 'live' | 'hold') => {
    if (selectedProjectIds.length === 0) return;
    
    setIsBulkUpdating(true);
    setError('');
    try {
      for (const id of selectedProjectIds) {
        const project = projectsData.find(p => p.ObjectId === id);
        if (project) {
          await api.put(`/super-admin/projects/${id}`, {
            name: project.Name,
            location: project.Location || '',
            status: project.Status || 'planning',
            progress: project.Progress || 0,
            planStart: project.PlanStart || null,
            planEnd: project.PlanEnd || null,
            projectType: project.ProjectType || 'solar',
            appStatus: newStatus
          });
        }
      }
      fetchProjects();
      setSelectedProjectIds([]);
    } catch (err) {
      console.error("Bulk status update error:", err);
      setError("Failed to update status for some projects");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Fetch users data
  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/super-admin/users');
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
      const response = await api.get('/super-admin/projects');
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
      const response = await api.get('/super-admin/projects');
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
    planEnd: '',
    projectType: 'solar'
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
      const response = await api.get('/super-admin/roles');
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
      let url = '/super-admin/system-logs';
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

  // Fetch projects when filters change
  useEffect(() => {
    if (activeTab === 'projects') {
      fetchProjects();
    }
  }, [projectStatusFilter, activeTab]);
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
      await api.post('/super-admin/users', newUser);
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
      await api.post('/super-admin/projects', newProject);
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
      const response = await api.put(`/super-admin/users/${userId}`, data);
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
        api.get(`/super-admin/users/${userId}/projects`),
        api.get('/super-admin/projects')
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

  const handleAssignProjects = async (userId: number, projectIds: number[], sheetTypes: string[] = []) => {
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
        api.post('/super-admin/users/assign-project', {
          userId: userId,
          projectId: projectId,
          sheetTypes: sheetTypes
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
        api.get(`/super-admin/users/${userId}`),
        api.get(`/super-admin/users/${userId}/projects`)
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
    // Open snapshot filter if requested from navbar
    if (location.state?.openSnapshotFilter) {
      setShowSnapshotFilter(true);
      // Clear the state after opening
      window.history.replaceState({}, document.title);
    }
  }, [location.state?.activeTab, location.state?.openSnapshotFilter]);

  // Reset filters when switching tabs
  useEffect(() => {
    if (activeTab !== 'users') {
      setRoleFilter('all');
      setStatusFilter('all');
      setSearchTerm('');
    }
  }, [activeTab]);

  return (
    <DashboardLayout
      userName={user?.Name || "Super Admin"}
      userRole="Super Admin"
    >
      {/* Create User Modal */}
      {showCreateUserForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card text-card-foreground border border-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New User</h2>
            <form onSubmit={handleCreateUserSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  required
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  required
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  className="w-full p-2 border rounded"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="supervisor">Supervisor</option>
                  <option value="Site PM">Site PM</option>
                  <option value="PMAG">PMAG</option>
                  <option value="Super Admin">Super Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="px-4 py-2 border rounded" onClick={() => setShowCreateUserForm(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-500 text-white rounded">
                  {loading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateProjectForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card text-card-foreground border border-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New Project</h2>
            <form onSubmit={handleCreateProjectSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Project Name</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  required
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Location</label>
                <input
                  type="text"
                  value={newProject.location}
                  onChange={(e) => setNewProject({ ...newProject, location: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  className="w-full p-2 border rounded"
                  value={newProject.status}
                  onChange={(e) => setNewProject({ ...newProject, status: e.target.value })}
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="on hold">On Hold</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Progress (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newProject.progress}
                  onChange={(e) => setNewProject({ ...newProject, progress: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="px-4 py-2 border rounded" onClick={() => setShowCreateProjectForm(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-500 text-white rounded">
                  {loading ? 'Creating...' : 'Create Project'}
                </button>
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
          <div className="bg-card text-card-foreground border border-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Edit Role</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleEditRoleSave(editingRole.id, editRoleForm);
            }}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Role Name</label>
                <input
                  type="text"
                  value={editRoleForm.name}
                  onChange={(e) => handleEditRoleFormChange('name', e.target.value)}
                  required
                  disabled
                  className="w-full p-2 border rounded"
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
                <button type="button" className="px-4 py-2 border rounded" onClick={handleEditRoleCancel}>
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 w-full overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        <div className="container mx-auto px-4 py-8">
        <SuperAdminHeader
          userName={user?.Name}
          onCreateUser={handleCreateUser}
          onCreateProject={handleCreateProject}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <SuperAdminTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Access Requests Tab */}
          <TabsContent value="access-requests" className="mt-6">
            <AccessRequestsTab token={token} />
          </TabsContent>

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
                        <SelectItem value="Supervisor">Supervisor</SelectItem>
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
                        {Array.isArray(usersData) && usersData
                          .filter((user) => {
                            // Apply search filter
                            if (searchTerm) {
                              const search = searchTerm.toLowerCase();
                              if (!(
                                (user.Name || "").toLowerCase().includes(search) ||
                                (user.Email || "").toLowerCase().includes(search) ||
                                (user.Role || "").toLowerCase().includes(search)
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
                                  user.Role === 'Supervisor' ? 'default' :
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
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Project Management</CardTitle>
                    <CardDescription>Manage all projects in the system</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {selectedProjectIds.length > 0 && (
                      <Button
                        variant="default"
                        size="sm"
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 h-9 transition-all animate-in fade-in slide-in-from-right-2"
                        onClick={handleBulkSync}
                        disabled={isBulkSyncing}
                      >
                        {isBulkSyncing ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        Sync Selected ({selectedProjectIds.length})
                      </Button>
                    )}
                    {selectedProjectIds.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 border-green-600 text-green-600 hover:bg-green-600 hover:text-white transition-all shadow-sm"
                        onClick={() => handleBulkStatusUpdate('live')}
                        disabled={isBulkUpdating}
                      >
                        {isBulkUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                        Mark Live
                      </Button>
                    )}
                    {selectedProjectIds.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm"
                        onClick={() => handleBulkStatusUpdate('hold')}
                        disabled={isBulkUpdating}
                      >
                        {isBulkUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Put Hold
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2 h-9"
                      onClick={fetchProjects}
                      disabled={loading}
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </div>
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
                  <div className="flex flex-wrap gap-2">
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
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Visibility" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Visibility</SelectItem>
                        <SelectItem value="live">Live Only</SelectItem>
                        <SelectItem value="hold">On Hold Only</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={projectTypeFilter} onValueChange={setProjectTypeFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Types</SelectItem>
                        <SelectItem value="solar">Solar</SelectItem>
                        <SelectItem value="wind">Wind</SelectItem>
                        <SelectItem value="pss">PSS</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={projectYearFilter} onValueChange={setProjectYearFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="All Years" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Years</SelectItem>
                        {availableYears.map(year => (
                          <SelectItem key={year} value={year}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {loading ? (
                  <div className="flex justify-center items-center h-48 border rounded-lg bg-muted/20">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                    <span className="ml-3 font-medium text-muted-foreground">Loading projects...</span>
                  </div>
                ) : error ? (
                  <div className="flex flex-col justify-center items-center h-48 text-red-500 bg-red-50 rounded-lg border border-red-100">
                    <AlertCircle className="w-8 h-8 mb-2" />
                    <span className="font-medium">Error: {error}</span>
                    <Button variant="outline" size="sm" onClick={fetchProjects} className="mt-4">Retry</Button>
                  </div>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="w-[50px] px-4">
                            <Checkbox 
                              checked={filteredProjectsData.length > 0 && selectedProjectIds.length === filteredProjectsData.length}
                              onCheckedChange={toggleSelectAll}
                              aria-label="Select all"
                            />
                          </TableHead>
                          <TableHead className="w-[100px]">Project ID</TableHead>
                          <TableHead className="min-w-[250px]">Project Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead>Visibility</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProjectsData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={11} className="h-48 text-center text-muted-foreground italic">
                              No projects matching your criteria
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredProjectsData.map((project) => (
                            <TableRow 
                              key={project.ObjectId} 
                              className={`transition-colors hover:bg-muted/30 ${selectedProjectIds.includes(project.ObjectId) ? "bg-blue-50/50 hover:bg-blue-50/70" : ""}`}
                            >
                              <TableCell className="px-4">
                                <Checkbox 
                                  checked={selectedProjectIds.includes(project.ObjectId)}
                                  onCheckedChange={() => toggleProjectSelection(project.ObjectId)}
                                  aria-label={`Select ${project.Name}`}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{project.ObjectId}</TableCell>
                              <TableCell className="font-medium">{project.Name}</TableCell>
                              <TableCell className="capitalize">{project.ProjectType || 'Solar'}</TableCell>
                              <TableCell>{project.Location || 'N/A'}</TableCell>
                              <TableCell>
                                <Badge variant={
                                  project.Status === 'active' ? 'default' :
                                    project.Status === 'planning' ? 'secondary' : 'outline'
                                } className="capitalize">
                                  {project.Status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500" style={{ width: `${project.Progress || 0}%` }} />
                                  </div>
                                  <span className="text-xs font-medium">{project.Progress || 0}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">{project.PlanStart ? new Date(project.PlanStart).toLocaleDateString() : 'N/A'}</TableCell>
                              <TableCell className="text-xs">{project.PlanEnd ? new Date(project.PlanEnd).toLocaleDateString() : 'N/A'}</TableCell>
                              <TableCell>
                                <Badge variant={project.appStatus === 'hold' ? 'destructive' : 'outline'} className={project.appStatus === 'hold' ? '' : 'text-green-600 border-green-200'}>
                                  {project.appStatus === 'hold' ? 'Hold' : 'Live'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right px-4">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedProject(project);
                                      setShowViewProjectModal(true);
                                    }}
                                    className="h-8 w-8 p-0"
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
                                        planEnd: project.PlanEnd ? new Date(project.PlanEnd).toISOString().split('T')[0] : '',
                                        projectType: project.ProjectType || 'solar',
                                        appStatus: project.appStatus || 'live'
                                      });
                                      setShowEditProjectModal(true);
                                    }}
                                    className="h-8 w-8 p-0"
                                    title="Edit Project"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        setSyncingProjectId(project.ObjectId);
                                        await syncP6Data(project.ObjectId);
                                        fetchProjects();
                                      } catch (err) {
                                        console.error("Sync failed:", err);
                                      } finally {
                                        setSyncingProjectId(null);
                                      }
                                    }}
                                    disabled={syncingProjectId === project.ObjectId}
                                    className={`h-8 w-8 p-0 ${syncingProjectId === project.ObjectId ? "animate-spin text-blue-600" : ""}`}
                                    title="Sync from P6"
                                  >
                                    <RefreshCw className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
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

          {/* Sheet Entries Tab */}
          <TabsContent value="sheet-entries" className="mt-6">
            <SuperAdminSheetEntries projects={projectsData} />
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
                      {Array.isArray(rolesData) && rolesData.map((role: any) => (
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
          </TabsContent>          {/* Workflow Overrides Tab */}
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
                      {Array.isArray(workflowOverrides) && workflowOverrides.map((override: any) => (
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
          </TabsContent>          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-6">
            <SuperAdminAnalytics analyticsData={analyticsData} />
          </TabsContent>

          {/* System Logs Tab */}
          <TabsContent value="logs" className="mt-6">
            <SuperAdminLogs
              systemLogs={systemLogs}
              logsLoading={logsLoading}
              logsError={logsError}
              searchTerm={searchTerm}
              timeFilter={timeFilter}
              actionFilter={actionFilter}
              onSearchChange={setSearchTerm}
              onTimeFilterChange={setTimeFilter}
              onActionFilterChange={setActionFilter}
              onExportExcel={exportLogsToExcel}
              onExportPDF={exportLogsToPDF}
              onRefresh={fetchSystemLogs}
            />
          </TabsContent>
        </Tabs>
        </div>
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
            await api.put(`/super-admin/projects/${projectId}`, {
              name: data.name,
              location: data.location,
              status: data.status,
              progress: data.progress,
              planStart: data.planStart || null,
              planEnd: data.planEnd || null,
              projectType: data.projectType,
              appStatus: data.appStatus
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

      {/* Snapshot Filter Modal */}
      <SnapshotFilterModal
        isOpen={showSnapshotFilter}
        onClose={() => setShowSnapshotFilter(false)}
        projects={projectsData}
      />
    </DashboardLayout>
  );
};

export default SuperAdminDashboard;