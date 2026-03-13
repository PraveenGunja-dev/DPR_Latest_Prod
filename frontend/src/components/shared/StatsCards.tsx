import React from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StatCard {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onClick?: () => void;
}

interface StatsCardsProps {
  stats: StatCard[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {stats.map((stat, index) => (
        <motion.div
          key={stat.title}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.1 * index, type: "spring", stiffness: 100 }}
          whileHover={stat.onClick ? { y: -5, transition: { duration: 0.2 } } : {}}
          onClick={stat.onClick}
        >
          <Card
            className={`relative overflow-hidden border border-border shadow-sm hover:shadow-lg transition-all duration-300 h-full
              ${stat.onClick ? 'cursor-pointer group' : ''}
              bg-card/95 backdrop-blur-sm
            `}
          >
            {/* Gradient Background Decoration */}
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-bl-full -mr-8 -mt-8 transition-transform duration-500 group-hover:scale-110`} />

            <div className="p-6 relative z-10 flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{stat.title}</p>
                <div className="flex items-baseline space-x-2">
                  <h3 className="text-3xl font-bold tracking-tight text-foreground">{stat.value}</h3>
                  {stat.trend && (
                    <Badge variant={stat.trend.isPositive ? "default" : "destructive"} className="h-5 px-1.5 text-[10px] uppercase">
                      {stat.trend.isPositive ? "+" : ""}{stat.trend.value}%
                    </Badge>
                  )}
                </div>
              </div>

              <div className={`
                w-12 h-12 rounded-xl flex items-center justify-center
                bg-gradient-to-br from-primary/10 to-secondary/10
                text-primary shadow-inner shadow-primary/5
                transition-all duration-300 group-hover:scale-110 group-hover:shadow-md
              `}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>

            {/* Bottom Accent Line */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
};