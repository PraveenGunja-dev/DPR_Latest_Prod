import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { StatsCard } from "@/components/StatsCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileCheck, TrendingUp, Users, Award, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart } from "recharts";

const PMRGDashboard = () => {
  const location = useLocation();
  const { role, project } = location.state || { role: "PMRG", project: { name: "Project" } };

  const statsData = [
    { title: "Total Approvals", value: 324, icon: FileCheck, trend: { value: 15, isPositive: true } },
    { title: "Execution Rate", value: "87%", icon: TrendingUp, trend: { value: 5, isPositive: true } },
    { title: "Active Teams", value: 12, icon: Users, trend: { value: 2, isPositive: true } },
    { title: "Quality Score", value: "94%", icon: Award, trend: { value: 3, isPositive: true } },
  ];

  const monthlyPerformance = [
    { month: "Jan", planned: 85, actual: 78, efficiency: 92 },
    { month: "Feb", planned: 90, actual: 87, efficiency: 97 },
    { month: "Mar", planned: 88, actual: 91, efficiency: 103 },
    { month: "Apr", planned: 95, actual: 89, efficiency: 94 },
  ];

  const activityHeatmap = [
    { day: "Mon", morning: 85, afternoon: 92, evening: 78 },
    { day: "Tue", morning: 88, afternoon: 95, evening: 82 },
    { day: "Wed", morning: 90, afternoon: 88, evening: 85 },
    { day: "Thu", morning: 87, afternoon: 93, evening: 80 },
    { day: "Fri", morning: 92, afternoon: 89, evening: 88 },
  ];

  const rejectedSheets = [
    { id: "SH-2024-148", reason: "Incomplete resource data", supervisor: "John Doe", date: "2 days ago" },
    { id: "SH-2024-142", reason: "Progress variance too high", supervisor: "Jane Smith", date: "3 days ago" },
    { id: "SH-2024-138", reason: "Missing BOQ references", supervisor: "Mike Johnson", date: "5 days ago" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar userName="Robert Admin" userRole={role} projectName={project.name} />

      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            PMRG Dashboard
          </h1>
          <p className="text-muted-foreground">Advanced analytics and final approvals</p>
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

        {/* Monthly Performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <Card className="p-6 glass-effect">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Monthly Execution Performance</h3>
              <Badge className="gradient-adani text-white">
                <TrendingUp className="w-3 h-3 mr-1" />
                Trending Up
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyPerformance}>
                <defs>
                  <linearGradient id="colorPlanned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area type="monotone" dataKey="planned" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorPlanned)" />
                <Area type="monotone" dataKey="actual" stroke="hsl(var(--secondary))" fillOpacity={1} fill="url(#colorActual)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Activity Heatmap */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-8"
        >
          <Card className="p-6 glass-effect">
            <div className="flex items-center space-x-2 mb-4">
              <Activity className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Activity Heatmap</h3>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={activityHeatmap}>
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
                <Bar dataKey="morning" stackId="a" fill="hsl(var(--primary))" />
                <Bar dataKey="afternoon" stackId="a" fill="hsl(var(--secondary))" />
                <Bar dataKey="evening" stackId="a" fill="hsl(var(--accent))" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Rejected/Resubmitted Sheets */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="p-6 glass-effect">
            <h3 className="text-lg font-semibold mb-4">Rejected Sheets - Action Required</h3>
            <div className="space-y-3">
              {rejectedSheets.map((sheet, index) => (
                <motion.div
                  key={sheet.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + index * 0.1 }}
                  className="p-4 rounded-lg border-l-4 border-l-destructive bg-destructive/5 hover:bg-destructive/10 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <p className="font-semibold text-foreground">{sheet.id}</p>
                        <Badge variant="destructive">Rejected</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        <span className="font-medium">Reason:</span> {sheet.reason}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        By {sheet.supervisor} • {sheet.date}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="ml-4">
                      Review
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Multi-layer Approval Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-8"
        >
          <Card className="p-6 glass-effect">
            <h3 className="text-lg font-semibold mb-4">Multi-Layer Approval Pipeline</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { stage: "Supervisor", pending: 14, approved: 142 },
                { stage: "PM", pending: 8, approved: 126 },
                { stage: "PMRG (You)", pending: 5, approved: 118 },
              ].map((stage, i) => (
                <div key={i} className="p-4 rounded-lg bg-muted/30 border border-border">
                  <p className="text-sm font-medium text-muted-foreground mb-2">{stage.stage}</p>
                  <div className="flex items-baseline space-x-4">
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stage.approved}</p>
                      <p className="text-xs text-muted-foreground">Approved</p>
                    </div>
                    <div>
                      <p className="text-xl font-semibold text-orange-600">{stage.pending}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default PMRGDashboard;
