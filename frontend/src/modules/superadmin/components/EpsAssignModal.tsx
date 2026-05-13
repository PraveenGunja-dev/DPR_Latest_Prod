import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Check, Loader2, ChevronDown, FolderOpen, Trash2 } from 'lucide-react';
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
});

interface EpsAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: { ObjectId: number; Name: string; Email: string; Role: string } | null;
  token: string;
}

interface EpsGroup {
  epsName: string;
  projectCount: number;
}

interface EpsProject {
  projectId: number;
  projectName: string;
  p6Id: string;
  projectType: string;
  appStatus: string;
}

interface Assignment {
  id: number;
  projectId: number;
  epsName: string;
  projectName: string;
  p6Id: string;
  projectType: string;
  assignedAt: string;
}

const EpsAssignModal: React.FC<EpsAssignModalProps> = ({ isOpen, onClose, user, token }) => {
  const [epsList, setEpsList] = useState<EpsGroup[]>([]);
  const [selectedEps, setSelectedEps] = useState<string>('');
  const [epsProjects, setEpsProjects] = useState<EpsProject[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [currentAssignments, setCurrentAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [epsDropdownOpen, setEpsDropdownOpen] = useState(false);
  const [epsSearchTerm, setEpsSearchTerm] = useState('');
  const epsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, [token]);

  useEffect(() => {
    if (isOpen && user) {
      fetchEpsList();
      fetchAssignments();
      setSelectedEps('');
      setEpsProjects([]);
      setSelectedProjectIds([]);
      setSearchTerm('');
      setError('');
    }
  }, [isOpen, user]);

  // Close EPS dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (epsDropdownRef.current && !epsDropdownRef.current.contains(e.target as Node)) {
        setEpsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchEpsList = async () => {
    setLoading(true);
    try {
      const res = await api.get('/super-admin/eps-list');
      setEpsList(res.data || []);
    } catch (err) {
      console.error('Error fetching EPS list:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async () => {
    if (!user) return;
    try {
      const res = await api.get(`/super-admin/pmag/${user.ObjectId}/assignments`);
      setCurrentAssignments(res.data || []);
    } catch (err) {
      console.error('Error fetching assignments:', err);
    }
  };

  const handleEpsSelect = async (epsName: string) => {
    setSelectedEps(epsName);
    setSelectedProjectIds([]);
    setProjectsLoading(true);
    try {
      const res = await api.get(`/super-admin/eps/${encodeURIComponent(epsName)}/projects`);
      setEpsProjects(res.data || []);
    } catch (err) {
      console.error('Error fetching EPS projects:', err);
    } finally {
      setProjectsLoading(false);
    }
  };

  const toggleProject = (projectId: number) => {
    setSelectedProjectIds(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const toggleSelectAll = () => {
    const filteredIds = filteredProjects.map(p => p.projectId);
    const allSelected = filteredIds.every(id => selectedProjectIds.includes(id));
    if (allSelected) {
      setSelectedProjectIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedProjectIds(prev => [...new Set([...prev, ...filteredIds])]);
    }
  };

  const isAlreadyAssigned = (projectId: number) => {
    return currentAssignments.some(a => a.projectId === projectId);
  };

  const handleAssign = async () => {
    if (!user || selectedProjectIds.length === 0) return;
    setAssigning(true);
    setError('');
    try {
      await api.post('/super-admin/pmag/assign-projects', {
        userId: user.ObjectId,
        projectIds: selectedProjectIds,
        epsName: selectedEps,
      });
      await fetchAssignments();
      setSelectedProjectIds([]);
    } catch (err: any) {
      setError(err.response?.data?.detail?.message || 'Failed to assign projects');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (projectId: number) => {
    if (!user) return;
    try {
      await api.post('/super-admin/pmag/unassign-project', {
        userId: user.ObjectId,
        projectId,
      });
      await fetchAssignments();
    } catch (err) {
      console.error('Error unassigning:', err);
    }
  };

  const filteredProjects = epsProjects.filter(p => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return p.projectName.toLowerCase().includes(s) || (p.p6Id || '').toLowerCase().includes(s);
  });

  // Group current assignments by EPS
  const assignmentsByEps = currentAssignments.reduce((acc, a) => {
    const key = a.epsName || 'Unclassified';
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {} as Record<string, Assignment[]>);

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-[95vw] max-w-6xl h-[85vh] flex flex-col border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-blue-500" />
              Assign Projects to PMAG User
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {user.Name} <span className="text-slate-400">({user.Email})</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Main Body - 2 Columns */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT COLUMN: EPS List */}
          <div className="w-1/3 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Select EPS Group
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search EPS..."
                  value={epsSearchTerm}
                  onChange={(e) => setEpsSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="space-y-1">
                  {epsList
                    .filter(eps => !epsSearchTerm || eps.epsName.toLowerCase().includes(epsSearchTerm.toLowerCase()))
                    .map(eps => (
                    <div
                      key={eps.epsName}
                      onClick={() => handleEpsSelect(eps.epsName)}
                      className={`px-4 py-3 rounded-xl cursor-pointer transition-all flex items-center justify-between border ${
                        selectedEps === eps.epsName
                          ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800/50'
                          : 'border-transparent hover:bg-white dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                      }`}
                    >
                      <span className={`text-sm font-medium ${selectedEps === eps.epsName ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        {eps.epsName}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        selectedEps === eps.epsName 
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' 
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {eps.projectCount}
                      </span>
                    </div>
                  ))}
                  {epsList.filter(eps => !epsSearchTerm || eps.epsName.toLowerCase().includes(epsSearchTerm.toLowerCase())).length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">No EPS found</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Projects & Assignments */}
          <div className="w-2/3 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
            
            {/* Top Half: Projects to Assign */}
            <div className="flex-1 flex flex-col min-h-0 border-b border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 flex items-center justify-between bg-white dark:bg-slate-900 z-10 shadow-sm">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {selectedEps ? `Projects under "${selectedEps}"` : 'Select an EPS group to view projects'}
                  </h3>
                  {selectedEps && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedProjectIds.length} projects selected
                    </p>
                  )}
                </div>
                {selectedEps && (
                  <div className="w-64 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {!selectedEps ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <FolderOpen className="w-12 h-12 mb-3 opacity-20" />
                    <p>Select an EPS from the left panel</p>
                  </div>
                ) : projectsLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div
                      onClick={toggleSelectAll}
                      className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors sticky top-0 z-10"
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                        filteredProjects.length > 0 && filteredProjects.every(p => selectedProjectIds.includes(p.projectId))
                          ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {filteredProjects.length > 0 && filteredProjects.every(p => selectedProjectIds.includes(p.projectId)) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Select All</span>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredProjects.map(project => {
                        const assigned = isAlreadyAssigned(project.projectId);
                        const selected = selectedProjectIds.includes(project.projectId);
                        return (
                          <div
                            key={project.projectId}
                            onClick={() => !assigned && toggleProject(project.projectId)}
                            className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                              assigned
                                ? 'bg-emerald-50/30 dark:bg-emerald-900/5 cursor-default'
                                : 'cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                              assigned
                                ? 'bg-emerald-500 border-emerald-500'
                                : selected
                                  ? 'bg-blue-500 border-blue-500'
                                  : 'border-slate-300 dark:border-slate-600'
                            }`}>
                              {(assigned || selected) && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                                {project.projectName}
                              </p>
                              <p className="text-xs text-slate-400 font-mono mt-0.5">
                                ID: {project.p6Id || project.projectId}
                              </p>
                            </div>
                            {assigned && (
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-md uppercase">
                                Assigned
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {filteredProjects.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-8">No projects found</p>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Assign Actions */}
                {selectedProjectIds.length > 0 && (
                  <div className="mt-4 sticky bottom-0 bg-white dark:bg-slate-900 py-2 border-t border-slate-100 dark:border-slate-800 z-10 flex justify-end">
                    <button
                      onClick={handleAssign}
                      disabled={assigning}
                      className="flex items-center justify-center gap-2 px-8 py-2.5 rounded-xl bg-gradient-to-r from-[#1B4F72] via-blue-600 to-indigo-700 hover:opacity-90 hover:shadow-xl hover:-translate-y-0.5 text-white font-semibold text-sm shadow-lg shadow-blue-900/30 transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                    >
                      {assigning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                      Assign {selectedProjectIds.length} Selected Project{selectedProjectIds.length > 1 ? 's' : ''}
                    </button>
                  </div>
                )}
                {error && (
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg mt-2 text-center">{error}</p>
                )}
              </div>
            </div>

            {/* Bottom Half: Current Assignments */}
            <div className="h-1/3 flex flex-col min-h-[250px] bg-slate-50/30 dark:bg-slate-900/30">
              <div className="p-4 flex-shrink-0 flex justify-between items-center bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Currently Assigned Projects
                </h3>
                <span className="text-xs font-semibold px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded-md text-slate-600 dark:text-slate-300">
                  Total: {currentAssignments.length}
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                {currentAssignments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <FolderOpen className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-sm">No projects assigned yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(assignmentsByEps).map(([epsName, assignments]) => (
                      <div key={epsName} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
                        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center sticky top-0 z-10">
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                            {epsName}
                          </span>
                          <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                            {assignments.length}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                          {assignments.map(a => (
                            <div key={a.id} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                              <div className="min-w-0 flex-1 pr-4">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{a.projectName}</p>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {a.p6Id || a.projectId}</p>
                              </div>
                              <button
                                onClick={() => handleUnassign(a.projectId)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0"
                                title="Remove assignment"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end flex-shrink-0 bg-slate-50 dark:bg-slate-900">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default EpsAssignModal;
