import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';

// Function to format date as YYYY-MM-DD
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "Not set";
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
};

interface PMRGProjectsTableProps {
  projects: any[];
  handleCreateProject: () => void;
}

export const PMRGProjectsTable: React.FC<PMRGProjectsTableProps> = ({ projects, handleCreateProject }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      whileHover={{ y: -2 }}
    >
      <Card className="p-6 shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h3 className="text-xl font-bold">Recent Projects</h3>
          <motion.div
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
          >
            <Button onClick={handleCreateProject} className="transition-all duration-200 px-3 py-1 h-8">
              <Plus className="w-4 h-4 mr-2" />
              Add Project
            </Button>
          </motion.div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Project</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Location</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Progress</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Timeline</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(projects) ? projects : []).slice(0, 5).map((project, index) => {
                // Ensure we have a unique key even if ObjectId is missing
                const uniqueKey = project.ObjectId ? `project-${project.ObjectId}` : `project-index-${index}`;

                return (
                  <motion.tr
                    key={uniqueKey}
                    className="border-b hover:bg-muted/50 transition-colors"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ backgroundColor: '#f9fafb' }}
                  >
                    <td className="py-3 px-4 font-medium">{project.Name}</td>
                    <td className="py-3 px-4">{project.Location}</td>
                    <td className="py-3 px-4">
                      <Badge variant={project.Status === "active" ? "default" : project.Status === "completed" ? "secondary" : "outline"}>
                        {project.Status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <div className="w-24 bg-secondary rounded-full h-2 mr-2">
                          <motion.div
                            className="bg-primary h-2 rounded-full"
                            style={{ width: `${project.PercentComplete}%` }}
                            initial={{ width: 0 }}
                            animate={{ width: `${project.PercentComplete}%` }}
                            transition={{ duration: 1, delay: 0.5 }}
                          ></motion.div>
                        </div>
                        <span>{project.PercentComplete}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {formatDate(project.PlannedStartDate)} - {formatDate(project.PlannedFinishDate)}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};