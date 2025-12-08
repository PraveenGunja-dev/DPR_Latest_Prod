import React from 'react';
import { Building, Calendar, TrendingUp, Users, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface Project {
  name: string;
  planStart: string;
  planEnd: string;
  actualStart: string;
  actualEnd: string;
  members: number;
}

interface ProjectListingProps {
  projects: Project[];
  onProjectClick?: (project: any) => void;
}

export const ProjectListing: React.FC<ProjectListingProps> = ({ projects, onProjectClick }) => {
  return (
    <div className="p-6 md:p-8">
      <div className="space-y-5 md:space-y-6">
        {projects.map((project, index) => (
          <Card 
            key={index}
            className="flex flex-col md:flex-row items-center md:items-start rounded-xl border border-border bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-300 p-5 md:p-6 cursor-pointer hover:border-primary"
            onClick={() => onProjectClick && onProjectClick(project)}
          >
            {/* Left side - Icon */}
            <div className="flex-shrink-0 mb-4 md:mb-0 md:mr-6">
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building className="text-primary" size={24} />
              </div>
            </div>
            
            {/* Middle content */}
            <div className="flex-grow w-full">
              <h3 className="text-lg md:text-xl font-bold text-foreground mb-3">{project.name}</h3>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6">
                <div className="flex items-center">
                  <Calendar className="text-[#22A04B] mr-2 flex-shrink-0" size={16} />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    PLAN: {project.planStart} → {project.planEnd}
                  </span>
                </div>
                
                <div className="flex items-center">
                  <TrendingUp className="text-blue-500 mr-2 flex-shrink-0" size={16} />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    ACTUAL: {project.actualStart} → {project.actualEnd}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Right side */}
            <div className="flex items-center mt-4 md:mt-0 w-full md:w-auto justify-between md:justify-normal md:space-x-6">
              <div className="flex items-center text-sm text-muted-foreground">
                <Users className="mr-1 flex-shrink-0" size={16} />
                <span className="whitespace-nowrap">{project.members} members</span>
              </div>
              
              <button 
                className="ml-4 flex-shrink-0 w-10 h-10 rounded-full bg-background border border-border shadow-sm hover:bg-muted transition-all duration-200 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  // Handle button click if needed
                }}
              >
                <ChevronRight className="text-primary" size={20} />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};