import { motion } from "framer-motion";
import { Card } from "./ui/card";
import { Progress } from "./ui/progress";
import { Building2 } from "lucide-react";

interface ProjectCardProps {
  name: string;
  code: string;
  progress: number;
  metadata: {
    location: string;
    startDate: string;
  };
  onClick: () => void;
  delay?: number;
}

export const ProjectCard = ({ name, code, progress, metadata, onClick, delay = 0 }: ProjectCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 100 }}
      whileHover={{ scale: 1.03, y: -5 }}
      whileTap={{ scale: 0.98 }}
    >
      <Card
        onClick={onClick}
        className="relative overflow-hidden cursor-pointer p-6 glass-effect border-2 border-border hover:border-primary transition-all group"
      >
        <div className="absolute inset-0 gradient-adani-soft opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">{name}</h3>
                <p className="text-sm text-muted-foreground">{code}</p>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-semibold text-primary">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            
            <div className="flex justify-between text-sm pt-3 border-t border-border/50">
              <span className="text-muted-foreground">{metadata.location}</span>
              <span className="text-muted-foreground">{metadata.startDate}</span>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};
