import React, { useState, useEffect } from 'react';
import { X, Table, BarChart3 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DPRSummarySection } from '@/modules/supervisor/components/DPRSummarySection';
import { SummaryCharts } from '@/components/SummaryCharts';
import {
    getP6ActivitiesPaginated,
    P6Activity,
    getDPQtyActivities,
    getManpowerDetailsData,
    mapActivitiesToDPQty,
    getYesterdayValues,
    getWindProgressActivities,
    getDerivedWindSummary
} from '@/services/p6ActivityService';
import { WindSummaryTable } from '@/modules/supervisor/components/wind/WindSummaryTable';
import { PSSSummaryTable } from '@/modules/supervisor/components/pss/PSSSummaryTable';

interface SummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string | number | null;
    projectName: string;
    projectType?: string;
    projectDetails?: any;
}

const EMPTY_ARRAY: any[] = [];

export const SummaryModal: React.FC<SummaryModalProps> = ({
    isOpen,
    onClose,
    projectId,
    projectName,
    projectType,
    projectDetails
}) => {
    const [activeView, setActiveView] = useState<'table' | 'charts'>('table');
    const [p6Activities, setP6Activities] = useState<P6Activity[]>([]);
    const [dpQtyData, setDpQtyData] = useState<any[]>([]);
    const [windSummaryData, setWindSummaryData] = useState<any[]>([]);
    const [pssSummaryData, setPssSummaryData] = useState<any[]>([]);
    const [manpowerDetailsData, setManpowerDetailsData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !projectId) return;

        const loadData = async () => {
            try {
                setLoading(true);

                // Calculate target date for yesterday's historical values
                const yesterdayDate = new Date();
                yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                const targetYesterday = yesterdayDate.toISOString().split('T')[0];

                // Fetch all data in parallel for efficiency
                const [actResp, qtyResp, mpData, yesterdayData] = await Promise.all([
                    getP6ActivitiesPaginated(String(projectId), 1, 5000),
                    getDPQtyActivities(String(projectId)),
                    getManpowerDetailsData(String(projectId)),
                    getYesterdayValues(String(projectId), targetYesterday)
                ]);

                // Create a map for yesterday's values for efficient lookups
                const yesterdayMap = new Map<string, { yesterday: number; cumulative: number; is_approved: boolean }>();
                if (yesterdayData && yesterdayData.activities) {
                    yesterdayData.activities.forEach(item => {
                        const val = {
                            yesterday: item.yesterdayValue,
                            cumulative: item.cumulativeValue,
                            is_approved: item.is_approved
                        };

                        // Map by all possible identifiers for reliability
                        if (item.activityObjectId) yesterdayMap.set(String(item.activityObjectId), val);
                        if (item.activityId) yesterdayMap.set(String(item.activityId), val);
                        if (item.stringActivityId) yesterdayMap.set(item.stringActivityId, val);
                        if (item.name) yesterdayMap.set(item.name.trim().toLowerCase(), val);
                    });
                }

                // Process P6 Activities with yesterday's values
                const baseActivities = actResp?.activities || [];
                const mergedActivities = baseActivities.map(activity => {
                    const yVal = yesterdayMap.get(String(activity.activityObjectId)) ||
                        (activity.activityId ? yesterdayMap.get(activity.activityId) : undefined) ||
                        (activity.name ? yesterdayMap.get(activity.name.trim().toLowerCase()) : undefined);

                    const cumulativeVal = yVal?.cumulative?.toString() ||
                        activity.cumulative || "";

                    return {
                        ...activity,
                        yesterday: yVal?.yesterday?.toString() || activity.yesterday || "",
                        cumulative: cumulativeVal,
                        yesterdayIsApproved: yVal?.is_approved !== undefined ? yVal.is_approved : true,
                    };
                });
                setP6Activities(mergedActivities);

                // Process DP Qty Data with yesterday's values
                const rawQty = qtyResp?.data || [];
                const mergedQty = rawQty.map(activity => {
                    const yVal = yesterdayMap.get(String(activity.activityObjectId)) ||
                        (activity.activityId ? yesterdayMap.get(activity.activityId) : undefined) ||
                        (activity.name ? yesterdayMap.get(activity.name.trim().toLowerCase()) : undefined);

                    const cumulativeVal = yVal?.cumulative?.toString() ||
                        activity.cumulative || "";

                    return {
                        ...activity,
                        yesterday: yVal?.yesterday?.toString() || activity.yesterday || "",
                        cumulative: cumulativeVal,
                        yesterdayIsApproved: yVal?.is_approved !== undefined ? yVal.is_approved : true,
                    };
                });

                // Map to DP Qty shape
                const mappedQty = mapActivitiesToDPQty(mergedQty);
                setDpQtyData(mappedQty);

                setManpowerDetailsData(mpData || []);

                // Specialized data for Wind/PSS
                const type = (projectType || '').toLowerCase();
                if (type === 'wind') {
                    const windRes = await getWindProgressActivities(String(projectId));
                    if (windRes && windRes.data) {
                        setWindSummaryData(getDerivedWindSummary(windRes.data));
                    }
                } else if (type === 'pss') {
                    // PSS summary is often mapped from DP Qty or directly from P6
                    const pssMapped = mappedQty.map(row => ({
                        description: row.description,
                        duration: (row as any).duration || '-',
                        startDate: row.basePlanStart,
                        endDate: row.basePlanFinish,
                        uom: row.uom,
                        scope: row.totalQuantity,
                        completed: row.cumulative,
                        balance: row.balance,
                        actualForecastStart: row.actualStart || row.forecastStart,
                        actualForecastFinish: row.actualFinish || row.forecastFinish,
                        remarks: row.remarks
                    }));
                    setPssSummaryData(pssMapped);
                }
            } catch (error) {
                console.error('Failed to fetch summary data:', error);
                setP6Activities([]);
                setDpQtyData([]);
                setWindSummaryData([]);
                setPssSummaryData([]);
                setManpowerDetailsData([]);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [isOpen, projectId]);

    // Reset to table view when modal opens
    useEffect(() => {
        if (isOpen) {
            setActiveView('table');
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="max-w-[98vw] w-[98vw] h-[95vh] p-0 flex flex-col overflow-hidden bg-white rounded-2xl border-slate-200 shadow-2xl z-[9000]"
            >
                <div className="h-full w-full flex flex-col min-h-0">
                    <DialogHeader className="flex-shrink-0 bg-white border-b px-6 py-4">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-xl font-black tracking-tight text-slate-800">
                                Summary – {projectName}
                            </DialogTitle>
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors border border-slate-300 shadow-sm"
                            >
                                <X className="h-4 w-4 text-slate-600" />
                            </button>
                        </div>

                        {/* View Toggle Tabs */}
                        <div className="mt-4">
                            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'table' | 'charts')}>
                                <TabsList className="grid w-[320px] grid-cols-2 bg-slate-100 p-1 border rounded-xl">
                                    <TabsTrigger value="table" className="flex items-center gap-2 font-bold py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all text-xs uppercase tracking-tighter">
                                        <Table className="h-3.5 w-3.5" />
                                        Activity Table
                                    </TabsTrigger>
                                    <TabsTrigger value="charts" className="flex items-center gap-2 font-bold py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all text-xs uppercase tracking-tighter">
                                        <BarChart3 className="h-3.5 w-3.5" />
                                        Analytics
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 min-h-0 bg-slate-50/30 relative flex flex-col">
                        {loading ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                                <div className="relative">
                                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-200 border-t-primary shadow-sm"></div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="h-2 w-2 bg-primary rounded-full animate-ping"></div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-sm font-black text-slate-800 uppercase tracking-[0.2em]">Syncing Data</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse text-center max-w-[200px]">
                                        Integrating DPR Progress & Historical Benchmarks...
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 min-h-0 w-full p-2 flex flex-col overflow-hidden">
                                {activeView === 'table' ? (
                                    <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
                                        {(projectType || '').toLowerCase() === 'wind' ? (
                                            <div className="flex-1 overflow-auto p-4">
                                                <WindSummaryTable data={windSummaryData} setData={setWindSummaryData} isLocked={true} />
                                            </div>
                                        ) : (projectType || '').toLowerCase() === 'pss' ? (
                                            <div className="flex-1 overflow-auto p-4">
                                                <PSSSummaryTable data={pssSummaryData} setData={setPssSummaryData} isLocked={true} />
                                            </div>
                                        ) : (
                                            <DPRSummarySection
                                                p6Activities={p6Activities || []}
                                                dpQtyData={dpQtyData || []}
                                                dpBlockData={EMPTY_ARRAY}
                                                dpVendorBlockData={EMPTY_ARRAY}
                                                dpVendorIdtData={EMPTY_ARRAY}
                                                manpowerDetailsData={manpowerDetailsData || []}
                                                projectName={projectName}
                                                projectDetails={projectDetails}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col">
                                        <SummaryCharts 
                                            p6Activities={p6Activities || []} 
                                            dpQtyData={dpQtyData || []}
                                            manpowerDetailsData={manpowerDetailsData || []}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
