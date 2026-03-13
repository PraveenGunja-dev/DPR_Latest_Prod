import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { requestAccess } from './services/authService';
import { useAuth } from './contexts/AuthContext';
import { Clock, Shield, Send, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';

const AccessPending = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  
  const ssoUser = location.state?.user || JSON.parse(localStorage.getItem('sso_pending_user') || 'null');
  const isNewUser = location.state?.isNewUser || false;

  const [selectedRole, setSelectedRole] = useState('');
  const [justification, setJustification] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user already has a pending request
  const [hasPendingRequest, setHasPendingRequest] = useState(!isNewUser);

  useEffect(() => {
    if (!ssoUser) {
      navigate('/');
    }
  }, [ssoUser, navigate]);

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

  if (!ssoUser) return null;

  const roles = [
    { 
      id: 'supervisor', 
      label: 'Supervisor', 
      description: 'Daily data entry, sheet submission & field operations',
      icon: '👷',
      color: 'from-blue-500 to-blue-600'
    },
    { 
      id: 'Site PM', 
      label: 'Site PM', 
      description: 'Review, modify and approve project workflows',
      icon: '📋',
      color: 'from-emerald-500 to-emerald-600'
    },
    { 
      id: 'PMAG', 
      label: 'PMAG (Admin)', 
      description: 'Advanced analytics, dashboards & final approvals',
      icon: '📊',
      color: 'from-purple-500 to-purple-600'
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/3 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-2xl relative z-10">
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
          {requestSent || (hasPendingRequest && !isNewUser) ? (
            /* Request Sent / Pending State */
            <motion.div
              key="pending"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
              className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-10 backdrop-blur-xl shadow-2xl text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-400/20 to-amber-500/10 border border-amber-500/20 flex items-center justify-center"
              >
                <Clock className="w-10 h-10 text-amber-400" />
              </motion.div>

              <h1 className="text-3xl font-bold text-white mb-3">
                {requestSent ? 'Access Request Sent!' : 'Access Request Pending'}
              </h1>
              <p className="text-zinc-400 text-lg mb-2">
                Welcome, <span className="text-white font-medium">{ssoUser.Name}</span>
              </p>
              <p className="text-zinc-500 max-w-md mx-auto mb-8 leading-relaxed">
                {requestSent
                  ? 'Your access request has been submitted successfully. The system administrator has been notified and will review your request shortly.'
                  : 'Your access request is being reviewed by the system administrator. You will receive an email notification once your request is processed.'
                }
              </p>

              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 mb-8 max-w-sm mx-auto">
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                  <span>Awaiting admin approval</span>
                </div>
                <div className="mt-3 text-xs text-zinc-600">
                  Requests are typically processed within 24 hours
                </div>
              </div>

              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  className="border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
                >
                  Refresh Status
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
              className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-10 backdrop-blur-xl shadow-2xl"
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
                
                <h1 className="text-3xl font-bold text-white mb-2">
                  Welcome to Digitalized DPR!
                </h1>
                <p className="text-zinc-400 mb-1">
                  Signed in as <span className="text-white font-medium">{ssoUser.Email}</span>
                </p>
                <p className="text-zinc-500 text-sm max-w-md mx-auto">
                  To get started, please request access by selecting your role below.
                  A notification will be sent to the admin for approval.
                </p>
              </div>

              {/* Role Selection Cards */}
              <div className="space-y-3 mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-3">
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
                        : 'border-zinc-800 bg-zinc-800/30 hover:border-zinc-700 hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{role.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-semibold">{role.label}</h3>
                          {selectedRole === role.id && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                            >
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            </motion.div>
                          )}
                        </div>
                        <p className="text-zinc-500 text-sm">{role.description}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Justification */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Justification <span className="text-zinc-600">(optional)</span>
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Briefly describe why you need access and your project/team..."
                  className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all resize-none h-24 text-sm"
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
                  className="border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
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
          className="text-center text-zinc-600 text-xs mt-8 tracking-wider"
        >
          &copy; {new Date().getFullYear()} ADANI RENEWABLES. ALL RIGHTS RESERVED.
        </motion.p>
      </div>
    </div>
  );
};

export default AccessPending;
