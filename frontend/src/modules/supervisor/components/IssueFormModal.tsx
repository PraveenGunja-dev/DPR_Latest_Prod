import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface IssueFormData {
  description: string;
  startDate: string;
  finishedDate: string;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  priority: "Low" | "Medium" | "High" | "Critical";
  actionRequired: string;
  remarks: string;
  attachment: File | null;
}

interface IssueFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: IssueFormData) => void;
  initialData?: Partial<IssueFormData>;
}

export function IssueFormModal({ open, onOpenChange, onSubmit, initialData = {} }: IssueFormModalProps) {
  const [formData, setFormData] = useState<IssueFormData>({
    description: initialData.description || "",
    startDate: initialData.startDate || "",
    finishedDate: initialData.finishedDate || "",
    status: initialData.status || "Open",
    priority: initialData.priority || "Medium",
    actionRequired: initialData.actionRequired || "",
    remarks: initialData.remarks || "",
    attachment: initialData.attachment || null,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (value: any) => {
    setFormData(prev => ({ ...prev, status: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({ ...prev, attachment: e.target.files![0] }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.description.trim()) {
      newErrors.description = "Description is required";
    }
    
    if (!formData.startDate) {
      newErrors.startDate = "Start date is required";
    }
    
    if (!formData.status) {
      newErrors.status = "Status is required";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    onSubmit(formData);
    
    // Reset form
    setFormData({
      description: "",
      startDate: "",
      finishedDate: "",
      status: "Open",
      priority: "Medium",
      actionRequired: "",
      remarks: "",
      attachment: null,
    });
    
    setErrors({});
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      // Reset form when dialog is closed
      if (!isOpen) {
        setFormData({
          description: "",
          startDate: "",
          finishedDate: "",
          status: "Open",
          priority: "Medium",
          actionRequired: "",
          remarks: "",
          attachment: null,
        });
        setErrors({});
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col overflow-hidden z-[9999]">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            type: "spring", 
            stiffness: 300, 
            damping: 30,
            duration: 0.3 
          }}
          className="flex flex-col h-full"
        >
          <DialogHeader className="gradient-adani px-6 py-4 flex-shrink-0 border-b border-white/10">
            <DialogTitle className="text-white">Add New Issue Log</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">
                  Description of Hindrance *
                </label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Enter description of the hindrance..."
                  className={errors.description ? "border-red-500" : ""}
                />
                {errors.description && <p className="text-sm text-red-500">{errors.description}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="startDate" className="text-sm font-medium">
                    Start Date *
                  </label>
                  <div className="relative">
                    <Input
                      id="startDate"
                      name="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={handleInputChange}
                      className={errors.startDate ? "border-red-500" : ""}
                    />
                    <Calendar className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                  </div>
                  {errors.startDate && <p className="text-sm text-red-500">{errors.startDate}</p>}
                </div>

                <div className="space-y-2">
                  <label htmlFor="finishedDate" className="text-sm font-medium">
                    Finished Date
                  </label>
                  <div className="relative">
                    <Input
                      id="finishedDate"
                      name="finishedDate"
                      type="date"
                      value={formData.finishedDate}
                      onChange={handleInputChange}
                    />
                    <Calendar className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="status" className="text-sm font-medium">
                    Issue Status *
                  </label>
                  <Select value={formData.status} onValueChange={(v: any) => handleSelectChange(v)}>
                    <SelectTrigger className={errors.status ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent className="z-[10000] bg-white border shadow-lg" position="popper">
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Resolved">Resolved</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.status && <p className="text-sm text-red-500">{errors.status}</p>}
                </div>

                <div className="space-y-2">
                  <label htmlFor="priority" className="text-sm font-medium">
                    Priority *
                  </label>
                  <Select value={formData.priority} onValueChange={(value: any) => setFormData(prev => ({ ...prev, priority: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent className="z-[10000] bg-white border shadow-lg" position="popper">
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="actionRequired" className="text-sm font-medium">
                  Action Required
                </label>
                <Textarea
                  id="actionRequired"
                  name="actionRequired"
                  value={formData.actionRequired}
                  onChange={handleInputChange}
                  placeholder="Enter required actions..."
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="remarks" className="text-sm font-medium">
                  Remarks
                </label>
                <Textarea
                  id="remarks"
                  name="remarks"
                  value={formData.remarks}
                  onChange={handleInputChange}
                  placeholder="Enter any additional remarks..."
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="attachment" className="text-sm font-medium">
                  Attachment
                </label>
                <Input
                  id="attachment"
                  type="file"
                  onChange={handleFileChange}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Issue Log</Button>
              </div>
            </form>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}