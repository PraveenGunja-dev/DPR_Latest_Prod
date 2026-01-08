import React, { useState, useEffect } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { Navbar } from '@/components/Navbar';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { ChartsSection } from './ChartsSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAssignedProjects } from '@/modules/auth/services/projectService';

export const ChartsPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Fetch assigned projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoadingProjects(true);
        const assignedProjects = await getAssignedProjects();
        setProjects(assignedProjects);
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setLoadingProjects(false);
      }
    };

    fetchProjects();
  }, []);

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
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground">
              Data-driven insights for your project workflows
            </p>

            {/* Project Selector */}
            {!loadingProjects && projects.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Filter by Project:</label>
                <Select
                  value={selectedProjectId?.toString() || 'all'}
                  onValueChange={(value) => setSelectedProjectId(value === 'all' ? undefined : parseInt(value))}
                >
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map((project) => (
                      <SelectItem
                        key={project.id || project.objectId || project.ObjectId}
                        value={(project.id || project.objectId || project.ObjectId).toString()}
                      >
                        {project.name || project.Name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <ChartsSection projectId={selectedProjectId} />
        </motion.div>
      </div>
    </div>
  );
};