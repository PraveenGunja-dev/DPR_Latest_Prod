import React from 'react';
import { ChevronRight, AlertTriangle, FileText, UserPlus, RefreshCw, Clock, Database, Calendar, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, parseISO, isValid } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Project {
  id?: string | number;
  name: string;
  location?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  sheetTypes?: string[];
  parentEps?: string;
  projectType?: string;
  p6_last_sync?: string;
  p6_data_date?: string;
  p6_last_updated?: string;
  p6_last_user?: string;
  P6Id?: string;
  appStatus?: string;
  originalProject?: any;
}

interface ProjectListingProps {
  projects: Project[];
  onProjectClick?: (project: any) => void;
  userRole?: string;
  onSummaryClick?: (project: any) => void;
  onAssignClick?: (project: any) => void;
  onSyncClick?: (project: any) => void;
}

const formatDate = (dateValue?: string | Date | null, includeTime = false) => {
  if (!dateValue) return 'N/A';
  try {
    let date: Date;
    if (dateValue instanceof Date) {
      date = dateValue;
    } else {
      date = parseISO(dateValue);
      if (!isValid(date)) {
        date = new Date(dateValue);
      }
    }

    if (!isValid(date)) {
      return typeof dateValue === 'string' ? dateValue : 'N/A';
    }
    return format(date, includeTime ? 'MMM dd, yyyy HH:mm' : 'MMM dd, yyyy');
  } catch (e) {
    return typeof dateValue === 'string' ? dateValue : 'N/A';
  }
};

