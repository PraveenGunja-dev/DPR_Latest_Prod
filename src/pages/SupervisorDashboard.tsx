import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, FileSpreadsheet, Package, DollarSign, CheckCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const SupervisorDashboard = () => {
  const location = useLocation();
  const { role, project } = location.state || { role: "Supervisor", project: { name: "Project" } };
  const [activeTab, setActiveTab] = useState("daily-input");

  const handleSubmit = () => {
    toast.success("Sheet submitted successfully!", {
      description: "Your data has been sent for PM review.",
    });
  };

  const dailyInputFields = [
    { label: "Date", value: "2024-01-15", readOnly: true },
    { label: "Shift", value: "Morning", readOnly: true },
    { label: "Activity Code", value: "ACT-001", readOnly: true },
    { label: "Resource Type", value: "", readOnly: false },
    { label: "Quantity Used", value: "", readOnly: false },
    { label: "Unit", value: "MT", readOnly: true },
    { label: "Progress %", value: "", readOnly: false },
    { label: "Remarks", value: "", readOnly: false },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar userName="John Supervisor" userRole={role} projectName={project.name} />

      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Supervisor Dashboard
          </h1>
          <p className="text-muted-foreground">Manage daily operations and data entry</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 glass-effect">
              <TabsTrigger value="daily-input" className="space-x-2">
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">Daily Input</span>
              </TabsTrigger>
              <TabsTrigger value="resources" className="space-x-2">
                <Package className="w-4 h-4" />
                <span className="hidden sm:inline">Resources</span>
              </TabsTrigger>
              <TabsTrigger value="boq" className="space-x-2">
                <DollarSign className="w-4 h-4" />
                <span className="hidden sm:inline">BOQ Data</span>
              </TabsTrigger>
              <TabsTrigger value="approvals" className="space-x-2">
                <CheckCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Approvals</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="daily-input" className="mt-6">
              <Card className="p-6 glass-effect">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Daily Input Sheet</h2>
                  <p className="text-sm text-muted-foreground">
                    Fields marked with <span className="text-primary">blue border</span> are editable. Others are auto-filled from P6.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {dailyInputFields.map((field, index) => (
                    <motion.div
                      key={field.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Label htmlFor={field.label} className="text-sm font-medium">
                        {field.label}
                      </Label>
                      <Input
                        id={field.label}
                        defaultValue={field.value}
                        readOnly={field.readOnly}
                        className={`mt-1 ${!field.readOnly ? 'border-primary focus:ring-primary' : 'bg-muted/50'}`}
                      />
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex justify-end"
                >
                  <Button
                    onClick={handleSubmit}
                    className="gradient-adani text-white hover:opacity-90 transition-opacity space-x-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Submit Sheet</span>
                  </Button>
                </motion.div>
              </Card>
            </TabsContent>

            <TabsContent value="resources" className="mt-6">
              <Card className="p-6 glass-effect">
                <h2 className="text-2xl font-bold mb-4">Resource Management</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-border">
                      <tr className="text-left">
                        <th className="pb-3 text-sm font-semibold text-muted-foreground">Resource</th>
                        <th className="pb-3 text-sm font-semibold text-muted-foreground">Type</th>
                        <th className="pb-3 text-sm font-semibold text-muted-foreground">Available</th>
                        <th className="pb-3 text-sm font-semibold text-muted-foreground">Allocated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        { name: "Labor - Skilled", type: "Human", available: 45, allocated: 38 },
                        { name: "Excavator", type: "Equipment", available: 5, allocated: 4 },
                        { name: "Cement", type: "Material", available: "500 MT", allocated: "320 MT" },
                      ].map((resource, i) => (
                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 text-sm font-medium">{resource.name}</td>
                          <td className="py-3 text-sm text-muted-foreground">{resource.type}</td>
                          <td className="py-3 text-sm">{resource.available}</td>
                          <td className="py-3 text-sm font-semibold text-primary">{resource.allocated}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="boq" className="mt-6">
              <Card className="p-6 glass-effect">
                <h2 className="text-2xl font-bold mb-4">BOQ Data Overview</h2>
                <p className="text-muted-foreground mb-4">Bill of Quantities tracking and updates</p>
                <div className="space-y-3">
                  {[
                    { item: "Concrete Works", planned: "2500 m³", actual: "1890 m³", variance: "-24%" },
                    { item: "Steel Framework", planned: "450 MT", actual: "398 MT", variance: "-12%" },
                    { item: "Electrical Fittings", planned: "1200 Units", actual: "1245 Units", variance: "+4%" },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center p-4 rounded-lg bg-muted/30">
                      <div>
                        <p className="font-medium">{item.item}</p>
                        <p className="text-sm text-muted-foreground">Planned: {item.planned} | Actual: {item.actual}</p>
                      </div>
                      <span className={`font-bold ${item.variance.startsWith('+') ? 'text-green-600' : 'text-orange-600'}`}>
                        {item.variance}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="approvals" className="mt-6">
              <Card className="p-6 glass-effect">
                <h2 className="text-2xl font-bold mb-4">Approval Status</h2>
                <div className="space-y-3">
                  {[
                    { sheet: "Daily Sheet - 14 Jan", status: "Approved", date: "15 Jan 2024" },
                    { sheet: "Daily Sheet - 13 Jan", status: "Pending", date: "14 Jan 2024" },
                    { sheet: "Daily Sheet - 12 Jan", status: "Revision Required", date: "13 Jan 2024" },
                  ].map((approval, i) => (
                    <div key={i} className="flex justify-between items-center p-4 rounded-lg border border-border hover:border-primary transition-colors">
                      <div>
                        <p className="font-medium">{approval.sheet}</p>
                        <p className="text-sm text-muted-foreground">{approval.date}</p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          approval.status === "Approved"
                            ? "bg-green-100 text-green-700"
                            : approval.status === "Pending"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {approval.status}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
};

export default SupervisorDashboard;
