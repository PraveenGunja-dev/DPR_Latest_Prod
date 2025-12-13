import React, { useState, useEffect } from 'react';
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
  Upload
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import axios from 'axios';
import {
  ViewUserModal,
  EditUserModal,
  AssignProjectModal,
  ViewProjectModal,
  EditProjectModal
} from './components';

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

// Create axios instance with base URL
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002',
  headers: {
    'Content-Type': 'application/json',
  },
});

const SuperAdminDashboard = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [usersData, setUsersData] = useState<User[]>([]);
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
  
  // State for workflow overrides
  const [workflowOverrides, setWorkflowOverrides] = useState([]);
  
  // State for system logs
  const [systemLogs, setSystemLogs] = useState([]);
  
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
      // In a real implementation, this would fetch from an API
      // For now, we'll use static data
      const roles = [
        { id: 1, name: 'Supervisor', permissions: 'Basic data entry, sheet submission', userCount: 15 },
        { id: 2, name: 'Site PM', permissions: 'Review and approve sheets', userCount: 8 },
        { id: 3, name: 'PMAG', permissions: 'Final approval, analytics', userCount: 5 },
        { id: 4, name: 'Super Admin', permissions: 'Full system access', userCount: 1 },
      ];
      setRolesData(roles);
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
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/super-admin/logs');
      setSystemLogs(response.data || []);
    } catch (err) {
      setError('Failed to fetch system logs');
      console.error('Error fetching system logs:', err);
    } finally {
      setLoading(false);
    }
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
          <TabsList className="grid w-full grid-cols-5">
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
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      Filter
                    </Button>
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
                            if (!searchTerm) return true;
                            const search = searchTerm.toLowerCase();
                            return (
                              user.Name.toLowerCase().includes(search) ||
                              user.Email.toLowerCase().includes(search) ||
                              user.Role.toLowerCase().includes(search)
                            );
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
                                  className="hover:bg-gray-100"
                                >
                                  <Eye className="w-4 h-4" />
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
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      Filter
                    </Button>
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
                        {projectsData.map((project) => (
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
                                onClick={() => console.log('Edit role:', role.id)}
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

          {/* System Logs Tab */}
          <TabsContent value="logs" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>System Logs</CardTitle>
                <CardDescription>View system activity and audit trails</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search logs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={() => console.log('Export logs clicked')}
                    >
                      <Download className="w-4 h-4" />
                      Export
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
                        systemLogs.map((log: any) => (
                          <TableRow key={log.id}>
                            <TableCell className="font-mono text-sm">
                              {new Date(log.timestamp || log.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>{log.performed_by_name || log.performed_by || 'System'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {log.action_type || log.action}
                              </Badge>
                            </TableCell>
                            <TableCell>{log.target_entity || 'N/A'}</TableCell>
                            <TableCell>{log.remarks || log.details || 'N/A'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
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