export const ProjectListing: React.FC<ProjectListingProps> = ({ projects, onProjectClick, userRole, onSummaryClick, onAssignClick, onSyncClick }) => {
  const showSummaryButton = userRole === 'Site PM' || userRole === 'PMAG' || userRole === 'Super Admin';
  const showAssignButton = userRole === 'Site PM' || userRole === 'PMAG' || userRole === 'Super Admin';
  const showSyncButton = userRole === 'Supervisor' || userRole === 'Site PM' || userRole === 'PMAG' || userRole === 'Super Admin';

  const formatSheetType = (sheetId: string) => {
    const sheetMap: Record<string, string> = {
      'dp_qty': 'DP Qty',
      'manpower_details': 'Manpower',
      'dp_vendor_block': 'Vendor Block',
      'dp_block': 'DP Block',
      'dp_vendor_idt': 'Vendor IDT',
    };
    return sheetMap[sheetId] || sheetId;
  };
  const getProjectTypeColor = (type?: string) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('solar')) return 'bg-orange-500/10 text-orange-600 border-orange-200';
    if (t.includes('wind')) return 'bg-cyan-500/10 text-cyan-600 border-cyan-200';
    if (t.includes('pss')) return 'bg-purple-500/10 text-purple-600 border-purple-200';
    return 'bg-slate-500/10 text-slate-600 border-slate-200';
  };


  return (
    <div className="py-2 sm:py-4">
      <div className="space-y-3">
        {projects.map((project, index) => (
          <Card
            key={index}
            className="rounded-xl border border-border bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-300 p-2 sm:p-3 cursor-pointer hover:border-primary/50 group"
            onClick={() => onProjectClick && onProjectClick(project)}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full">
              {/* LEFT GROUP */}
              <div className="flex items-center gap-4 sm:gap-6 flex-1 min-w-0">
                <div className="flex-shrink-0 w-20 sm:w-24 h-10 flex items-center justify-start sm:justify-center bg-white dark:bg-slate-900 rounded-lg p-1.5  dark:border-white/10">
                  <img
                    src={`${import.meta.env.BASE_URL}logo.png`}
                    alt="Logo"
                    className="h-7 w-auto object-contain"
                  />
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 capitalize">
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-800 dark:text-slate-100 truncate group-hover:text-primary transition-colors" title={project.name}>
                      {project.name}
                    </h3>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {(project.P6Id || project.id) && (
                        <span className="flex-shrink-0 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 rounded border border-slate-200 dark:border-slate-700 tracking-wide">
                          ID: {project.P6Id || project.id}
                        </span>
                      )}

                      {project.projectType && (
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-tighter ${getProjectTypeColor(project.projectType)}`}>
                          {project.projectType}
                        </span>
                      )}


                      {/* Supervisor Access Badges moved here for high-density layout */}
                      {userRole?.toLowerCase() === 'supervisor' && (
                        <>
                          {project.sheetTypes && project.sheetTypes.length > 0 ? (
                            project.sheetTypes.map((sheet, idx) => (
                              <span key={idx} className="px-2 py-0.5 text-[9px] font-bold bg-blue-50/50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-md border border-blue-100 dark:border-blue-800/50 uppercase whitespace-nowrap">
                                {formatSheetType(sheet)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-50/50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-md border border-emerald-100 dark:border-emerald-800/50 uppercase whitespace-nowrap">
                              All Access
                            </span>
                          )}
                        </>
                      )}

                      {project.appStatus === 'hold' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20 rounded-full uppercase tracking-tighter">
                          On Hold
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT GROUP */}
              <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0 mt-3 sm:mt-0">
                <TooltipProvider>
                  <div className="grid grid-cols-2 gap-4 mt-4 py-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-emerald-500" />
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 leading-none uppercase">Sync Date</span>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {formatDate(project.p6_last_sync, true)}
                        </span>
                      </div>
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 cursor-pointer">
                          <Calendar className="w-5 h-5 text-rose-500" />
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-bold text-slate-400 leading-none uppercase">P6 Updated</span>
                              <Info className="w-2.5 h-2.5 text-slate-300" />
                            </div>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                              {formatDate(project.p6_last_updated)}
                            </span>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px] p-3 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                            This project last Edited by
                          </p>
                          <div className="flex items-center gap-2 py-1">
                            <div className="p-1 rounded-full bg-slate-100 dark:bg-slate-800">
                              <UserPlus className="w-3.5 h-3.5 text-slate-600" />
                            </div>
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 break-all">
                              {project.p6_last_user}
                            </p>
                          </div>
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-1">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Full Time: {formatDate(project.p6_last_updated, true)}
                            </p>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>

                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 border-l border-slate-100 dark:border-slate-800 pl-4 sm:pl-6">
                  {showAssignButton && onAssignClick && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 sm:h-9 px-3 flex items-center gap-2 text-purple-600 bg-white dark:bg-slate-900 border-purple-200/60 hover:bg-purple-50 dark:hover:bg-purple-900/20 font-medium rounded-lg shadow-sm"
                      onClick={(e) => { e.stopPropagation(); onAssignClick(project); }}
                    >
                      <UserPlus size={15} />
                      <span className="hidden sm:inline">Assign</span>
                    </Button>
                  )}
                  {showSyncButton && onSyncClick && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 sm:h-9 px-3 flex items-center gap-2 text-blue-600 bg-white dark:bg-slate-900 border-blue-200/60 dark:hover:bg-blue-900/20 font-medium rounded-lg shadow-sm"
                      onClick={(e) => { e.stopPropagation(); onSyncClick(project); }}
                    >
                      <RefreshCw size={14} />
                      <span className="hidden xl:inline">Sync</span>
                    </Button>
                  )}
                  {showSummaryButton && onSummaryClick && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 sm:h-9 px-3 flex items-center gap-2 text-sky-600 bg-white dark:bg-slate-900 border-sky-200/60  dark:hover:bg-sky-900/20 font-medium rounded-lg shadow-sm"
                      onClick={(e) => { e.stopPropagation(); onSummaryClick(project); }}
                    >
                      <FileText size={15} />
                      <span className="hidden lg:inline">Summary</span>
                    </Button>
                  )}
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-all ml-1 shadow-sm">
                    <ChevronRight className="text-slate-500 dark:text-slate-400 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            </div>


          </Card>
        ))}
      </div>
    </div>
  );
};