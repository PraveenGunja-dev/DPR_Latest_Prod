import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Search, ChevronDown, Clock, CheckCircle, XCircle, Loader2, FolderOpen } from 'lucide-react';
import apiClient from '@/services/apiClient';

interface RequestAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EpsGroup {
  epsName: string;
  projectCount: number;
}

interface AccessRequest {
  id: number;
  requestType: string;
  epsName: string | null;
  projectId: number | null;
  projectName: string | null;
  justification: string;
  status: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const RequestAccessModal: React.FC<RequestAccessModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'request' | 'history'>('request');
  const [requestType, setRequestType] = useState<'eps' | 'project'>('eps');
  const [epsList, setEpsList] = useState<EpsGroup[]>([]);
  const [selectedEps, setSelectedEps] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [myRequests, setMyRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [epsDropdownOpen, setEpsDropdownOpen] = useState(false);
  const [epsSearchTerm, setEpsSearchTerm] = useState('');
  const epsDropdownRef = useRef<HTMLDivElement>(null);

  const [projectList, setProjectList] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchInitialData();
      fetchMyRequests();
      setSelectedEps('');
      setJustification('');
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

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

  // Close Project dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchInitialData = async () => {
    try {
      const [epsRes, projRes] = await Promise.all([
        apiClient.get('/project-assignment/available-eps'),
        apiClient.get('/project-assignment/available-projects')
      ]);
      setEpsList(epsRes.data || []);
      setProjectList(projRes.data || []);
    } catch (err) {
      console.error('Error fetching initial data:', err);
    }
  };

