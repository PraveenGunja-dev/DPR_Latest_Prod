import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar, AlertCircle, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface IssueFormData {
  id?: string | number;
  description: string;
  startDate: string;
  finishedDate?: string | null;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  priority: "Low" | "Medium" | "High" | "Critical";
  actionRequired: string;
  remarks: string;
  attachment: File | string | null;
  attachmentName?: string | null;
  location?: string;
  wbs?: string;
  activity?: string;
}

interface IssueFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: IssueFormData) => void;
  initialData?: Partial<IssueFormData>;
  activities?: any[];
  projectType?: string;
}

// Helper to sanitize WBS for backwards compatibility with older saved issues
const sanitizeInitialWbs = (wbs?: string) => {
  if (!wbs) return "";
  let clean = wbs.toUpperCase();
  let stripped = clean.replace(/^(WTG|Block|Plot)+[\s-]*0*\d+[\s-]*[:-]?\s*/i, '').trim();
  if (stripped) {
    clean = stripped;
  } else {
    const match = clean.match(/^(WTG|Block|Plot)+[\s-]*0*(\d+)/i);
    if (match) clean = `${match[1].toUpperCase()} ${match[2]}`;
  }
  return clean;
};

export function IssueFormModal({ open, onOpenChange, onSubmit, initialData = {}, activities = [], projectType = "" }: IssueFormModalProps) {
  const [formData, setFormData] = useState<IssueFormData>({
    id: initialData.id,
    description: initialData.description || "",
    startDate: initialData.startDate || "",
    finishedDate: initialData.finishedDate || "",
    status: initialData.status || "Open",
    priority: initialData.priority || "Medium",
    actionRequired: initialData.actionRequired || "",
    remarks: initialData.remarks || "",
    attachment: initialData.attachment || null,
    attachmentName: initialData.attachmentName || null,
    location: initialData.location || "",
    wbs: sanitizeInitialWbs(initialData.wbs),
    activity: initialData.activity || "",
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openLocationPopover, setOpenLocationPopover] = useState(false);
  const [openWbsPopover, setOpenWbsPopover] = useState(false);
  const [openActivityPopover, setOpenActivityPopover] = useState(false);
  // Helper to extract a normalized WTG number from any string containing a WTG reference
  const extractWtgNumber = (str: string): string | null => {
    const match = str.match(/WTG[\s\-_.]*0*(\d+[a-zA-Z]?)/i);
    if (!match) return null;
    const num = match[1].toUpperCase();
    // Exclude false positives from "33KV" electrical activities
    if (num === '33K' || num === '33KV') return null;
    return num;
  };

  // Helper to extract location strictly from the fields as per P6
  // Returns the NORMALIZED short form "WTG {N}" for consistent matching in WBS/Activity filters
  const getNormalizedLocation = (activity: any, pType: string) => {
    if (pType === 'wind') {
      const raw = activity.locations ? activity.locations.trim() : "";
      if (!raw) return "";
      const wtgNum = extractWtgNumber(raw);
      if (wtgNum) return `WTG ${wtgNum}`;
      return raw;
    } else {
      const raw = activity.block || activity.newBlockNom || activity.plot || "";
      if (!raw) {
         const match = (activity.name || "").match(/^(Block[-\s]*\d+)/i);
         if (match) return match[1];
      }
      return raw.trim();
    }
  };

  const locations = useMemo(() => {
    if (!activities.length) return [];

    if (projectType === 'wind') {
      // Build a map: WTG number -> best display name
      // Prefer long names like "WTG 1 - MP710" over short names like "WTG1"
      const wtgMap = new Map<string, string>(); // key: normalized number like "1", value: display name

      activities.forEach(a => {
        const raw = a.locations ? a.locations.trim() : "";
        if (raw) {
          const wtgNum = extractWtgNumber(raw);
          if (wtgNum) {
            const existing = wtgMap.get(wtgNum);
            // Keep the longer (more descriptive) name
            if (!existing || raw.length > existing.length) {
              wtgMap.set(wtgNum, raw);
            }
          }
        }
        // Also extract from description to catch WTGs not in locations field
        if (a.description) {
          const wtgNum = extractWtgNumber(a.description);
          if (wtgNum && !wtgMap.has(wtgNum)) {
            wtgMap.set(wtgNum, `WTG ${wtgNum}`);
          }
        }
      });

      return Array.from(wtgMap.values()).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });
    }

    // Non-wind projects
    const locs = new Set<string>();
    activities.forEach(a => {
      const locStr = getNormalizedLocation(a, projectType);
      if (locStr) locs.add(locStr.trim());
    });
    return Array.from(locs).sort((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [activities, projectType]);

  // For wind projects, match activities by WTG number since formData.location
  // may be a long-form name like "WTG 1 - MP710"
  const matchesSelectedLocation = (activity: any): boolean => {
    if (!formData.location) return false;
    if (projectType === 'wind') {
      const selectedNum = extractWtgNumber(formData.location);
      if (!selectedNum) return false;
      const activityNum = extractWtgNumber(activity.locations || activity.description || '');
      return selectedNum === activityNum;
    }
    return getNormalizedLocation(activity, projectType) === formData.location;
  };

  const wbsOptions = useMemo(() => {
    if (!formData.location || !activities.length) return [];
    const options = new Set<string>();
    activities.forEach(a => {
      if (matchesSelectedLocation(a)) {
        let cleanWbs = (a.mainHeading || a.wbsName || "").toUpperCase();
        if (cleanWbs) {
           let stripped = cleanWbs.replace(/^(WTG|Block|Plot)+[\s-]*0*\d+[\s-]*[:-]?\s*/i, '').trim();
           if (stripped) {
               options.add(stripped);
           } else {
               options.add(cleanWbs);
           }
        }
      }
    });
    
    if (formData.wbs && formData.wbs.trim()) {
      options.add(formData.wbs);
    }
    
    return Array.from(options).sort();
  }, [activities, formData.location, formData.wbs, projectType]);

  const activityOptions = useMemo(() => {
    if (!formData.location || !formData.wbs || !activities.length) return [];
    
    let filtered = activities.filter(a => {
      if (!matchesSelectedLocation(a)) return false;
      
      const wbsStr = (a.mainHeading || a.wbsName || a.activityGroup || a.description || "").toUpperCase();
      return wbsStr.includes(formData.wbs);
    });

    if (filtered.length === 0) {
      filtered = activities.filter(a => matchesSelectedLocation(a));
    }

    const result = filtered.map(a => ({
      id: a.activityId,
      name: a.description || a.name || a.activityId
    }));

    if (formData.activity && !result.find(r => r.id === formData.activity)) {
      result.unshift({ id: formData.activity, name: formData.activity });
    }

    return result;
  }, [activities, formData.location, formData.wbs, formData.activity, projectType]);

  useEffect(() => {
    if (open) {
      console.log("=== IssueFormModal OPENING ===");
      console.log("initialData:", JSON.stringify(initialData, null, 2));
      console.log("initialData.wbs:", initialData.wbs);
      console.log("initialData.activity:", initialData.activity);
      console.log("sanitizedWbs:", sanitizeInitialWbs(initialData.wbs));
      setFormData({
        id: initialData.id,
        description: initialData.description || "",
        startDate: initialData.startDate || "",
        finishedDate: initialData.finishedDate || "",
        status: initialData.status || "Open",
        priority: initialData.priority || "Medium",
        actionRequired: initialData.actionRequired || "",
        remarks: initialData.remarks || "",
        attachment: initialData.attachment || null,
        attachmentName: initialData.attachmentName || null,
        location: initialData.location || "",
        wbs: sanitizeInitialWbs(initialData.wbs),
        activity: initialData.activity || "",
      });
      setErrors({});
    }
  }, [open, initialData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (value: any) => {
    setFormData(prev => ({ ...prev, status: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Limit file size to 2MB to prevent bloating the database / browser memory
      if (file.size > 2 * 1024 * 1024) {
        alert("File size exceeds 2MB. Please select a smaller file or reduce its size.");
        e.target.value = "";
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ 
          ...prev, 
          attachment: reader.result as string, 
          attachmentName: file.name 
        }));
      };
      reader.readAsDataURL(file);
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
    
    if (!formData.location) {
      newErrors.location = "Location is required";
    }

    if (!formData.wbs) {
      newErrors.wbs = "WBS is required";
    }

    if (!formData.activity) {
      newErrors.activity = "Activity is required";
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
          attachmentName: null,
          location: "",
          wbs: "",
          activity: "",
        });
        setErrors({});
      }
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 flex flex-col overflow-hidden z-[9999]">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            type: "spring", 
            stiffness: 300, 
            damping: 30,
            duration: 0.3 
          }}
          className="flex flex-col h-full overflow-hidden"
        >
          <DialogHeader className="gradient-adani px-6 py-4 flex-shrink-0 border-b border-white/10">
            <DialogTitle className="text-white">{initialData.id ? "Edit Issue Log" : "Add New Issue Log"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
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

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

              {/* Second row: 4 columns for new filters */}
              {/* Second row: 4 columns for new filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2 flex flex-col justify-end">
                  <label className="text-sm font-medium">Location {projectType === 'wind' ? '(WTG)' : '(Block)'}</label>
                  <Popover open={openLocationPopover} onOpenChange={setOpenLocationPopover} modal={true}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openLocationPopover}
                        className="w-full justify-between h-10 font-normal border-input bg-background"
                      >
                        {formData.location ? formData.location : "Select Location"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0 z-[10000]" side="bottom">
                      <Command>
                        <CommandInput placeholder={`Search ${projectType === 'wind' ? 'WTG' : 'Block'}...`} />
                        <CommandList className="max-h-[150px]">
                          <CommandEmpty>No Location found.</CommandEmpty>
                          <CommandGroup>
                            {locations.map((loc) => (
                              <CommandItem
                                key={loc}
                                value={loc}
                                onSelect={(currentValue) => {
                                  // CommandItem usually converts value to lowercase, so we find the original case
                                  const originalLoc = locations.find(l => l.toLowerCase() === currentValue) || loc;
                                  setFormData(prev => ({ ...prev, location: originalLoc, wbs: "", activity: "" }));
                                  setOpenLocationPopover(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.location === loc ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {loc}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2 flex flex-col justify-end">
                  <label className="text-sm font-medium">WBS</label>
                  <Popover open={openWbsPopover} onOpenChange={setOpenWbsPopover} modal={true}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openWbsPopover}
                        disabled={!formData.location}
                        className="w-full justify-between h-10 font-normal border-input bg-background overflow-hidden"
                      >
                        <span className="truncate">{formData.wbs ? formData.wbs : "Select WBS"}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0 z-[10000]" side="bottom" align="start">
                      <Command>
                        <CommandInput placeholder="Search WBS..." />
                        <CommandList className="max-h-[250px]">
                          <CommandEmpty>No WBS found.</CommandEmpty>
                          <CommandGroup>
                            {wbsOptions.map((wbs) => (
                              <CommandItem
                                key={wbs}
                                value={wbs}
                                onSelect={(currentValue) => {
                                  const originalWbs = wbsOptions.find(w => w.toLowerCase() === currentValue) || wbs;
                                  setFormData(prev => ({ ...prev, wbs: originalWbs, activity: "" }));
                                  setOpenWbsPopover(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 shrink-0",
                                    formData.wbs === wbs ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {wbs}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2 flex flex-col justify-end md:col-span-2">
                  <label className="text-sm font-medium">Activity</label>
                  <Popover open={openActivityPopover} onOpenChange={setOpenActivityPopover} modal={true}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openActivityPopover}
                        disabled={!formData.wbs}
                        className="w-full justify-between h-10 font-normal border-input bg-background overflow-hidden"
                      >
                        <span className="truncate">
                          {formData.activity 
                            ? (activityOptions.find(a => a.id === formData.activity)?.name || formData.activity) 
                            : "Select Activity"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[450px] p-0 z-[10000]" side="bottom" align="start">
                      <Command>
                        <CommandInput placeholder="Search Activity..." />
                        <CommandList className="max-h-[300px]">
                          <CommandEmpty>No Activity found.</CommandEmpty>
                          <CommandGroup>
                            {activityOptions.map((act) => (
                              <CommandItem
                                key={act.id}
                                value={`${act.id} ${act.name}`}
                                onSelect={() => {
                                  setFormData(prev => ({ ...prev, activity: act.id }));
                                  setOpenActivityPopover(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 shrink-0",
                                    formData.activity === act.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="font-semibold text-xs text-muted-foreground">{act.id}</span>
                                  <span>{act.name}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
                <Button type="submit">{initialData.id ? "Save Changes" : "Create Issue Log"}</Button>
              </div>
            </form>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}