import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { StatsCard } from "@/components/StatsCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle, Clock, AlertCircle, Eye, Edit, Check } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const PMDashboard = () => {
  const location = useLocation();
  const { role, project } = location.state || { role: "PM", project: { name: "Project" } };

  const statsData = [
    { title: "Total Sheets", value: 156, icon: FileText, trend: { value: 12, isPositive: true } },
    { title: "Reviewed", value: 142, icon: CheckCircle, trend: { value: 8, isPositive: true } },
    { title: "Pending", value: 14, icon: Clock, trend: { value: 3, isPositive: false } },
    { title: "Revisions", value: 8, icon: AlertCircle, trend: { value: 2, isPositive: true } },
  ];

  const weeklyData = [
    { week: "Week 1", sheets: 32 },
    { week: "Week 2", sheets: 45 },
    { week: "Week 3", sheets: 38 },
    { week: "Week 4", sheets: 41 },
  ];

  const categoryData = [
    { name: "Labor", value: 35 },
    { name: "Materials", value: 28 },
    { name: "Equipment", value: 22 },
    { name: "Others", value: 15 },
  ];

  const timelineData = [
    { day: "Mon", approved: 12, pending: 3 },
    { day: "Tue", approved: 15, pending: 2 },
    { day: "Wed", approved: 10, pending: 5 },
    { day: "Thu", approved: 18, pending: 4 },
    { day: "Fri", approved: 14, pending: 3 },
  ];

  const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))"];

  const reviewQueue = [
    { id: "SH-2024-156", supervisor: "John Doe", time: "2 hours ago", status: "pending" },
    { id: "SH-2024-155", supervisor: "Jane Smith", time: "4 hours ago", status: "pending" },
    { id: "SH-2024-154", supervisor: "Mike Johnson", time: "1 day ago", status: "under-review" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar userName="Sarah Manager" userRole={role} projectName={project.name} />

      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            PM Dashboard
          </h1>
          <p className="text-muted-foreground">Review workflows and analytics</p>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statsData.map((stat, index) => (
            <StatsCard
              key={stat.title}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              trend={stat.trend}
              delay={index * 0.1}
            />
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="p-6 glass-effect">
              <h3 className="text-lg font-semibold mb-4">Weekly Sheets Processed</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="sheets" fill="url(#colorGradient)" radius={[8, 8, 0, 0]} />
                  <defs>
                    <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="hsl(var(--secondary))" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="p-6 glass-effect">
              <h3 className="text-lg font-semibold mb-4">Sheet Categories</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </motion.div>
        </div>

        {/* Timeline Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mb-8"
        >
          <Card className="p-6 glass-effect">
            <h3 className="text-lg font-semibold mb-4">Approval Timeline</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Line type="monotone" dataKey="approved" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="pending" stroke="hsl(var(--secondary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Review Queue */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card className="p-6 glass-effect">
            <h3 className="text-lg font-semibold mb-4">Review Queue</h3>
            <div className="space-y-3">
              {reviewQueue.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + index * 0.1 }}
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div>
                      <p className="font-medium text-foreground">{item.id}</p>
                      <p className="text-sm text-muted-foreground">
                        By {item.supervisor} • {item.time}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={item.status === "pending" ? "secondary" : "default"}>
                      {item.status === "pending" ? "Pending" : "Under Review"}
                    </Badge>
                    <Button variant="ghost" size="icon">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="hover:bg-green-100 hover:text-green-700">
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default PMDashboard;
