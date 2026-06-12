import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface User {
  ObjectId: number;
  Name: string;
}

interface Project {
  ObjectId: number;
  Name: string;
  Location?: string;
  id?: number;
  name?: string;
}

interface AssignProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  assignedProjects: Project[];
  allProjects: Project[];
  loading: boolean;
  error: string;
  onAssign: (userId: number, projectIds: number[], sheetTypes: string[]) => Promise<void>;
}

const AVAILABLE_SHEETS = [
  { id: 'dp_qty', label: 'Daily Progress Quantity' },
  { id: 'manpower_details', label: 'Labour Days' },
  { id: 'dp_vendor_block', label: 'DP Vendor Block' },
  { id: 'dp_vendor_idt', label: 'DP Vendor IDT' }
];

export const AssignProjectModal: React.FC<AssignProjectModalProps> = ({
  isOpen,
  onClose,
  user,
  assignedProjects,
  allProjects,
  loading,
  error,
  onAssign
}) => {
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalYearFilter, setModalYearFilter] = useState('ALL');

  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) {
      setSelectedProjects([]);
      setSelectedSheets([]);
    }
  }, [isOpen]);

  // Extract FY year or fallback to StartDate (April-March FY)
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
        const month = date.getMonth(); // 0 is January
        const fyYear = month >= 3 ? year + 1 : year; // FY N is Apr Y to Mar Y+1
        return `FY${String(fyYear).slice(-2)}`;
      }
    }
    return '';
  };

  // Available years for filter
  const availableYears = React.useMemo(() => {
    const years = new Set<string>();
    allProjects.forEach(p => {
      const fy = extractFY(p);
      if (fy) years.add(fy);
    });
    return Array.from(years).sort();
  }, [allProjects]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProjects.length === 0) return;

    await onAssign(user.ObjectId, selectedProjects, selectedSheets);
    setSelectedProjects([]);
    setSelectedSheets([]);
  };

  // Get currently assigned project IDs
  const assignedProjectIds = assignedProjects.map(p => p.id || p.ObjectId);

  // Filter out already assigned projects and apply modal filters
  const availableProjects = allProjects.filter(p => {
    const pId = p.ObjectId || p.id;
    if (!pId) return false;
    if (assignedProjectIds.includes(pId)) return false;

    // Search filter
    if (modalSearchTerm) {
      const search = modalSearchTerm.toLowerCase();
      const pName = p.Name || p.name || "";
      if (!pName.toLowerCase().includes(search) && !pId.toString().includes(search)) {
        return false;
      }
    }

    // Year filter
    if (modalYearFilter !== 'ALL') {
      const fy = extractFY(p);
      if (fy !== modalYearFilter) return false;
    }

    return true;
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">Assign Projects to {user.Name}</h2>
          <Button variant="ghost" onClick={onClose} className="dark:text-white">
            <span className="text-2xl">&times;</span>
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm dark:bg-red-900/30 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mb-4">
          <h3 className="text-sm font-medium mb-2 dark:text-gray-300">Currently Assigned Projects:</h3>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 dark:text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Loading projects...</span>
            </div>
          ) : assignedProjects.length > 0 ? (
            <div className="space-y-1 mb-4">
              {assignedProjects.map((project: any, index: number) => (
                <div key={project.id || project.ObjectId || index} className="p-2 bg-gray-50 rounded text-sm dark:bg-gray-700 dark:text-white flex items-center">
                  <span className="font-mono text-[10px] bg-gray-200 dark:bg-gray-600 px-1 rounded mr-2 text-gray-600 dark:text-gray-300">
                    ID: {project.id || project.ObjectId}
                  </span>
                  {project.name || project.Name}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm mb-4 dark:text-gray-400">No projects currently assigned</p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
              <label className="text-sm font-medium dark:text-gray-300 whitespace-nowrap">Select Projects to Assign:</label>
              
              <div className="flex items-center gap-2">
                <div className="relative w-40">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input 
                    placeholder="Search..." 
                    className="h-8 pl-8 text-xs outline-none focus-visible:ring-1"
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={modalYearFilter} onValueChange={setModalYearFilter}>
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue placeholder="FY Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Years</SelectItem>
                    {availableYears.map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto border rounded p-2 dark:border-gray-700 dark:bg-gray-900">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 animate-spin text-gray-400 dark:text-gray-500" />
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading projects...</span>
                </div>
              ) : availableProjects.length > 0 ? (
                availableProjects.map((project: any) => {
                  const pId = project.ObjectId || project.id;
                  const pName = project.Name || project.name;
                  const pLoc = project.Location || project.location;
                  
                  return (
                    <div key={pId} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded dark:hover:bg-gray-700">
                      <input
                        type="checkbox"
                        id={`project-${pId}`}
                        checked={selectedProjects.includes(pId)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProjects([...selectedProjects, pId]);
                          } else {
                            setSelectedProjects(selectedProjects.filter(id => id !== pId));
                          }
                        }}
                        className="rounded dark:bg-gray-700 dark:border-gray-600"
                      />
                      <label htmlFor={`project-${pId}`} className="flex-1 cursor-pointer dark:text-gray-300">
                        <span className="font-mono text-[10px] bg-gray-100 dark:bg-gray-800 px-1 rounded mr-2 text-gray-500 border border-gray-200 dark:border-gray-700">
                          ID: {pId}
                        </span>
                        {pName} {pLoc && `- ${pLoc}`}
                      </label>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-sm dark:text-gray-400">No available projects</p>
              )}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 dark:text-gray-300">Select Permitted Sheets (Optional):</label>
            <div className="max-h-64 overflow-y-auto border rounded p-2 dark:border-gray-700 dark:bg-gray-900 grid grid-cols-1 gap-2">
              {AVAILABLE_SHEETS.map(sheet => (
                <div key={sheet.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    id={`sheet-${sheet.id}`}
                    checked={selectedSheets.includes(sheet.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSheets([...selectedSheets, sheet.id]);
                      } else {
                        setSelectedSheets(selectedSheets.filter(id => id !== sheet.id));
                      }
                    }}
                    className="rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                  <label htmlFor={`sheet-${sheet.id}`} className="flex-1 cursor-pointer text-sm dark:text-gray-300">
                    {sheet.label}
                  </label>
                </div>
              ))}
              <p className="text-xs text-gray-500 mt-2 ml-1 dark:text-gray-400">
                If no sheets are selected, the user will have access to all sheets by default.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="dark:border-gray-600 dark:text-gray-300">
              Cancel
            </Button>
            <Button type="submit" disabled={loading || selectedProjects.length === 0}>
              {loading ? 'Assigning...' : 'Assign Projects'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

