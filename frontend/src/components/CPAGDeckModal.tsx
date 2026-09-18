import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Loader2, X } from "lucide-react";
import { CPAGDeckView } from "@/modules/supervisor/components/bess/CPAGDeckView";
import { getBessData } from "@/services/p6ActivityService";

interface CPAGDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | number;
  projectName?: string;
}

export const CPAGDeckModal: React.FC<CPAGDeckModalProps> = ({ isOpen, onClose, projectId, projectName }) => {
  const [loading, setLoading] = useState(false);
  const [dpQtyData, setDpQtyData] = useState<any[]>([]);
  const [chargingScheduleData, setChargingScheduleData] = useState<any[]>([]);
  const [civilData, setCivilData] = useState<any[]>([]);
  const [electricalData, setElectricalData] = useState<any[]>([]);
  const [testingData, setTestingData] = useState<any[]>([]);
  const [dailyRequirementData, setDailyRequirementData] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && projectId) {
      setLoading(true);
      
      const fetchAll = async () => {
        try {
          const [civ, ele, tst] = await Promise.all([
            getBessData(projectId, 'civil'),
            getBessData(projectId, 'electrical'),
            getBessData(projectId, 'testing')
          ]);
          const civData = civ.data || [];
          const eleData = ele.data || [];
          const tstData = tst.data || [];
          setCivilData(civData);
          setElectricalData(eleData);
          setTestingData(tstData);

          // Build dpQtyData by grouping raw P6 activities the same way
          // BessDashboard.aggregateCoveredToDPQty does: group by
          // (mainHeading, subHeading), sum scope and cumulative.
          const allActivities = [...civData, ...eleData, ...tstData];
          const groups = new Map<string, any[]>();
          allActivities.forEach(act => {
            const key = `${act.mainHeading || ''}||${act.subHeading || act.description || ''}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(act);
          });

          const dpRows: any[] = [];
          let slNo = 1;
          groups.forEach(group => {
            const first = group[0];
            const totalQty = group.reduce((s: number, a: any) =>
              s + (Number(a.scope) || Number(a.totalQuantity) || Number(a.totalScopeQty) || 0), 0);
            const totalCum = group.reduce((s: number, a: any) =>
              s + (Number(a.completed) || Number(a.cumulative) || Number(a.actual) || 0), 0);

            dpRows.push({
              activityId: first.activityId,
              slNo: String(slNo++),
              description: first.subHeading || first.description || '',
              mainHeading: first.mainHeading || '',
              totalQuantity: totalQty ? String(totalQty) : '',
              uom: first.uom || '',
              cumulative: totalCum ? String(totalCum) : '',
              balance: String(Math.max(0, totalQty - totalCum)),
            });
          });
          setDpQtyData(dpRows);
        } catch (err) {
          console.error("Error fetching CPAG data for modal", err);
        } finally {
          setLoading(false);
        }
      };
      
      fetchAll();
    }
  }, [isOpen, projectId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[100vw] w-screen h-screen max-h-screen flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 border-0 rounded-none sm:rounded-none">
        <DialogHeader className="px-6 py-4 border-b bg-white flex flex-row items-center justify-between shadow-sm shrink-0">
          <DialogTitle className="text-xl text-[#7030a0] font-bold">CPAG Deck</DialogTitle>
          <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-5 w-5 text-slate-500" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-100/50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-[#7030a0]" />
              <span className="ml-2 text-slate-500 font-medium">Loading CPAG data...</span>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <CPAGDeckView 
                projectId={Number(projectId)}
                projectName={projectName}
                dpQtyData={dpQtyData}
                chargingScheduleData={chargingScheduleData}
                civilData={civilData}
                electricalData={electricalData}
                testingData={testingData}
                dailyRequirementData={dailyRequirementData}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
