import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { requestAccess, checkAccessStatus } from '@/services/userService';
import { useAuth } from './contexts/AuthContext';
import { Clock, Shield, Send, CheckCircle2, AlertCircle, LogOut, RefreshCw } from 'lucide-react';

const AccessPending = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isLoading, hasPendingRequest, setHasPendingRequest } = useAuth();
  
  const ssoUser = user || JSON.parse(localStorage.getItem('sso_pending_user') || 'null');
  const isNewUser = location.state?.isNewUser || false;

  const [selectedRole, setSelectedRole] = useState('');
  const [justification, setJustification] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User state

  useEffect(() => {
    if (!isLoading && !ssoUser) {
      navigate('/');
    }
  }, [ssoUser, isLoading, navigate]);

  const handleStatusCheck = async () => {
    if (!ssoUser?.ObjectId) return;
    try {
      const response = await checkAccessStatus(ssoUser.ObjectId);
      if (response.role !== 'pending_approval' && response.isActive) {
        setIsApproved(true);
        // If they click "Enter Platform", we'll tell them they need to sign in again to get the token
        // OR we can try to trigger a re-login flow.
      }
    } catch (err) {
      console.error('Failed to check access status:', err);
    }
  };

  useEffect(() => {
    if (hasPendingRequest || requestSent) {
      // Check immediately
      handleStatusCheck();
      // Then every 30 seconds
      const interval = setInterval(handleStatusCheck, 30000);
      return () => clearInterval(interval);
    }
  }, [hasPendingRequest, requestSent, ssoUser?.ObjectId]);

  const handleRequestAccess = async () => {
    if (!selectedRole) {
      setError('Please select a role');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      await requestAccess(ssoUser.ObjectId, selectedRole, justification);
      setRequestSent(true);
      setHasPendingRequest(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit access request');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    localStorage.removeItem('sso_pending_user');
    navigate('/');
  };

  if (isLoading || (loading && !requestSent)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!ssoUser) return null;

  const roles = [
    { 
      id: 'supervisor', 
      label: 'Supervisor / Maker', 
      description: 'Daily data entry, sheet submission & field operations',
      icon: '👷',
      color: 'from-blue-500 to-blue-600'
    },
    { 
      id: 'Site PM', 
      label: 'Site PM / Checker 1', 
      description: 'Review, modify and approve project workflows',
      icon: '📋',
      color: 'from-emerald-500 to-emerald-600'
    },
    { 
      id: 'PMAG', 
      label: 'PMAG / Checker 2', 
      description: 'Advanced analytics, dashboards & final approvals',
      icon: '📊',
      color: 'from-purple-500 to-purple-600'
    },
  ];

  return (
    <div className="min-h-screen bg-background bg-gradient-to-br from-background via-muted/20 to-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/10 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-2xl relative z-10 text-foreground">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <img 
            src={`${import.meta.env.BASE_URL}logo.png`} 
            alt="Adani Logo" 
            className="h-12 mx-auto mb-6 opacity-80" 
          />
        </motion.div>

        <AnimatePresence mode="wait">
          {isApproved ? (
            /* Access Approved State */
            <motion.div
              key="approved"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card/70 border border-border/60 rounded-2xl p-10 backdrop-blur-xl shadow-2xl text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="w-24 h-24 mx-auto mb-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center relative"
              >
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                <motion.div 
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 rounded-full border-2 border-emerald-500/30"
                ></motion.div>
              </motion.div>

              <h1 className="text-3xl font-bold text-foreground mb-3">Access Granted!</h1>
              <p className="text-muted-foreground text-lg mb-6">
                Your request has been approved. You now have full access to the platform.
              </p>

              <Button
                onClick={() => window.location.href = `${window.location.origin}/api/sso/login`}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-6 text-lg rounded-xl shadow-lg shadow-emerald-600/20 transition-all font-bold uppercase tracking-wider"
              >
                Enter Platform
              </Button>
            </motion.div>
          ) : requestSent || hasPendingRequest ? (
            /* Request Sent / Pending State */
            <motion.div
              key="pending"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
              className="bg-card/70 border border-border/60 rounded-2xl p-10 backdrop-blur-xl shadow-2xl text-center"
            >
              <div className="relative w-32 h-32 mx-auto mb-8">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl rotate-3"
                ></motion.div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Clock className="w-16 h-16 text-primary animate-pulse" />
                </div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="absolute -bottom-2 -right-2 bg-background border border-border rounded-full p-2 shadow-sm"
                >
                  <Shield className="w-5 h-5 text-primary" />
                </motion.div>
              </div>

              <h1 className="text-3xl font-bold text-foreground mb-3">
                {requestSent ? 'Request Submitted!' : 'Awaiting Approval'}
              </h1>
              <p className="text-muted-foreground text-lg mb-2">
                Welcome, <span className="text-foreground font-medium">{ssoUser.Name}</span>
              </p>
              <p className="text-muted-foreground/80 max-w-md mx-auto mb-8 leading-relaxed">
                {requestSent
                  ? 'Your access request has been submitted successfully and is being reviewed by the administrator.'
                  : 'Your access request is in the pending queue. You will be notified once the administrator processes it.'
                }
              </p>

              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  className="border-border text-muted-foreground hover:text-foreground hover:bg-accent h-12 rounded-xl"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
                <Button
                  variant="outline"
                  onClick={handleStatusCheck}
                  className="border-border text-primary hover:text-primary hover:bg-primary/5 h-12 rounded-xl"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check Status
                </Button>
              </div>
            </motion.div>
          ) : (
            /* Role Selection & Request Form */
            <motion.div
              key="form"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
              className="bg-card/70 border border-border/60 rounded-2xl p-10 backdrop-blur-xl shadow-2xl"
            >
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="w-16 h-16 mx-auto mb-5 rounded-full bg-gradient-to-br from-primary/20 to-secondary/10 border border-primary/20 flex items-center justify-center"
                >
                  <Shield className="w-8 h-8 text-primary" />
                </motion.div>
                
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  Welcome to Digitalized DPR!
                </h1>
                <p className="text-muted-foreground mb-1">
                  Signed in as <span className="text-foreground font-medium">{ssoUser.Email}</span>
                </p>
                <p className="text-muted-foreground/70 text-sm max-w-md mx-auto">
                  To get started, please request access by selecting your role below.
                  A notification will be sent to the admin for approval.
                </p>
              </div>

              {/* Role Selection Cards */}
              <div className="space-y-3 mb-6">
                <label className="block text-sm font-medium text-foreground/80 mb-3">
                  Select Your Role
                </label>
                {roles.map((role) => (
                  <motion.div
                    key={role.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => { setSelectedRole(role.id); setError(null); }}
                    className={`cursor-pointer rounded-xl border p-4 transition-all duration-300 ${
                      selectedRole === role.id
                        ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border bg-muted/30 hover:border-primary/30 hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{role.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-foreground font-semibold">{role.label}</h3>
                          {selectedRole === role.id && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                            >
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            </motion.div>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm">{role.description}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Justification */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Justification <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Briefly describe why you need access and your project/team..."
                  className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg text-foreground placeholder-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all resize-none h-24 text-sm"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  className="border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
                <Button
                  onClick={handleRequestAccess}
                  disabled={loading || !selectedRole}
                  className="flex-1 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-medium transition-all duration-300"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2"></span>
                      Submitting...
                    </span>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Request Access
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-muted-foreground/40 text-xs mt-8 tracking-wider"
        >
          &copy; {new Date().getFullYear()} ADANI RENEWABLES. ALL RIGHTS RESERVED.
        </motion.p>
      </div>
    </div>
  );
};

export default AccessPending;
