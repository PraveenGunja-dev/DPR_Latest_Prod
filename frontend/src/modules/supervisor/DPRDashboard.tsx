// src/modules/supervisor/DPRDashboard.tsx
import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import {
    FileText,
    AlertCircle,
    FileSpreadsheet,
    Grid3X3,
    Wrench,
    User,
    Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { 
    getDraftEntry, 
    saveDraftEntry, 
    submitEntry, 
    getTodayAndYesterday 
} from "@/services/dprService";
import { getAssignedProjects } from "@/services/projectService";
import { 
    getP6ActivitiesPaginated,
    getP6ActivitiesForProject, 
    mapActivitiesToDPQty,
    aggregateDPQtyByActivityName, 
    mapActivitiesToDPBlock, 
    mapActivitiesToDPVendorBlock,
    aggregateVendorBlockByActivityName,
    getManpowerDetailsData,
    aggregateManpowerByActivityName,
    mapActivitiesToDPVendorIdt, 
    getYesterdayValues, 
    getResourcesForProject 
} from "@/services/p6ActivityService";
import { toast } from "sonner";
import { formatDate } from "@/utils/formatters";
import { DPREntry, Project } from "@/types";

// Import the table components
import { DPQtyTable } from "./components/DPQtyTable";
import { DPVendorBlockTable } from "./components/DPVendorBlockTable";
import { ManpowerDetailsTable } from "./components/ManpowerDetailsTable";
import { DPBlockTable } from "./components/DPBlockTable";
import { DPVendorIdtTable } from "./components/DPVendorIdtTable";
import { ResourceTable } from "./components/ResourceTable";

const DPRDashboard = () => {
    const location = useLocation();
    const { user, token } = useAuth();

    const locationState = location.state || {};
    const projectName = locationState.projectName || "Project";
    const projectId = locationState.projectId || null;
    const projectDetails = locationState.projectDetails || null;
    const initialActiveTab = (locationState.activeTab || "dp_qty").replace(/-/g, '_');

    const [activeTab, setActiveTab] = useState(initialActiveTab);
    const [assignedProjects, setAssignedProjects] = useState<Project[]>([]);
    
    // DPR Entry state
    const [currentDraftEntry, setCurrentDraftEntry] = useState<DPREntry | null>(null);
    const { today, yesterday } = getTodayAndYesterday();

    // Table states
    const [dpQtyData, setDpQtyData] = useState<any[]>([]);
    const [dpBlockData, setDpBlockData] = useState<any[]>([]);
    const [dpVendorBlockData, setDpVendorBlockData] = useState<any[]>([]);
    const [manpowerDetailsData, setManpowerDetailsData] = useState<any[]>([]);
    const [dpVendorIdtData, setDpVendorIdtData] = useState<any[]>([]);
    const [mmsModuleRfiData, setMmsModuleRfiData] = useState<any[]>([]);
    const [resourceData, setResourceData] = useState<any[]>([]);
    const [totalManpower, setTotalManpower] = useState<number>(0);
    const [totalRows, setTotalRows] = useState<number>(0);
    const [universalFilter, setUniversalFilter] = useState<string>("CC");

    // Initialize data when draft entry or tab changes
    useEffect(() => {
        if (currentDraftEntry?.data_json) {
            const data = typeof currentDraftEntry.data_json === 'string' 
                ? JSON.parse(currentDraftEntry.data_json) 
                : currentDraftEntry.data_json;
            
            if (data.rows) {
                switch (activeTab) {
                    case 'dp_qty': setDpQtyData(data.rows); break;
                    case 'dp_block': setDpBlockData(data.rows); break;
                    case 'dp_vendor_block': setDpVendorBlockData(data.rows); break;
                    case 'manpower_details': 
                        setManpowerDetailsData(data.rows); 
                        if (data.totalManpower) setTotalManpower(data.totalManpower);
                        break;
                    case 'dp_vendor_idt': setDpVendorIdtData(data.rows); break;
                    case 'mms_module_rfi': setMmsModuleRfiData(data.rows); break;
                    case 'resource': setResourceData(data.rows); break;
                }
            }
        }
    }, [currentDraftEntry, activeTab]);

    // Fetch core data
    useEffect(() => {
        const fetchCoreData = async () => {
            try {
                const projects = await getAssignedProjects();
                setAssignedProjects(projects);
            } catch (e) {
                console.error('Error fetching projects', e);
            }

            if (projectId) {
                try {
                    const draft = await getDraftEntry(Number(projectId), activeTab);
                    setCurrentDraftEntry(draft);
                } catch (e) {
                    console.log('No draft found, using live P6 data');
                }
            }
        };
        if (token) fetchCoreData();
    }, [token, projectId, activeTab]);

    // Fetch P6 data if no draft
    useEffect(() => {
        const fetchP6Data = async () => {
            if (!projectId || !!currentDraftEntry) return;

            try {
                const [activitiesResponse, yesterdayData, manpowerDataRaw] = await Promise.all([
                    getP6ActivitiesPaginated(Number(projectId), 1, 5000),
                    getYesterdayValues(Number(projectId)),
                    getManpowerDetailsData(Number(projectId))
                ]);
                
                const activities = activitiesResponse.activities;
                setTotalRows(activitiesResponse.totalCount);
                // Mapper with yesterday merging logic
                // Match using stringActivityId (string like "ACL1-CC1020") since the API returns
                // activityId as numeric object_id which won't match the string activity IDs in rows.
                const mergeYesterday = (rows: any[], keyField: string) => rows.map((row, idx) => {
                    const rowKey = row[keyField];
                    const rowName = row.name || row.description || '';
                    const yVal = yesterdayData.activities?.find((a: any) => 
                        (a.stringActivityId !== undefined && String(a.stringActivityId) === String(rowKey)) || 
                        (a.activityId !== undefined && String(a.activityId) === String(rowKey)) ||
                        (a.name && rowName && String(a.name) === String(rowName))
                    );
                    return { 
                        ...row, 
                        slNo: String(idx + 1),
                        yesterday: yVal?.yesterdayValue || '', 
                        yesterdayValue: yVal?.yesterdayValue || '',
                        yesterdayIsApproved: yVal ? yVal.is_approved : undefined,
                        cumulative: yVal?.cumulativeValue ? String(yVal.cumulativeValue) : (row.cumulative || ''),
                    };
                });

                setDpQtyData(aggregateDPQtyByActivityName(mergeYesterday(mapActivitiesToDPQty(activities), 'activityId')) as any);
                setDpBlockData(mergeYesterday(mapActivitiesToDPBlock(activities), 'activityId'));
                setDpVendorBlockData(aggregateVendorBlockByActivityName(mergeYesterday(mapActivitiesToDPVendorBlock(activities), 'activityId')) as any);
                setManpowerDetailsData(aggregateManpowerByActivityName(mergeYesterday(manpowerDataRaw, 'activityId')) as any);
                setDpVendorIdtData(mergeYesterday(mapActivitiesToDPVendorIdt(activities), 'activityId'));
                
                toast.success("Loaded values from P6 activities");
            } catch (e) {
                console.error("P6 fetch error", e);
            }
        };
        fetchP6Data();
    }, [projectId, currentDraftEntry]);

    const handleSaveEntry = async (customData?: any) => {
        if (!projectId) return;
        try {
            let dataToSave: any = { rows: [] };
            const currentTab = activeTab;
            
            // Use provided data or fall back to state
            const targetData = customData || (
                currentTab === 'dp_qty' ? dpQtyData :
                currentTab === 'dp_block' ? dpBlockData :
                currentTab === 'dp_vendor_block' ? dpVendorBlockData :
                currentTab === 'manpower_details' ? manpowerDetailsData :
                currentTab === 'resource' ? resourceData :
                currentTab === 'dp_vendor_idt' ? dpVendorIdtData :
                currentTab === 'mms_module_rfi' ? mmsModuleRfiData : []
            );

            switch (currentTab) {
                case 'dp_qty': 
                    dataToSave = { 
                        rows: targetData,
                        totals: calculateTotals(targetData, ['totalQuantity', 'balance', 'cumulative', 'yesterday', 'today'])
                    }; 
                    break;
                case 'dp_block': dataToSave = { rows: targetData }; break;
                case 'dp_vendor_block': dataToSave = { rows: targetData }; break;
                case 'manpower_details': dataToSave = { rows: targetData, totalManpower }; break;
                case 'dp_vendor_idt': dataToSave = { rows: targetData }; break;
                case 'mms_module_rfi': dataToSave = { rows: targetData }; break;
                case 'resource': dataToSave = { rows: targetData }; break;
            }

            const draft = currentDraftEntry || await getDraftEntry(Number(projectId), currentTab);
            await saveDraftEntry(draft.id, dataToSave);
            toast.success("Draft saved");
            if (!currentDraftEntry) setCurrentDraftEntry(draft);
        } catch (e) {
            toast.error("Save failed");
        }
    };

    const calculateTotals = (rows: any[], fields: string[]) => {
        const totals: any = {};
        fields.forEach(field => {
            totals[field] = rows.reduce((sum, row) => {
                // Skip the "Total" row itself if it exists in the array
                if (row.description === "GRAND TOTAL" || row.isTotalRow) return sum;
                return sum + (Number(row[field]) || 0);
            }, 0);
        });
        return totals;
    };

    const handleSubmitEntry = async () => {
        if (!currentDraftEntry) return toast.error("Save first");
        try {
            await handleSaveEntry();
            await submitEntry(currentDraftEntry.id);
            toast.success("Submitted to PM");
            
            const updatedDraft = await getDraftEntry(Number(projectId), activeTab);
            setCurrentDraftEntry(updatedDraft);
        } catch (e) {
            toast.error("Submission failed");
        }
    };

    const handlePushToP6 = async () => {
        if (!currentDraftEntry) return;
        try {
            const { pushEntryToP6 } = await import("@/services/dprService");
            const resp = await pushEntryToP6(currentDraftEntry.id);
            if (resp.message) {
                toast.success(resp.message);
                const updatedDraft = await getDraftEntry(Number(projectId), activeTab);
                setCurrentDraftEntry(updatedDraft);
            }
        } catch (error) {
            toast.error("P6 Push failed");
        }
    };

    return (
        <motion.div className="min-h-screen bg-background" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Navbar userName={user?.name || user?.Name || "User"} userRole={user?.role || user?.Role || "supervisor"} projectName={projectName} />

            <div className="container mx-auto px-4 py-8">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-4 flex-wrap">
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                                DPR Entry Dashboard
                            </h1>
                            <div className="flex items-center">
                                <span className="text-sm font-medium mr-2 whitespace-nowrap hidden sm:block">Activity Filter:</span>
                                <Input 
                                    placeholder="e.g. MS, LD, SC..."
                                    value={universalFilter}
                                    onChange={e => setUniversalFilter(e.target.value)}
                                    className="h-8 md:h-9 w-[150px] md:w-[200px]"
                                />
                            </div>
                        </div>
                        <p className="text-muted-foreground text-sm">{projectName} | Date: {today}</p>
                    </div>
                    <div className="flex gap-4">
                        <Button onClick={handleSaveEntry} variant="outline" className="hidden sm:flex">Save Draft</Button>
                        <Button onClick={handleSubmitEntry} className="bg-green-600 hover:bg-green-700">
                             <Send className="w-4 h-4 mr-2" /> Submit to PM
                        </Button>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="flex flex-wrap h-auto bg-muted/50 p-1 mb-6">
                        <TabsTrigger value="dp_qty" className="flex-1 min-w-[120px]"><FileSpreadsheet className="w-4 h-4 mr-2"/> DP Qty</TabsTrigger>
                        <TabsTrigger value="dp_block" className="flex-1 min-w-[120px]"><Grid3X3 className="w-4 h-4 mr-2"/> DP Block</TabsTrigger>
                        <TabsTrigger value="dp_vendor_block" className="flex-1 min-w-[120px]"><Wrench className="w-4 h-4 mr-2"/> Vendor Block</TabsTrigger>
                        <TabsTrigger value="manpower_details" className="flex-1 min-w-[120px]"><User className="w-4 h-4 mr-2"/> Manpower</TabsTrigger>
                        <TabsTrigger value="resource" className="flex-1 min-w-[120px]"><Wrench className="w-4 h-4 mr-2"/> Resource</TabsTrigger>
                    </TabsList>

                    <AnimatePresence mode="wait">
                        <TabsContent key={activeTab} value={activeTab}>
                            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                                <Card className="p-4 overflow-hidden border-border bg-card shadow-sm">
                                    {activeTab === 'dp_qty' && (
                                        <DPQtyTable 
                                            data={dpQtyData} 
                                            setData={setDpQtyData} 
                                            onSave={handleSaveEntry} 
                                            isLocked={currentDraftEntry?.status !== 'draft'} 
                                            yesterday={yesterday}
                                            today={today}
                                            projectId={Number(projectId)}
                                            totalRows={totalRows}
                                            universalFilter={universalFilter}
                                        />
                                    )}
                                    {activeTab === 'dp_block' && (
                                        <DPBlockTable 
                                            data={dpBlockData} 
                                            setData={setDpBlockData} 
                                            onSave={handleSaveEntry} 
                                            isLocked={['approved_by_pm', 'final_approved'].includes(currentDraftEntry?.status)}
                                            yesterday={yesterday}
                                            today={today}
                                            totalRows={totalRows}
                                            universalFilter={universalFilter}
                                        />
                                    )}
                                    {activeTab === 'dp_vendor_block' && (
                                        <DPVendorBlockTable 
                                            data={dpVendorBlockData} 
                                            setData={setDpVendorBlockData} 
                                            onSave={handleSaveEntry} 
                                            isLocked={['approved_by_pm', 'final_approved'].includes(currentDraftEntry?.status)}
                                            yesterday={yesterday}
                                            today={today}
                                            totalRows={totalRows}
                                            universalFilter={universalFilter}
                                        />
                                    )}
                                    {activeTab === 'manpower_details' && (
                                        <ManpowerDetailsTable 
                                            data={manpowerDetailsData} 
                                            setData={setManpowerDetailsData} 
                                            totalManpower={totalManpower} 
                                            setTotalManpower={setTotalManpower} 
                                            onSave={handleSaveEntry} 
                                            isLocked={['approved_by_pm', 'final_approved'].includes(currentDraftEntry?.status)}
                                            yesterday={yesterday}
                                            today={today}
                                            totalRows={totalRows}
                                            universalFilter={universalFilter}
                                        />
                                    )}
                                    {activeTab === 'resource' && (
                                        <ResourceTable 
                                            data={resourceData} 
                                            setData={setResourceData} 
                                            onSave={handleSaveEntry} 
                                            onPush={currentDraftEntry?.status !== 'draft' ? handlePushToP6 : undefined}
                                            isLocked={['approved_by_pm', 'final_approved'].includes(currentDraftEntry?.status)}
                                            totalRows={totalRows}
                                            yesterday={yesterday}
                                            today={today}
                                            universalFilter={universalFilter}
                                        />
                                    )}
                                </Card>
                            </motion.div>
                        </TabsContent>
                    </AnimatePresence>
                </Tabs>
            </div>
        </motion.div>
    );
};

export default DPRDashboard;
