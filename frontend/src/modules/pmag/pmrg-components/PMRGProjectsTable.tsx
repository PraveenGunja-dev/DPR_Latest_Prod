import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Search as SearchIcon, FileText } from 'lucide-react';
import { useFilter } from '@/modules/auth/contexts/FilterContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

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
  const { searchTerm, setSearchTerm, typeFilter, setTypeFilter, yearFilter, setYearFilter } = useFilter();

  // Extract FY year from P6Id or fallback to StartDate (April-March FY)
  const extractFY = (project: any): string => {
    const p6Id = project.P6Id || project.p6Id || project.Id || '';
    if (p6Id) {
      const match = p6Id.match(/FY\d{2}/i);
      if (match) return match[0].toUpperCase();
    }
    
    // Fallback to date
    const startDate = project.PlannedStartDate || project.PlanStart || project.planStart || project.StartDate;
    if (startDate && startDate !== 'N/A') {
      const date = new Date(startDate);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = date.getMonth(); // 0 is Jan
        const fyYear = month >= 3 ? year + 1 : year; // FY is named by the year it ends in.
        return `FY${String(fyYear).slice(-2)}`;
      }
    }
    return '';
  };

  // Compute unique available years from projects
  const availableYears = React.useMemo(() => {
    const years = new Set<string>();
    projects.forEach(p => {
      const fy = extractFY(p);
      if (fy) years.add(fy);
    });
    return Array.from(years).sort();
  }, [projects]);

  // Apply filters
  const filteredProjects = React.useMemo(() => {
    return (Array.isArray(projects) ? projects : []).filter(project => {
      // Search term
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesName = (project.Name || "").toLowerCase().includes(search);
        const matchesLocation = (project.Location || "").toLowerCase().includes(search);
        const matchesId = (project.ObjectId || "").toString().includes(search);
        if (!matchesName && !matchesLocation && !matchesId) return false;
      }

      // Type filter
      if (typeFilter !== 'ALL') {
        const pType = (project.ProjectType || project.project_type || 'solar').toLowerCase();
        if (pType !== typeFilter.toLowerCase()) return false;
      }

      // Year filter
      if (yearFilter !== 'ALL') {
        const fy = extractFY(project);
        if (fy !== yearFilter) return false;
      }

      return true;
    });
  }, [projects, searchTerm, typeFilter, yearFilter]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      whileHover={{ y: -2 }}
    >
      <Card className="p-6 shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-bold">Projects</h3>
            <Badge variant="outline" className="h-6">
              {filteredProjects.length} Total
            </Badge>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative w-full md:w-64">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                className="pl-9 h-9 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Year Filter */}
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[120px] h-9 text-sm">
                <SelectValue placeholder="FY Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Years</SelectItem>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[120px] h-9 text-sm">
                <SelectValue placeholder="Project Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="solar">Solar</SelectItem>
                <SelectItem value="wind">Wind</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>

            <motion.div
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
            >
              <Button onClick={handleCreateProject} className="transition-all duration-200 px-3 py-1 h-9 gradient-adani text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Project
              </Button>
            </motion.div>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">ID</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Project</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Location</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Progress</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Timeline</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project, index) => {
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
                    <td className="py-3 px-4 text-xs font-mono text-gray-500">{project.ObjectId}</td>
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