import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { Card } from "./ui/card";

interface RoleCardProps {
  role: string;
  icon: LucideIcon;
  description: string;
  onClick: () => void;
  delay?: number;
}

export const RoleCard = ({ role, icon: Icon, description, onClick, delay = 0 }: RoleCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 100 }}
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.98 }}
    >
      <Card
        onClick={onClick}
        className="relative overflow-hidden cursor-pointer p-8 glass-effect border-2 border-border hover:border-primary transition-all group"
      >
        <div className="absolute inset-0 gradient-adani opacity-0 group-hover:opacity-10 transition-opacity" />
        
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ x: "-100%" }}
          whileHover={{ x: "100%" }}
          transition={{ duration: 0.6 }}
        />
        
        <div className="relative z-10 flex flex-col items-center text-center space-y-4">
          <motion.div
            whileHover={{ rotate: 360 }}
            transition={{ duration: 0.6 }}
            className="p-4 rounded-full bg-gradient-to-br from-primary to-secondary"
          >
            <Icon className="w-8 h-8 text-primary-foreground" />
          </motion.div>
          
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-2">{role}</h3>
            <p className="text-muted-foreground">{description}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};
