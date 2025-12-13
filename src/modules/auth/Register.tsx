import React, { useState } from 'react';
import { registerUser } from './services/authService';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { User } from './services/authService';

const RegisterForm = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredUser, setRegisteredUser] = useState({
    email: '',
    password: '',
    role: ''
  });
  
  const [formData, setFormData] = useState({
    Name: '',
    Email: '',
    password: '',
    Role: 'supervisor' as 'supervisor' | 'Site PM' | 'PMAG' | 'Super Admin'
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create user data object with correct property names for the API
      const userData: Omit<User, 'ObjectId'> = {
        Name: formData.Name,
        Email: formData.Email,
        password: formData.password,
        Role: formData.Role
      };
      
      await registerUser(userData);
      // Registration successful, show modal with user details
      setRegisteredUser({
        email: formData.Email,
        password: formData.password,
        role: formData.Role
      });
      setShowSuccessModal(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    // Navigate back to the PMAG dashboard
    navigate('/pmag');
  };

  return (
    <div className="min-h-screen bg-black relative flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 glass-effect backdrop-blur-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Register New User
            </h2>
            <p className="text-zinc-600">Create a new account for Adani Workflow</p>
          </div>
          
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={formData.Name}
                onChange={(e) => handleChange("Name", e.target.value)}
                placeholder="Enter full name"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.Email}
                onChange={(e) => handleChange("Email", e.target.value)}
                placeholder="Enter email address"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => handleChange("password", e.target.value)}
                placeholder="Create password"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="role">Role</Label>
              <Select value={formData.Role} onValueChange={(value) => handleChange("Role", value)}>
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
            
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Creating Account...' : 'Register User'}
            </Button>
          </form>
        </div>
      </div>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-green-500">User Created Successfully!</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4">The following user has been successfully registered:</p>
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
              <p><strong>Email:</strong> {registeredUser.email}</p>
              <p><strong>Password:</strong> {registeredUser.password}</p>
              <p><strong>Role:</strong> {registeredUser.role}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleModalClose}>Back to Dashboard</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RegisterForm;