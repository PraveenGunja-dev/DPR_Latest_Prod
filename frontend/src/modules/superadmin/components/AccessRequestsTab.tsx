import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  CheckCircle2, XCircle, Clock, RefreshCw, Shield,
  User, Mail, Calendar, MessageSquare, Filter 
} from 'lucide-react';
import { getAccessRequests, processAccessRequest, AccessRequest } from '@/modules/auth/services/authService';
import { toast } from 'sonner';

interface AccessRequestsTabProps {
  token: string | null;
}

export const AccessRequestsTab: React.FC<AccessRequestsTabProps> = ({ token }) => {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [approvalRole, setApprovalRole] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await getAccessRequests(statusFilter === 'all' ? undefined : statusFilter);
      setRequests(data);
    } catch (err) {
      console.error('Failed to fetch access requests:', err);
      toast.error('Failed to fetch access requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchRequests();
    }
  }, [token, statusFilter]);

  const openApprovalDialog = (request: AccessRequest, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setActionType(action);
    setApprovalRole(request.requested_role);
    setReviewNotes('');
    setShowApprovalDialog(true);
  };

  const handleProcessRequest = async () => {
    if (!selectedRequest) return;

    setProcessingId(selectedRequest.id);
    try {
      await processAccessRequest(
        selectedRequest.id,
        actionType,
        actionType === 'approve' ? approvalRole : undefined,
        reviewNotes
      );
      
      toast.success(
        actionType === 'approve' 
          ? `Access approved for ${selectedRequest.user_name} as ${approvalRole}`
          : `Access request from ${selectedRequest.user_name} rejected`
      );
      
      setShowApprovalDialog(false);
      fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process request');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/20"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      'supervisor': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Site PM': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      'PMAG': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'Super Admin': 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return <Badge className={`${colors[role] || 'bg-gray-500/20 text-gray-400'} hover:opacity-80`}>{role}</Badge>;
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Access Requests
                {pendingCount > 0 && (
                  <span className="bg-amber-500 text-white text-xs font-bold rounded-full px-2 py-0.5 ml-2">
                    {pendingCount} pending
                  </span>
                )}
              </CardTitle>
              <CardDescription>Review and manage SSO user access requests</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Requests</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading requests...</span>
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Shield className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">No access requests</p>
              <p className="text-sm">
                {statusFilter === 'pending' 
                  ? 'No pending requests to review' 
                  : `No ${statusFilter} requests found`}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Requested Role</TableHead>
                    <TableHead>Justification</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          {request.user_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{request.user_email}</TableCell>
                      <TableCell>{getRoleBadge(request.requested_role)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                        {request.justification || '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(request.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {request.status === 'pending' ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => openApprovalDialog(request, 'approve')}
                              disabled={processingId === request.id}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openApprovalDialog(request, 'reject')}
                              disabled={processingId === request.id}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {request.reviewer_name && (
                              <span>By {request.reviewer_name}</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval/Rejection Dialog */}
      <AnimatePresence>
        {showApprovalDialog && selectedRequest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={(e) => { if (e.target === e.currentTarget) setShowApprovalDialog(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                {actionType === 'approve' ? (
                  <><CheckCircle2 className="w-5 h-5 text-emerald-500" /> Approve Access</>
                ) : (
                  <><XCircle className="w-5 h-5 text-red-500" /> Reject Access</>
                )}
              </h2>
              <p className="text-muted-foreground text-sm mb-6">
                {actionType === 'approve' 
                  ? `Approve access for ${selectedRequest.user_name}?`
                  : `Reject access request from ${selectedRequest.user_name}?`
                }
              </p>

              {/* User Info */}
              <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{selectedRequest.user_name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{selectedRequest.user_email}</span>
                </div>
                {selectedRequest.justification && (
                  <div className="flex items-start gap-2 text-sm">
                    <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <span className="text-muted-foreground">{selectedRequest.justification}</span>
                  </div>
                )}
              </div>

              {/* Role Selection (for approval) */}
              {actionType === 'approve' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Assign Role</label>
                  <Select value={approvalRole} onValueChange={setApprovalRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="Site PM">Site PM</SelectItem>
                      <SelectItem value="PMAG">PMAG</SelectItem>
                      <SelectItem value="Super Admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Review Notes */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  {actionType === 'approve' ? 'Notes (optional)' : 'Reason for rejection'}
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={actionType === 'approve' ? 'Add any notes...' : 'Provide a reason for rejection...'}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required={actionType === 'reject'}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowApprovalDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleProcessRequest}
                  disabled={processingId !== null || (actionType === 'approve' && !approvalRole)}
                  className={actionType === 'approve' 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                  }
                >
                  {processingId !== null ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                  ) : actionType === 'approve' ? (
                    <><CheckCircle2 className="w-4 h-4 mr-2" />Approve Access</>
                  ) : (
                    <><XCircle className="w-4 h-4 mr-2" />Reject Request</>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