  const fetchMyRequests = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/project-assignment/my-access-requests');
      setMyRequests(res.data || []);
    } catch (err) {
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (requestType === 'eps' && !selectedEps) {
      setError('Please select an EPS group');
      return;
    }

    if (requestType === 'project' && !selectedProjectId) {
      setError('Please select a project');
      return;
    }

    if (!justification.trim()) {
      setError('Please provide a justification');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        requestType,
        justification: justification.trim(),
      };
      if (requestType === 'eps') {
        payload.epsName = selectedEps;
      } else if (requestType === 'project') {
        payload.projectId = selectedProjectId;
      }

      const res = await apiClient.post('/project-assignment/request-access', payload);
      if (res.data.duplicate) {
        setError('You already have a pending request for this');
      } else {
        setSuccess('Access request submitted successfully!');
        setSelectedEps('');
        setSelectedProjectId(null);
        setJustification('');
        fetchMyRequests();
      }
    } catch (err: any) {
      setError(err.response?.data?.detail?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'approved': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'rejected': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return styles[status] || 'bg-slate-100 text-slate-600';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 gradient-adani flex-shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-200" />
            Request Project Access
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors group">
            <X className="w-5 h-5 text-white/70 group-hover:text-white" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('request')}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === 'request'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-900/10'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            New Request
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === 'history'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-900/10'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            My Requests ({myRequests.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'request' ? (
            <div className="space-y-4">
              {/* Request Type */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Request Type
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRequestType('eps')}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      requestType === 'eps'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <FolderOpen className="w-4 h-4 inline mr-2" />
                    EPS Group
                  </button>
                  <button
                    onClick={() => setRequestType('project')}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      requestType === 'project'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Search className="w-4 h-4 inline mr-2" />
                    Specific Project
                  </button>
                </div>
              </div>

              {/* EPS Selector */}
              {requestType === 'eps' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Select EPS Group
                  </label>
                  <div className="relative" ref={epsDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setEpsDropdownOpen(!epsDropdownOpen)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 text-left cursor-pointer focus:ring-2 focus:ring-blue-500 transition-all flex items-center justify-between"
                    >
                      <span className={selectedEps ? '' : 'text-slate-400'}>
                        {selectedEps ? `${selectedEps} (${epsList.find(e => e.epsName === selectedEps)?.projectCount || 0} projects)` : '-- Select an EPS --'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${epsDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {epsDropdownOpen && (
                      <div className="mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                        {/* Search within EPS */}
                        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                          <input
                            type="text"
                            placeholder="Search EPS..."
                            value={epsSearchTerm}
                            onChange={(e) => setEpsSearchTerm(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-1 focus:ring-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {epsList
                            .filter(eps => !epsSearchTerm || eps.epsName.toLowerCase().includes(epsSearchTerm.toLowerCase()))
                            .map(eps => (
                            <div
                              key={eps.epsName}
                              onClick={() => {
                                setSelectedEps(eps.epsName);
                                setEpsDropdownOpen(false);
                                setEpsSearchTerm('');
                              }}
                              className={`px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                                selectedEps === eps.epsName
                                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                              }`}
                            >
                              <span>{eps.epsName}</span>
                              <span className="text-xs text-slate-400 font-normal">{eps.projectCount} projects</span>
                            </div>
                          ))}
                          {epsList.filter(eps => !epsSearchTerm || eps.epsName.toLowerCase().includes(epsSearchTerm.toLowerCase())).length === 0 && (
                            <p className="text-sm text-slate-400 text-center py-4">No EPS found</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Project Selector */}
              {requestType === 'project' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Select Specific Project
                  </label>
                  <div className="relative" ref={projectDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 text-left cursor-pointer focus:ring-2 focus:ring-blue-500 transition-all flex items-center justify-between"
                    >
                      <span className={selectedProjectId ? '' : 'text-slate-400 truncate pr-2'}>
                        {selectedProjectId 
                          ? projectList.find(p => p.projectId === selectedProjectId)?.projectName 
                          : '-- Select a Project --'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${projectDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {projectDropdownOpen && (
                      <div className="mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-lg">
                        {/* Search within Projects */}
                        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                          <input
                            type="text"
                            placeholder="Search by project name or ID..."
                            value={projectSearchTerm}
                            onChange={(e) => setProjectSearchTerm(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-1 focus:ring-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                          {projectList
                            .filter(proj => !projectSearchTerm || 
                                proj.projectName.toLowerCase().includes(projectSearchTerm.toLowerCase()) || 
                                (proj.p6Id && proj.p6Id.toLowerCase().includes(projectSearchTerm.toLowerCase()))
                            )
                            .map(proj => (
                            <div
                              key={proj.projectId}
                              onClick={() => {
                                setSelectedProjectId(proj.projectId);
                                setProjectDropdownOpen(false);
                                setProjectSearchTerm('');
                              }}
                              className={`px-4 py-3 cursor-pointer transition-colors ${
                                selectedProjectId === proj.projectId
                                  ? 'bg-blue-50 dark:bg-blue-900/20'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                              }`}
                            >
                              <p className={`text-sm font-medium ${selectedProjectId === proj.projectId ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                                {proj.projectName}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-mono">
                                  ID: {proj.p6Id || proj.projectId}
                                </span>
                                {proj.epsName && (
                                  <span className="text-[10px] text-slate-400">
                                    in {proj.epsName}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                          {projectList.filter(proj => !projectSearchTerm || proj.projectName.toLowerCase().includes(projectSearchTerm.toLowerCase()) || (proj.p6Id && proj.p6Id.toLowerCase().includes(projectSearchTerm.toLowerCase()))).length === 0 && (
                            <p className="text-sm text-slate-400 text-center py-6">No projects found</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Justification */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Justification
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Why do you need access to these projects?"
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm resize-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">{error}</p>
              )}
              {success && (
                <p className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-lg">{success}</p>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center justify-center gap-2 px-8 py-2.5 rounded-xl bg-gradient-to-r from-[#1B4F72] via-blue-600 to-indigo-700 hover:opacity-90 hover:shadow-xl hover:-translate-y-0.5 text-white font-semibold text-sm shadow-lg shadow-blue-900/30 transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit Request
                </button>
              </div>
            </div>
          ) : (
            /* History Tab */
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : myRequests.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No access requests yet</p>
              ) : (
                myRequests.map(req => (
                  <div key={req.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(req.status)}
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${getStatusBadge(req.status)}`}>
                          {req.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-2">
                      {req.requestType === 'eps'
                        ? `EPS: ${req.epsName}`
                        : `Project: ${req.projectName || req.projectId}`}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{req.justification}</p>
                    {req.reviewNotes && (
                      <p className="text-xs text-slate-400 mt-1 italic">Review: {req.reviewNotes}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestAccessModal;
