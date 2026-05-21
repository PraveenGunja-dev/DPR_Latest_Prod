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
  const [selectedEps, setSelectedEps] = useState<string[]>([]);
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
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchInitialData();
      fetchMyRequests();
      setSelectedEps([]);
      setSelectedProjectIds([]);
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

    if (requestType === 'eps' && selectedEps.length === 0) {
      setError('Please select at least one EPS group');
      return;
    }

    if (requestType === 'project' && selectedProjectIds.length === 0) {
      setError('Please select at least one project');
      return;
    }

    setSubmitting(true);
    try {
      const promises = [];
      
      if (requestType === 'eps') {
        for (const eps of selectedEps) {
          promises.push(apiClient.post('/project-assignment/request-access', {
            requestType: 'eps',
            epsName: eps,
            justification: justification.trim()
          }));
        }
      } else if (requestType === 'project') {
        for (const pid of selectedProjectIds) {
          promises.push(apiClient.post('/project-assignment/request-access', {
            requestType: 'project',
            projectId: pid,
            justification: justification.trim()
          }));
        }
      }

      const results = await Promise.allSettled(promises);
      const rejected = results.filter(r => r.status === 'rejected');
      const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      
      const duplicateCount = fulfilled.filter(r => r.value.data.duplicate).length;
      const successCount = fulfilled.filter(r => !r.value.data.duplicate).length;

      if (rejected.length === promises.length) {
        setError('Failed to submit requests. Please try again.');
      } else {
        let msg = '';
        if (successCount > 0) msg += `Successfully submitted ${successCount} request(s). `;
        if (duplicateCount > 0) msg += `${duplicateCount} request(s) were already pending. `;
        if (rejected.length > 0) msg += `${rejected.length} request(s) failed.`;
        
        setSuccess(msg.trim());
        setSelectedEps([]);
        setSelectedProjectIds([]);
        setJustification('');
        fetchMyRequests();
      }
    } catch (err: any) {
      setError(err.response?.data?.detail?.message || 'An unexpected error occurred');
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col border border-slate-200 dark:border-slate-700 overflow-hidden">
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

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
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
                      <span className={selectedEps.length > 0 ? '' : 'text-slate-400'}>
                        {selectedEps.length > 0 
                          ? (selectedEps.length === 1 ? selectedEps[0] : `${selectedEps.length} EPS Groups Selected`) 
                          : '-- Select EPS Groups --'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${epsDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {epsDropdownOpen && (
                      <div className="mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEps(prev => 
                                  prev.includes(eps.epsName) 
                                    ? prev.filter(name => name !== eps.epsName)
                                    : [...prev, eps.epsName]
                                );
                              }}
                              className={`px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                                selectedEps.includes(eps.epsName)
                                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedEps.includes(eps.epsName) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600'}`}>
                                  {selectedEps.includes(eps.epsName) && <CheckCircle className="w-3 h-3 text-white" />}
                                </div>
                                <span>{eps.epsName}</span>
                              </div>
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
                      <span className={selectedProjectIds.length > 0 ? '' : 'text-slate-400 truncate pr-2'}>
                        {selectedProjectIds.length > 0
                          ? (selectedProjectIds.length === 1 
                              ? projectList.find(p => p.projectId === selectedProjectIds[0])?.projectName 
                              : `${selectedProjectIds.length} Projects Selected`)
                          : '-- Select Projects --'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${projectDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {projectDropdownOpen && (
                      <div className="mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
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
                            .map(proj => {
                              const isAssigned = proj.status === 'assigned';
                              const isRequested = proj.status === 'requested';
                              const isDisabled = isAssigned || isRequested;
                              const isSelected = selectedProjectIds.includes(proj.projectId);
                              return (
                            <div
                              key={proj.projectId}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isDisabled) return;
                                setSelectedProjectIds(prev => 
                                  prev.includes(proj.projectId)
                                    ? prev.filter(id => id !== proj.projectId)
                                    : [...prev, proj.projectId]
                                );
                              }}
                              className={`px-4 py-3 transition-colors flex items-start gap-3 ${
                                isDisabled 
                                  ? 'opacity-70 cursor-not-allowed' 
                                  : isSelected
                                    ? 'bg-blue-50 dark:bg-blue-900/20 cursor-pointer'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer'
                              }`}
                            >
                              {/* Status indicator instead of checkbox for assigned/requested */}
                              {isAssigned ? (
                                <div className="mt-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                  <CheckCircle className="w-3 h-3 text-white" />
                                </div>
                              ) : isRequested ? (
                                <div className="mt-0.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                                  <Clock className="w-3 h-3 text-white" />
                                </div>
                              ) : (
                                <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600'}`}>
                                  {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`text-sm font-medium ${
                                    isAssigned ? 'text-emerald-700 dark:text-emerald-400'
                                    : isRequested ? 'text-amber-700 dark:text-amber-400'
                                    : isSelected ? 'text-blue-700 dark:text-blue-300' 
                                    : 'text-slate-700 dark:text-slate-200'
                                  }`}>
                                    {proj.projectName}
                                  </p>
                                  {isAssigned && (
                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                      Assigned
                                    </span>
                                  )}
                                  {isRequested && (
                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                      Pending
                                    </span>
                                  )}
                                </div>
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
                            </div>
                              );
                            })}
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
                  Justification <span className="text-slate-400 font-normal lowercase ml-1">(optional)</span>
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Why do you need access? (Optional)"
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
