import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import apiClient from '@/services/apiClient';

const SSOLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoToken, setSsoToken] = useState('');

  const handleInitiateSSO = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await apiClient.post('/sso/initiate', { email });
      toast.success(response.data.message);

      // If we received an SSO token, we can use it directly
      if (response.data.ssoToken) {
        setSsoToken(response.data.ssoToken);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'SSO initiation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectSSOLogin = async () => {
    if (!ssoToken) {
      toast.error('No SSO token available');
      return;
    }

    try {
      const response = await apiClient.post('/sso/callback', { ssoToken });

      // Store tokens in localStorage
      localStorage.setItem('token', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.data.user));

      // Navigate to the appropriate dashboard based on role
      switch (response.data.user.Role) {
        case 'supervisor':
          navigate('/supervisor');
          break;
        case 'Site PM':
          navigate('/site-pm');
          break;
        case 'PMAG':
          navigate('/pmag');
          break;
        default:
          navigate('/projects');
      }

      toast.success('SSO login successful!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'SSO login failed');
    }
  };

  return (
    <div className="min-h-screen bg-black relative flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 glass-effect backdrop-blur-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              SSO Login
            </h2>
            <p className="text-muted-foreground">Login using Single Sign-On</p>
          </div>

          <form className="space-y-6" onSubmit={handleInitiateSSO}>
            <div>
              <Label htmlFor="email" className="text-foreground">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Sending SSO Link...' : 'Send SSO Login Link'}
            </Button>
          </form>

          {ssoToken && (
            <div className="mt-6 p-4 bg-blue-900/30 rounded-lg">
              <p className="text-sm text-blue-300 mb-2">SSO Token Received</p>
              <Button
                onClick={handleDirectSSOLogin}
                className="w-full"
                variant="secondary"
              >
                Login Directly with SSO Token
              </Button>
            </div>
          )}

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-primary hover:underline"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SSOLogin;
