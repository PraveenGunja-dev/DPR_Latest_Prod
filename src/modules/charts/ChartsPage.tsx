import React from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { Navbar } from '@/components/Navbar';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { ChartsSection } from './ChartsSection';

export const ChartsPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Navbar 
        userName={user?.Name || "User"} 
        userRole={user?.Role || "User"} 
      />
      
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Project Analytics</h1>
          </div>
          <p className="text-muted-foreground">
            Data-driven insights for your project workflows
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <ChartsSection />
        </motion.div>
      </div>
    </div>
  );
};