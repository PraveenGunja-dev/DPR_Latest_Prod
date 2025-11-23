import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { ProjectCard } from "@/components/ProjectCard";
import { Navbar } from "@/components/Navbar";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Projects = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, path } = location.state || { role: "User", path: "/supervisor" };

  const projects = [
    {
      id: 1,
      name: "Adani Green Energy - Solar Plant",
      code: "AGE-SP-2024",
      progress: 67,
      metadata: {
        location: "Rajasthan",
        startDate: "Jan 2024",
      },
    },
    {
      id: 2,
      name: "Adani Port - Mundra Expansion",
      code: "APL-ME-2024",
      progress: 45,
      metadata: {
        location: "Gujarat",
        startDate: "Mar 2024",
      },
    },
    {
      id: 3,
      name: "Adani Gas - Pipeline Network",
      code: "AGL-PN-2024",
      progress: 82,
      metadata: {
        location: "Maharashtra",
        startDate: "Dec 2023",
      },
    },
    {
      id: 4,
      name: "Adani Power - Thermal Unit",
      code: "APW-TU-2024",
      progress: 38,
      metadata: {
        location: "Chhattisgarh",
        startDate: "Apr 2024",
      },
    },
  ];

  const handleProjectSelect = (project: typeof projects[0]) => {
    navigate(path, { state: { role, project } });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar userName="User" userRole={role} />

      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Role Selection
          </Button>

          <div className="text-center mb-12">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
            >
              Select Project
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-lg text-muted-foreground"
            >
              Choose a project to access your {role} dashboard
            </motion.p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {projects.map((project, index) => (
            <ProjectCard
              key={project.id}
              name={project.name}
              code={project.code}
              progress={project.progress}
              metadata={project.metadata}
              onClick={() => handleProjectSelect(project)}
              delay={0.3 + index * 0.1}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Projects;
