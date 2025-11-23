import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { RoleCard } from "@/components/RoleCard";
import { UserCog, Shield, CheckCircle2 } from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  const roles = [
    {
      role: "Supervisor",
      icon: UserCog,
      description: "Daily data entry and sheet submission",
      path: "/supervisor",
    },
    {
      role: "Project Manager",
      icon: Shield,
      description: "Review, modify, and approve workflows",
      path: "/pm",
    },
    {
      role: "PMRG",
      icon: CheckCircle2,
      description: "Advanced analytics and final approvals",
      path: "/pmrg",
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/30 to-background">
        <motion.div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, hsl(var(--adani-purple)) 0%, transparent 50%),
                             radial-gradient(circle at 80% 80%, hsl(var(--adani-blue)) 0%, transparent 50%)`,
          }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16 pt-12"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-block mb-6"
          >
            <div className="px-6 py-2 rounded-full gradient-adani-soft border border-primary/20">
              <span className="text-sm font-semibold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Enterprise Workflow Management
              </span>
            </div>
          </motion.div>

          <motion.h1
            className="text-6xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            Adani Workflow Manager
          </motion.h1>

          <motion.p
            className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            Role-Based Operational Workflow for Project Execution
          </motion.p>
        </motion.div>

        {/* Role Selection */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mb-12"
        >
          <h2 className="text-3xl font-bold text-center mb-8 text-foreground">
            Select Your Role
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {roles.map((role, index) => (
              <RoleCard
                key={role.role}
                role={role.role}
                icon={role.icon}
                description={role.description}
                onClick={() => navigate("/projects", { state: { role: role.role, path: role.path } })}
                delay={0.7 + index * 0.1}
              />
            ))}
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="max-w-4xl mx-auto mt-20"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            {[
              { title: "Real-time Sync", desc: "P6 integration with live data" },
              { title: "Secure Access", desc: "Role-based permissions" },
              { title: "Analytics", desc: "Comprehensive insights" },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 + i * 0.1 }}
                className="p-6 rounded-xl glass-effect border border-border"
              >
                <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Landing;
