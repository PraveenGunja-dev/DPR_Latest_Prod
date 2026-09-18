import React, { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getEDEngineeringData, getEDOrderingData, getEDDeliveryData, getBessData } from '@/services/p6ActivityService';
import { getProjectById, getUserProjects } from '@/services/projectService';
import { getCustomActivities } from '@/services/customActivityService';
import { getSCurveData } from '@/services/chartService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell, LabelList, AreaChart, Area, ComposedChart, Line } from 'recharts';
interface CPAGDeckViewProps {
  projectId: number;
  projectName?: string;
  dpQtyData: any[];
  chargingScheduleData: any[];
  civilData: any[];
  electricalData: any[];
  testingData: any[];
  dailyRequirementData: any[];
}

import { CivilDetailedTables } from './CivilDetailedTables';

const extractBlock = (str: string, item?: any) => {
  if (item && item._injectedBlock) return item._injectedBlock.toUpperCase();
  if (!str) return '';
  const match = str.match(/(?:pss|block)[\s-]*([0-9]+[a-z]*)/i);
  return match ? match[1].toUpperCase() : '';
};

export const CPAGDeckView: React.FC<CPAGDeckViewProps> = ({ 
  projectId,
  projectName,
  dpQtyData, 
  chargingScheduleData,
  civilData,
  electricalData,
  testingData,
  dailyRequirementData
}) => {
  const [engineeringData, setEngineeringData] = useState<any[]>([]);
  const [orderingData, setOrderingData] = useState<any[]>([]);
  const [deliveryData, setDeliveryData] = useState<any[]>([]);
  const [internalCivilData, setInternalCivilData] = useState<any[]>(civilData);
  const [internalDpQtyData, setInternalDpQtyData] = useState<any[]>(dpQtyData);
  const [projectData, setProjectData] = useState<any>(null);
  const [sCurveDataMap, setSCurveDataMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);

    const fetchAllData = async () => {
      try {
        const allProjects = await getUserProjects().catch(() => []);
        const targetBlocks = ['11', '12', '10B', '9', '5B', '8B'];
        const targetIds = new Set<string>();
        if (projectId) targetIds.add(String(projectId));
        
        const idToBlock = new Map<string, string>();
        // For S-Curve: pick the BEST project per block (prefer FINAL > current project > any)
        const blockCandidates = new Map<string, { id: string; name: string; priority: number }[]>();

        allProjects.forEach((p: any) => {
          const name = (p.name || p.Name || p.projectName || '').toUpperCase();
          if (name.includes('PSS')) {
            targetBlocks.forEach(blk => {
              // Use regex to ensure exact block match and prevent PSS-12 matching PSS-12B
              const regex = new RegExp(`PSS[_\\- ]?0?${blk}(?=[^0-9A-Za-z]|$)`);
              if (regex.test(name)) {
                const pId = String(p.id || p.object_id || p.projectId);

                // Rank candidates: FINAL gets highest priority, current project next, others lowest
                let priority = 0;
                if (name.includes('FINAL')) priority = 3;
                else if (projectId && pId === String(projectId)) priority = 2;
                else if (name.includes('NFA') || name.includes('NOT USED') || name.includes('DD ')) priority = -1;
                else priority = 1;

                if (!blockCandidates.has(blk)) blockCandidates.set(blk, []);
                blockCandidates.get(blk)!.push({ id: pId, name, priority });
              }
            });
          }
        });

        // Select the best project ID per block for S-Curve
        const bestIdPerBlock = new Map<string, string>();
        
        // Define activeProjectBlock here so it can be used in the loop below
        const fallbackBlk = extractBlock(projectName || projectData?.Name || projectData?.name || '');
        const activeProjectBlock = fallbackBlk;
        let activeBlock = fallbackBlk;

        blockCandidates.forEach((candidates, blk) => {
          candidates.sort((a, b) => b.priority - a.priority);
          
          if (projectId && blk.toUpperCase() === activeBlock.toUpperCase()) {
            bestIdPerBlock.set(blk, String(projectId));
            idToBlock.set(String(projectId), blk);
            targetIds.add(String(projectId));
          } else if (candidates.length > 0) {
            // Record the absolute best candidate for S-Curve fetching
            bestIdPerBlock.set(blk, candidates[0].id);
            
            // Add ALL candidates for Civil/Ordering. We will filter out empty ones after fetching!
            candidates.forEach(c => {
                idToBlock.set(c.id, blk);
                targetIds.add(c.id);
            });
          }
        });

        const orderingPromises = Array.from(targetIds).map(id => 
          getEDOrderingData(id as string | number)
            .then(res => ({ id: String(id), data: res?.data || [] }))
            .catch(() => ({ id: String(id), data: [] }))
        );
        
        const civilPromises = Array.from(targetIds).map(id =>
          getBessData(id as string | number, 'civil')
            .then(res => ({ id: String(id), data: res?.data || [] }))
            .catch(() => ({ id: String(id), data: [] }))
        );
        
        const mapCustom = (c: any) => ({
          activityId: c.id,
          name: c.description,
          description: c.description,
          mainHeading: c.category || '',
          subHeading: c.wbsName || c.description,
          scope: c.scope,
          totalQuantity: c.scope,
          uom: c.uom,
          completed: c.completed || 0,
          cumulative: c.completed || 0,
          actualStart: c.plannedStart,
          actualFinish: c.plannedFinish,
          status: (c.completed > 0) ? (c.completed >= c.scope ? 'Completed' : 'In Progress') : 'Not Started'
        });

        const customPromises = Array.from(targetIds).map(id =>
          Promise.all([
            getCustomActivities(id as string | number, 'bess_civil').catch(() => []),
            getCustomActivities(id as string | number, 'bess_dp_qty').catch(() => [])
          ]).then(([civ, dp]) => {
             const customActs = [...(civ || []), ...(dp || [])].map(mapCustom);
             return { id: String(id), data: customActs };
          })
        );

        const activeProjectId = projectId || Array.from(targetIds)[0] || null;
        const engRes = activeProjectId ? await getEDEngineeringData(activeProjectId).catch(() => null) : null;
        const delRes = activeProjectId ? await getEDDeliveryData(activeProjectId).catch(() => null) : null;
        
        const projRes = activeProjectId ? await getProjectById(activeProjectId as any).catch(() => null) : null;

        const responses = await Promise.all([...orderingPromises, ...civilPromises, ...customPromises]);
        const orderingResponses = responses.slice(0, orderingPromises.length);
        const civilResponsesRaw = responses.slice(orderingPromises.length, orderingPromises.length + civilPromises.length);
        const customResponses = responses.slice(orderingPromises.length + civilPromises.length);
        
        // Merge custom activities into raw civil data so user edits are reflected in the CPAG deck
        civilResponsesRaw.forEach(res => {
           const customRes = customResponses.find(cr => cr.id === res.id);
           if (customRes && customRes.data) {
               res.data = [...(res.data || []), ...customRes.data];
           }
        });
        
        const projData = projRes?.data ? projRes.data : projRes;
        
        const combinedOrderingData = orderingResponses.flatMap(res => {
          if (!res || !res.data) return [];
          const blk = idToBlock.get(res.id) || (res.id === String(projectId) ? fallbackBlk : '');
          return res.data.map((item: any) => ({
            ...item,
            _injectedBlock: blk
          }));
        });

        // Filter out empty responses and pick the single highest-priority project per block that ACTUALLY has data
        const blockToBestRes = new Map<string, any>();
        
        civilResponsesRaw.forEach(res => {
           if (!res || !res.data || res.data.length === 0) return; // Ignore empty projects!
           
           const blk = idToBlock.get(res.id) || (res.id === String(projectId) ? activeBlock : '');
           if (!blk) return;
           
           if (blk.toUpperCase() === activeBlock.toUpperCase() && res.id === String(projectId)) {
               blockToBestRes.set(blk.toUpperCase(), res);
               return;
           }
           
           if (!blockToBestRes.has(blk.toUpperCase())) {
               blockToBestRes.set(blk.toUpperCase(), res);
           } else {
               const existingRes = blockToBestRes.get(blk.toUpperCase());
               const existingCand = blockCandidates.get(blk)?.find(c => c.id === existingRes.id);
               const newCand = blockCandidates.get(blk)?.find(c => c.id === res.id);
               
               const existingPriority = existingCand ? existingCand.priority : 0;
               const newPriority = newCand ? newCand.priority : 0;
               
               if (newPriority > existingPriority) {
                   blockToBestRes.set(blk.toUpperCase(), res);
               }
           }
        });
        
        const finalCivilResponses = Array.from(blockToBestRes.values());

        // Inject the block name so we don't accidentally mix up data across blocks
        const combinedCivilData = finalCivilResponses.flatMap(res => {
          const blk = idToBlock.get(res.id) || (res.id === String(projectId) ? activeBlock : '');
          return res.data.map((item: any) => ({
            ...item,
            _injectedBlock: blk
          }));
        });

        setEngineeringData(engRes?.data || []);
        setOrderingData(combinedOrderingData);
        setDeliveryData(delRes?.data || []);
        setProjectData(projData);

        const finalCivil = combinedCivilData.length > 0 ? combinedCivilData : civilData;
        setInternalCivilData(finalCivil);

        // Build DP Qty format rows for ALL fetched blocks so that CivilDetailedTables
        // has aggregated user-friendly rows to match against for all projects (not just
        // the active project the modal was opened from).
        const groups = new Map<string, any[]>();
        finalCivil.forEach(act => {
          const key = `${act._injectedBlock || ''}||${act.mainHeading || ''}||${act.subHeading || act.description || ''}`;
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
            originalDescription: first.description || '',
            originalName: first.name || '',
            mainHeading: first.mainHeading || '',
            totalQuantity: totalQty ? String(totalQty) : '',
            uom: first.uom || '',
            cumulative: totalCum ? String(totalCum) : '',
            balance: String(Math.max(0, totalQty - totalCum)),
            block: first._injectedBlock || extractBlock(first.wbsName || first.description || '')
          });
        });

        // Merge with dpQtyData (which has the user edits for the active tab)
        // Since different projects might reuse the same activityId (like 'A1000'), 
        // we must be careful to only override the active project's rows.
        activeBlock = extractBlock(projectName || projData?.Name || projData?.name || '') || fallbackBlk;
        const finalDpQty = [...dpQtyData, ...dpRows.filter(r => r.block.toUpperCase() !== activeBlock.toUpperCase())];
        setInternalDpQtyData(finalDpQty);

        // Fetch S-Curve data ONLY for the best project per block (not all matching projects)
        const sCurveBlockIds = Array.from(bestIdPerBlock.entries());
        // Also include current project if it has a fallback block
        if (fallbackBlk && !bestIdPerBlock.has(fallbackBlk.toUpperCase())) {
          sCurveBlockIds.push([fallbackBlk.toUpperCase(), String(projectId)]);
        }

        const sCurvePromises = sCurveBlockIds.map(([blk, id]) =>
          getSCurveData(id)
            .then(data => ({ blk, data: data || [] }))
            .catch(() => ({ blk, data: [] as any[] }))
        );
        const sCurveResponses = await Promise.all(sCurvePromises);
        const sCurveMap: Record<string, any[]> = {};
        sCurveResponses.forEach(res => {
          if (res.blk && res.data.length > 0) {
            sCurveMap[res.blk.toUpperCase()] = res.data;
          }
        });
        setSCurveDataMap(sCurveMap);
      } catch (err) {
        console.error("Error fetching CPAG data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [projectId]);

  const commissioningPlan = useMemo(() => {
    if (!chargingScheduleData || chargingScheduleData.length === 0) return [];
    const blockDates = new Map<string, any>();
    chargingScheduleData.forEach(row => {
      const bNum = extractBlock(row.blockNo || '');
      if (bNum && !blockDates.has(bNum)) {
        blockDates.set(bNum, {
          block: bNum,
          idtChargingStart: row.idtChargingStart || '',
          trailRunEndDate: row.trailRunEndDate || '',
          cod: row.cod || ''
        });
      }
    });
    return Array.from(blockDates.values()).sort((a, b) => a.block.localeCompare(b.block));
  }, [chargingScheduleData]);

  const getSCurveDataForBlock = (blockName: string) => {
    const blockItems = (dpQtyData || []).filter(r => extractBlock(r.block || r.description || r.mainHeading) === blockName || true); 
    const totalScope = blockItems.reduce((acc, curr) => acc + (parseFloat(curr.totalQuantity) || 0), 0);
    const totalCompleted = blockItems.reduce((acc, curr) => acc + (parseFloat(curr.cumulative) || 0), 0);
    return { totalScope, totalCompleted };
  };

  const getConstructionProgress = (blockName: string) => {
    const filterBlock = (data: any[]) => data.filter(r => extractBlock(r.block || r.description || r.mainHeading, r) === blockName);
    const cData = filterBlock(internalCivilData);
    const eData = filterBlock(electricalData);
    const tData = filterBlock(testingData);

    const calcSum = (data: any[], key: string) => data.reduce((acc, curr) => acc + (parseFloat(curr[key]) || 0), 0);
    return {
      civilScope: calcSum(cData, 'scope'), civilCompleted: calcSum(cData, 'completed'),
      electricalScope: calcSum(eData, 'scope'), electricalCompleted: calcSum(eData, 'completed'),
      testingScope: calcSum(tData, 'scope'), testingCompleted: calcSum(tData, 'completed'),
    };
  };

  const getManpowerStatus = (blockName: string) => {
    // Simplified for now based on available dailyRequirementData
    const blockItems = (dailyRequirementData || []).filter(r => extractBlock(r.group) === blockName || true);
    const avgManpower = blockItems.reduce((acc, curr) => acc + (parseFloat(curr.avgManpower) || 0), 0);
    const peakManpower = blockItems.reduce((acc, curr) => Math.max(acc, parseFloat(curr.peakManpower) || 0), 0);
    return { avgManpower, peakManpower };
  };

  const majorMilestones = useMemo(() => {
    // Next 3 months milestones from Charging Schedule
    const now = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(now.getMonth() + 3);

    return chargingScheduleData.filter(r => {
      if (!r.trailRunEndDate) return false;
      const d = new Date(r.trailRunEndDate);
      return d >= now && d <= threeMonthsFromNow;
    });
  }, [chargingScheduleData]);

  const criticalIssues = useMemo(() => {
    // Activities delayed significantly (mock check)
    return dpQtyData.filter(r => r.status !== 'Completed' && r.forecastFinish).slice(0, 5); // Limit to top 5
  }, [dpQtyData]);

  const getEngStats = (block: string) => {
    if (!engineeringData || engineeringData.length === 0) return null;
    
    // Check if there are any activities explicitly tagged with this block
    let blockActs = engineeringData.filter(a => extractBlock(a.description || a.mainHeading || a.name || '') === block);
    
    // Use strictly database values. If no activities are specifically tagged for this block, 
    // it will naturally result in 0, accurately reflecting the database state.
    const total = blockActs.length;
    // Map P6 Status to the PPT Categories
    const catI = blockActs.filter(a => a.status === 'Completed').length; // Approved
    const catII = blockActs.filter(a => a.status === 'In Progress' && parseFloat(a.percent_complete) > 80).length; // Approved w/ comments
    const catIII = 0; // Not approved
    const catIV = blockActs.filter(a => a.status === 'In Progress' && parseFloat(a.percent_complete) <= 80).length; // For Info / Under Review
    const catIVStar = 0;

    const docsReceived = catI + catII + catIII + catIV + catIVStar;
    const underReview = catIV;
    const totalApproved = catI + catII + catIII + catIV + catIVStar; // J = D + E + F + G + H
    const approvedPct = total > 0 ? Math.round((totalApproved / total) * 100) : 0; // k = j / b

    return {
      total, docsReceived, catI, catII, catIII, catIV, catIVStar, underReview, totalApproved, approvedPct, dates: '-'
    };
  };

  const getPctScale = (data: any[]) => {
    const maxPct = Math.max(0, ...data.map(r => parseFloat(r.percent_complete) || 0));
    return maxPct <= 1 && maxPct > 0 ? 100 : 1;
  };

  const engPctScale = useMemo(() => getPctScale(engineeringData), [engineeringData]);
  const ordPctScale = useMemo(() => getPctScale(orderingData), [orderingData]);

  const blocksToTrack = ['11', '12', '10B', '9', '5B', '8B'];

  const Slide = ({ title, children, slideNumber }: { title: string, children: React.ReactNode, slideNumber: string }) => (
    <Card className="w-full max-w-[1400px] mx-auto mb-12 shadow-lg border-2 border-slate-200 aspect-[16/9] flex flex-col">
      <CardHeader className="bg-slate-50 border-b pb-4 shrink-0">
        <div className="flex justify-between items-center">
          <CardTitle className="text-2xl font-bold text-slate-800">{title}</CardTitle>
          <span className="text-base font-semibold text-slate-400">Slide {slideNumber}</span>
        </div>
      </CardHeader>
      <CardContent className="p-8 flex-1 flex flex-col bg-white overflow-hidden">
        {children}
      </CardContent>
    </Card>
  );

  const parsePackage = (name: string, scopeVal: string) => {
    if (!name) return { pkg: '-', qty: scopeVal && scopeVal !== '0' ? scopeVal : '0' };
    const str = String(name);
    const match = str.match(/^(.*?)\s*-\s*([0-9.]+\s*[a-zA-Z]+)$/);
    if (match) {
      const extractedQty = match[2].trim();
      const finalQty = (!scopeVal || scopeVal === '0') ? extractedQty : scopeVal;
      return { pkg: match[1].trim(), qty: finalQty };
    }
    return { pkg: str.trim(), qty: scopeVal && scopeVal !== '0' ? scopeVal : '0' };
  };

  const aggregateOrderingData = (data: any[]) => {
    const grouped = new Map<string, any>();
    
    data.forEach(item => {
      const rawName = item.packages || item.plot || item.description || item.name || '';
      const rawScope = item.scope != null ? `${item.scope} ${item.uom || ''}`.trim() : '0';
      const { pkg, qty } = parsePackage(rawName, rawScope);
      
      let standardizedPkg = pkg.toUpperCase().replace(' PACKAGE', '').trim();
      const key = standardizedPkg;
      
      const blk = getBlockForItem(item);
      const formattedQty = qty !== '0' && qty !== '-' ? qty.toUpperCase() : '';
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          ...item,
          displayPkg: pkg,
          quantitiesByBlock: new Map<string, { str: string, val: number }>()
        });
      }
      
      const existing = grouped.get(key);
      if (formattedQty && blk) {
        const numericQty = parseFloat(formattedQty) || 0;
        const currentMax = existing.quantitiesByBlock.get(blk)?.val || 0;
        // Keep the largest quantity found for each block
        if (numericQty > currentMax || !existing.quantitiesByBlock.has(blk)) {
          existing.quantitiesByBlock.set(blk, { str: formattedQty, val: numericQty });
        }
      }
    });
    
    const PREFERRED_ORDER = [
      // Supply Ordering
      'BATTERY CONTAINER',
      'STRUCTURAL MATERIAL',
      'OPTIC FIBRE CABLE (OFC)',
      'CONVERTER TRANSFORMER (CT)',
      'MV SWITCHGEAR',
      'HT CABLES',
      'LT 1C X 400 SQMM',
      'CONTROL CABLES',
      'CSS',
      'HARMONIC FILTER',
      'LT CABLE - 3.5X50 MM',
      'PCS',
      'EMS',
      'ACDB',
      'PRECAST STRUCTURE ORDERING',
      'SCADA CONTROL CABLE',
      // Service Ordering
      'DESIGN',
      'ENGINEERING',
      'CIVIL',
      'ERECTION',
      'TESTING',
      'COMMISSIONING'
    ];

    const result = Array.from(grouped.values()).map((item: any) => {
      // Extract just the string quantities from the map
      const quantities = Array.from(item.quantitiesByBlock.values() as Iterable<{str: string, val: number}>).map(q => q.str);
      
      return {
        ...item,
        // Sort quantities in descending order (e.g. 432 NOS, 384 NOS, 240 NOS) to match the mockup
        displayQty: quantities.length > 0 ? quantities.sort((a: string, b: string) => {
          const numA = parseFloat(a) || 0;
          const numB = parseFloat(b) || 0;
          return numB - numA;
        }) : ['0']
      };
    });
    
    // Sort to match standard E&D sheet line-wise sequence
    return result.sort((a: any, b: any) => {
      const keyA = (a.displayPkg || '').toUpperCase();
      const keyB = (b.displayPkg || '').toUpperCase();
      
      let indexA = PREFERRED_ORDER.findIndex(p => keyA.includes(p));
      let indexB = PREFERRED_ORDER.findIndex(p => keyB.includes(p));
      
      if (indexA === -1) indexA = 999;
      if (indexB === -1) indexB = 999;
      
      if (indexA !== indexB) {
        return indexA - indexB;
      }
      return keyA.localeCompare(keyB);
    });
  };

  const formatDateOnly = (dateStr: string) => {
    if (!dateStr || dateStr === '-') return '-';
    return dateStr.split('T')[0];
  };

  const renderPaginatedSlides = (title: string, rawData: any[], startSlideNumber: number, allocatedSlides: number) => {
    const data = aggregateOrderingData(rawData);
    const slides = [];
    const itemsPerSlide = 10;
    const numSlidesToRender = Math.max(1, Math.ceil(data.length / itemsPerSlide));
    
    for (let i = 0; i < numSlidesToRender; i++) {
      const slideData = data.slice(i * itemsPerSlide, (i + 1) * itemsPerSlide);
      
      slides.push(
        <Slide key={`${title}-${i}`} title={`${title}${i > 0 ? ' (Continued)' : ''}`} slideNumber={String(globalSlideNum++)}>
          <div className="overflow-x-auto w-full h-full flex flex-col">
            <table className="w-full text-xs text-left border-collapse border border-slate-300">
              <thead className="bg-[#912A82] text-[#FBFCFE]">
                <tr>
                  <th className="p-2 border border-slate-400 font-semibold text-center w-12 text-xs">SN</th>
                  <th className="p-2 border border-slate-400 font-semibold text-center text-xs">Equipment/ Package</th>
                  <th className="p-2 border border-slate-400 font-semibold text-center text-xs">Qty / Scope</th>
                  <th className="p-2 border border-slate-400 font-semibold text-center text-xs">Final / Revised Specifications Issue Date</th>
                  <th className="p-2 border border-slate-400 font-semibold text-center text-xs">Verified by Engineering consultant</th>
                  <th className="p-2 border border-slate-400 font-semibold text-center text-xs">TBER Date</th>
                  <th className="p-2 border border-slate-400 font-semibold text-center text-xs">Qualified Vendors</th>
                  <th className="p-2 border border-slate-400 font-semibold text-center text-xs">Receipt of Offer</th>
                  <th className="p-2 border border-slate-400 font-semibold text-center text-xs">Commercial NFA Submission</th>
                  <th className="p-2 border border-slate-400 font-semibold text-center text-xs">Release of PO / SO</th>
                  <th className="p-2 border border-slate-400 font-semibold text-center text-xs w-48">Update</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400 italic">
                      Loading ordering data...
                    </td>
                  </tr>
                ) : slideData.length > 0 ? (
                  slideData.map((item, idx) => {
                    const isAggregated = item.quantities && item.quantities.length > 1;
                    const textClass = isAggregated ? "text-emerald-700 font-bold" : "text-slate-800";
                    
                    return (
                      <tr key={idx} className="border-b hover:bg-slate-50 text-center text-[11px]">
                        <td className={`p-2 border border-slate-300 ${textClass}`}>{i * itemsPerSlide + idx + 1}</td>
                        <td className={`p-2 border border-slate-300 font-medium text-left ${textClass}`}>{item.displayPkg || '-'}</td>
                        <td className={`p-2 border border-slate-300 ${textClass}`}>
                          {Array.isArray(item.displayQty) ? item.displayQty.map((q: string, i: number) => (
                            <div key={i}>{q}</div>
                          )) : (item.displayQty || '-')}
                        </td>
                        <td className="p-2 border border-slate-300 text-slate-800">{formatDateOnly(item.prActualFinish || item.prForecastFinish || item.boqActualFinish || item.boqForecastFinish)}</td>
                        <td className="p-2 border border-slate-300 text-slate-800">-</td>
                        <td className="p-2 border border-slate-300 text-slate-800">{formatDateOnly(item.tberActualFinish || item.tberForecastFinish)}</td>
                        <td className="p-2 border border-slate-300 text-slate-800">{item.supplierOem || '-'}</td>
                        <td className="p-2 border border-slate-300 text-slate-800">-</td>
                        <td className="p-2 border border-slate-300 text-slate-800">{formatDateOnly(item.nfaActualFinish || item.nfaForecastFinish)}</td>
                        <td className="p-2 border border-slate-300 text-slate-800">{formatDateOnly(item.posoActualFinish || item.posoForecastFinish)}</td>
                        <td className="p-2 border border-slate-300 text-slate-800 text-left">{item.status || '-'}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="p-12 text-center text-slate-400 italic">
                      Supply / Service Ordering - No data available in DB for this section
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Slide>
      );
    }
    return slides;
  };

  const getBlockForItem = (item: any) => {
    if (item._injectedBlock) return item._injectedBlock;
    let b = extractBlock(item.description || item.name || item.wbs_name || '');
    if (b) return b;
    const projName = projectData?.Name || projectData?.name;
    if (projName) {
      b = extractBlock(projName);
      if (b) return b;
    }
    // Bulletproof fallback: if we absolutely cannot determine the block, default to '11' 
    // so the data at least shows up in the first set of slides instead of disappearing.
    return '11';
  };

  const getFormattedDate = () => {
    const d = new Date();
    const day = d.getDate();
    const suffix = ["th", "st", "nd", "rd"][(day % 10 > 3 ? 0 : (day % 100 - day % 10 !== 10 ? day % 10 : 0))] || "th";
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear().toString().slice(-2);
    return `${day}${suffix} ${month} ${year}`;
  };

  const isBessRelated = (item: any) => {
    const text = `${item.packages || ''} ${item.description || ''} ${item.name || ''} ${item.wbsName || ''}`.toUpperCase();
    
    // Exclude packages that are explicitly for Wind (WTG) in hybrid projects
    if (text.includes('WTG') || text.includes('WIND') || text.includes('STONE COLUMN') || text.includes('CRANE PAD')) return false;
    if (text.includes('TURNING RADIUS') || text.includes('USS FOUNDATION') || text.includes('ELECTRICAL USS')) return false;
    if (text.includes('HT CABLE LAYING')) return false; // Excluded as per the 6-package E&D list
    
    // Exclude additional Wind Supply items
    if (text.includes('ANCHOR BOLT') || text.includes('ANCHOR FLANGE') || text.includes('REINFORCEMENT STEEL')) return false;
    if (text.includes('USS PRECAST') || text.includes('USS TRANSFORMER') || text.includes('USS HT PANEL')) return false;
    if (text.includes('33KV FO CABLE') || text.includes('33KV HT CABLE')) return false;
    if (text.includes('BALANCE SUPPLY ITEMS') || text === 'STRUCTURE MATERIAL') return false;
    
    // Note: SCADA & PPC (item 21) is likely Wind PPC, but BESS has SCADA Control Cable (item 16). 
    // We'll exclude exact 'SCADA & PPC'
    if (text.includes('SCADA & PPC')) return false;
    
    return true;
  };

  const isSupply = (item: any) => {
    if (!isBessRelated(item)) return false;
    if (!item.mainHeading) return true;
    const h = item.mainHeading.toUpperCase();
    return h === 'SUPPLY' || h === 'SUPPLY ORDERING' || (h.includes('SUPPLY') && !h.includes('SERVICE'));
  };

  const isService = (item: any) => {
    if (!isBessRelated(item)) return false;
    if (!item.mainHeading) return false;
    const h = item.mainHeading.toUpperCase();
    return h === 'SERVICES' || h === 'SERVICE' || h === 'SERVICE ORDERING' || (h.includes('SERVICE') && h.includes('ORDERING'));
  };

  let globalSlideNum = 1;

  return (
    <div className="p-8 bg-slate-100 min-h-screen overflow-y-auto font-sans">
      <div className="max-w-[1400px] mx-auto mb-8 text-center">
        <h1 className="text-4xl font-extrabold text-slate-800">CPAG Deck Dashboard</h1>
      </div>

      {/* Cover Slide */}
      <Card className="w-full max-w-[1400px] mx-auto mb-12 shadow-lg border-2 border-slate-200 aspect-[16/9] flex flex-col relative overflow-hidden bg-white">
        {/* Adani Logo - top left */}
        <div className="absolute top-8 left-12 z-10">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="h-16 object-contain" />
        </div>
        
        {/* Title text - centered */}
        <div className="flex-1 flex flex-col items-center justify-center text-center relative z-10 pb-52">
          <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">Battery Energy Storage Systems</h2>
          <h3 className="text-3xl font-bold text-blue-600 mt-1">Projects : FY 2026 – 27</h3>
          <div className="w-56 h-1 bg-gradient-to-r from-green-500 via-blue-500 to-red-500 mt-3 rounded-full"></div>
          <p className="text-xl font-bold text-slate-900 mt-4">{getFormattedDate()}</p>
        </div>

        {/* Adani coverPhoto illustration at the bottom */}
        <div className="absolute bottom-0 left-0 w-full">
          <img 
            src={`${import.meta.env.BASE_URL}coverPhoto.png`} 
            alt="Adani Cover" 
            className="w-full object-cover object-bottom"
          />
        </div>
      </Card>

      <Slide title="Project Capacity" slideNumber={String(globalSlideNum++)}>
        <div className="flex w-full h-full items-center px-12">
          {/* Left side Logo */}
          <div className="w-1/3 flex flex-col items-center justify-center">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="h-28 object-contain mb-2" />
            <p className="text-4xl font-semibold text-slate-500 tracking-wide">Renewables</p>
          </div>
          
          {/* Right side Table */}
          <div className="w-2/3 pl-16 flex flex-col justify-center">
            <table className="w-full text-center border-collapse border border-slate-800 shadow-md text-lg">
              <thead>
                <tr className="bg-[#8b6b9e] text-slate-900">
                  <th className="p-4 border border-slate-800 font-bold">PSS</th>
                  <th className="p-4 border border-slate-800 font-bold">Power</th>
                  <th className="p-4 border border-slate-800 font-bold">Energy</th>
                  <th className="p-4 border border-slate-800 font-bold">Dispatchable Energy</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                <tr className="bg-white hover:bg-slate-100"><td className="p-4 border border-slate-800">PSS-11</td><td className="p-4 border border-slate-800">1080 MW</td><td className="p-4 border border-slate-800">2436 MWh</td><td className="p-4 border border-slate-800">2210 MWh</td></tr>
                <tr className="bg-slate-50 hover:bg-slate-100"><td className="p-4 border border-slate-800">PSS-12</td><td className="p-4 border border-slate-800">960 MW</td><td className="p-4 border border-slate-800">2166 MWh</td><td className="p-4 border border-slate-800">1963 MWh</td></tr>
                <tr className="bg-white hover:bg-slate-100"><td className="p-4 border border-slate-800">PSS-10(B)</td><td className="p-4 border border-slate-800">600 MW</td><td className="p-4 border border-slate-800">1204 MWh</td><td className="p-4 border border-slate-800">1078 MWh</td></tr>
                <tr className="bg-slate-50 hover:bg-slate-100"><td className="p-4 border border-slate-800">PSS-09</td><td className="p-4 border border-slate-800">1080 MW</td><td className="p-4 border border-slate-800">2436 MWh</td><td className="p-4 border border-slate-800">2209 MWh</td></tr>
                <tr className="bg-white hover:bg-slate-100"><td className="p-4 border border-slate-800">PSS-05(B)</td><td className="p-4 border border-slate-800">1120 MW</td><td className="p-4 border border-slate-800">2527 MWh</td><td className="p-4 border border-slate-800">2284 MWh</td></tr>
                <tr className="bg-slate-50 hover:bg-slate-100"><td className="p-4 border border-slate-800">PSS-08(B)</td><td className="p-4 border border-slate-800">420 MW</td><td className="p-4 border border-slate-800">843 MWh</td><td className="p-4 border border-slate-800">758 MWh</td></tr>
                <tr className="bg-[#dcd3e3] font-bold"><td className="p-4 border border-slate-800 text-black">Total</td><td className="p-4 border border-slate-800 text-black">5260 MW</td><td className="p-4 border border-slate-800 text-black">11612 MWh</td><td className="p-4 border border-slate-800 text-black">10502 MWh</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </Slide>
      <Slide title="Salient Features" slideNumber={String(globalSlideNum++)}>
        <div className="flex flex-col items-center justify-center h-full flex-1 text-slate-400 italic border-2 border-dashed border-slate-200 rounded-lg p-12">
          <p>Salient Features Data - Placeholder</p>
        </div>
      </Slide>
      <Slide title="Overall Layout" slideNumber={String(globalSlideNum++)}>
        <div className="flex flex-col items-center justify-center h-full flex-1 text-slate-400 italic border-2 border-dashed border-slate-200 rounded-lg p-12">
          <p>Site Layout Map - Placeholder</p>
        </div>
      </Slide>

      <Slide title="Commissioning Plan" slideNumber={String(globalSlideNum++)}>
        {commissioningPlan.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-3 border">Block / PSS</th>
                  <th className="p-3 border">IDT Charging Start</th>
                  <th className="p-3 border">Trail Run End Date</th>
                  <th className="p-3 border">COD</th>
                </tr>
              </thead>
              <tbody>
                {commissioningPlan.map((plan, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50">
                    <td className="p-3 border font-semibold">PSS-{plan.block}</td>
                    <td className="p-3 border">{plan.idtChargingStart || '-'}</td>
                    <td className="p-3 border">{plan.trailRunEndDate || '-'}</td>
                    <td className="p-3 border">{plan.cod || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full flex-1 text-slate-400 italic border-2 border-dashed border-slate-200 rounded-lg p-12">
            <p>Commissioning Plan - No data available in DB</p>
          </div>
        )}
      </Slide>


      {/* S-Curves */}
      {blocksToTrack.map((block, index) => {
        const stats = getSCurveDataForBlock(block);
        const sCurveData = sCurveDataMap[block.toUpperCase()] || [];

        // Compute monthly (non-cumulative) values from cumulative data
        const chartData = sCurveData.map((d: any, i: number) => {
          const prevPlanned = i > 0 ? (sCurveData[i - 1].planned ?? 0) : 0;
          const prevActual = i > 0 ? (sCurveData[i - 1].actual ?? 0) : 0;
          return {
            ...d,
            monthlyPlan: Math.max(0, parseFloat(((d.planned ?? 0) - prevPlanned).toFixed(2))),
            monthlyActual: d.actual != null ? Math.max(0, parseFloat(((d.actual ?? 0) - prevActual).toFixed(2))) : null,
          };
        });

        return (
          <Slide key={`scurve-${block}`} title={`Physical Progress: PSS ${block} S-Curve`} slideNumber={String(globalSlideNum++)}>
            <div className="flex flex-col h-full flex-1">
              {chartData.length > 0 ? (
                <>
                  <div className="border border-slate-200 rounded-lg shadow-sm bg-white p-3">
                    {/* Combo Chart: Bars (monthly) + Lines (cumulative) */}
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} barGap={0} barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tick={{ fill: '#64748b' }} />
                          <YAxis yAxisId="left" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} tick={{ fill: '#64748b' }} domain={[0, 120]} />
                          <YAxis yAxisId="right" orientation="right" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} tick={{ fill: '#64748b' }} domain={[0, 25]} />
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 6, fontSize: 11 }}
                            formatter={(value: any, name: string) => [`${value}%`, name]}
                          />
                          {/* Monthly bars */}
                          <Bar yAxisId="right" dataKey="monthlyPlan" name="Monthly Plan" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
                          <Bar yAxisId="right" dataKey="monthlyActual" name="Monthly Actual" fill="#76bc21" radius={[2, 2, 0, 0]} />
                          {/* Cumulative lines */}
                          <Line yAxisId="left" type="monotone" dataKey="planned" name="Planned" stroke="#11375c" strokeWidth={2.5} dot={false} />
                          <Line yAxisId="left" type="monotone" dataKey="actual" name="Actual" stroke="#d4c426" strokeWidth={2.5} dot={false} connectNulls={false} />
                          <Line yAxisId="left" type="monotone" dataKey="forecast" name="Forecast" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Data Table */}
                    <div className="overflow-x-auto mt-2">
                      <table className="w-full text-[9px] text-center border-collapse">
                        <thead>
                          <tr>
                            <th className="p-1 border border-slate-200 bg-slate-50 text-slate-600 font-semibold text-left min-w-[90px]"></th>
                            {chartData.map((d: any, i: number) => (
                              <th key={i} className="p-1 border border-slate-200 bg-slate-50 text-slate-600 font-semibold whitespace-nowrap">{d.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="p-1 border border-slate-200 text-left font-semibold" style={{ color: '#0ea5e9' }}>
                              <span className="inline-block w-2.5 h-2.5 mr-1 rounded-sm" style={{ backgroundColor: '#0ea5e9' }}></span>Monthly Plan
                            </td>
                            {chartData.map((d: any, i: number) => (
                              <td key={i} className="p-1 border border-slate-200">{d.monthlyPlan?.toFixed(2) ?? '-'}%</td>
                            ))}
                          </tr>
                          <tr>
                            <td className="p-1 border border-slate-200 text-left font-semibold" style={{ color: '#76bc21' }}>
                              <span className="inline-block w-2.5 h-2.5 mr-1 rounded-sm" style={{ backgroundColor: '#76bc21' }}></span>Monthly Actual
                            </td>
                            {chartData.map((d: any, i: number) => (
                              <td key={i} className="p-1 border border-slate-200">{d.monthlyActual != null ? `${d.monthlyActual.toFixed(2)}%` : ''}</td>
                            ))}
                          </tr>
                          <tr className="bg-blue-50/50">
                            <td className="p-1 border border-slate-200 text-left font-semibold" style={{ color: '#11375c' }}>
                              <span className="inline-block w-2.5 h-0.5 mr-1" style={{ backgroundColor: '#11375c' }}></span>Planned
                            </td>
                            {chartData.map((d: any, i: number) => (
                              <td key={i} className="p-1 border border-slate-200 font-medium">{d.planned?.toFixed(2) ?? '-'}%</td>
                            ))}
                          </tr>
                          <tr className="bg-green-50/50">
                            <td className="p-1 border border-slate-200 text-left font-semibold" style={{ color: '#d4c426' }}>
                              <span className="inline-block w-2.5 h-0.5 mr-1" style={{ backgroundColor: '#d4c426' }}></span>Actual
                            </td>
                            {chartData.map((d: any, i: number) => (
                              <td key={i} className="p-1 border border-slate-200 font-medium">{d.actual != null ? `${d.actual.toFixed(2)}%` : ''}</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  {/* Activity Tracking Table */}
                  <div className="mt-4 border border-slate-300 shadow-sm bg-white overflow-hidden">
                    <table className="w-full text-[10px] text-left border-collapse">
                      <thead>
                        <tr className="bg-[#6b2c91] text-white">
                          <th className="p-2 border border-slate-400 font-semibold text-center align-middle" rowSpan={2}>Activity</th>
                          <th className="p-2 border border-slate-400 font-semibold text-center align-middle" rowSpan={2}>Wtg.</th>
                          <th className="p-1 border border-slate-400 font-semibold text-center" colSpan={2}>FTM</th>
                          <th className="p-2 border border-slate-400 font-semibold text-center align-middle" rowSpan={2}>Variance in<br/>Plan Vs<br/>Actual</th>
                          <th className="p-2 border border-slate-400 font-semibold text-center align-middle" rowSpan={2}>Variance Remark & Mitigation/Action Plan</th>
                        </tr>
                        <tr className="bg-[#6b2c91] text-white">
                          <th className="p-1 border border-slate-400 font-semibold text-center w-[60px]">Plan</th>
                          <th className="p-1 border border-slate-400 font-semibold text-center w-[60px]">Actual</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-700">
                        {(() => {
                          const currentMonthData = chartData.slice().reverse().find((d: any) => d.actual != null) || chartData[chartData.length - 1] || {};
                          const planVal = currentMonthData.planned || 0;
                          const actualVal = currentMonthData.actual || 0;
                          const varianceVal = Math.max(0, planVal - actualVal);
                          
                          return (
                            <>
                              <tr>
                                <td className="p-2 border border-slate-300">Construction (Civil), Electrical, Integration & Commissioning</td>
                                <td className="p-2 border border-slate-300 text-center">100%</td>
                                <td className="p-2 border border-slate-300 text-center">{planVal.toFixed(2)}%</td>
                                <td className="p-2 border border-slate-300 text-center">{actualVal.toFixed(2)}%</td>
                                <td className="p-2 border border-slate-300 text-center">{varianceVal.toFixed(2)}%</td>
                                <td className="p-2 border border-slate-300"></td>
                              </tr>
                              <tr className="bg-[#6b2c91] text-white font-bold">
                                <td className="p-2 border border-slate-400 text-center">Total</td>
                                <td className="p-2 border border-slate-400 text-center">100%</td>
                                <td className="p-2 border border-slate-400 text-center">{planVal.toFixed(2)}%</td>
                                <td className="p-2 border border-slate-400 text-center">{actualVal.toFixed(2)}%</td>
                                <td className="p-2 border border-slate-400 text-center">{varianceVal.toFixed(2)}%</td>
                                <td className="p-2 border border-slate-400 font-normal"></td>
                              </tr>
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 text-blue-800 rounded-md">
                      <p className="text-xs uppercase font-bold tracking-wider">Total Scope</p>
                      <p className="text-2xl font-semibold">{stats.totalScope}</p>
                    </div>
                    <div className="p-4 bg-green-50 text-green-800 rounded-md">
                      <p className="text-xs uppercase font-bold tracking-wider">Total Completed</p>
                      <p className="text-2xl font-semibold">{stats.totalCompleted}</p>
                    </div>
                  </div>
                  <div className="flex-1 min-h-[250px] flex items-center justify-center text-slate-400 italic border border-slate-100 bg-slate-50 rounded-md">
                    No S-Curve data available for PSS-{block}
                  </div>
                </>
              )}
            </div>
          </Slide>
        );
      })}

      <Slide title="Engineering Progress : PSS 11 / PSS 12 / PSS 10B/ PSS 09/ PSS08B/ PSS05B" slideNumber={String(globalSlideNum++)}>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm text-center border-collapse border border-slate-300">
            <thead>
              {/* Top Header Row */}
              <tr className="bg-[#7030a0] text-white">
                <th className="p-2 border border-slate-400 font-semibold align-middle" rowSpan={2}>Description</th>
                <th className="p-2 border border-slate-400 font-semibold align-middle" rowSpan={2}>Overall<br/>Completion</th>
                <th className="p-2 border border-slate-400 font-semibold align-middle" rowSpan={2}>Total<br/>Docs.</th>
                <th className="p-2 border border-slate-400 font-semibold align-middle" rowSpan={2}>Docs. Cum.<br/>Received</th>
                <th className="p-2 border border-slate-400 font-semibold" colSpan={5}>Documents Approved</th>
                <th className="p-2 border border-slate-400 font-semibold align-middle" rowSpan={2}>Documents<br/>Under Review</th>
                <th className="p-2 border border-slate-400 font-semibold align-middle" rowSpan={2}>Cum. Total<br/>approved</th>
                <th className="p-2 border border-slate-400 font-semibold align-middle" rowSpan={2}>Approved %</th>
                <th className="p-2 border border-slate-400 font-semibold align-middle" rowSpan={2}>Remarks</th>
              </tr>
              {/* Sub Header Row for Cats */}
              <tr className="bg-[#7030a0] text-white">
                <th className="p-2 border border-slate-400 font-semibold">Cat I</th>
                <th className="p-2 border border-slate-400 font-semibold">Cat II</th>
                <th className="p-2 border border-slate-400 font-semibold">Cat III</th>
                <th className="p-2 border border-slate-400 font-semibold">Cat IV</th>
                <th className="p-2 border border-slate-400 font-semibold">Cat IV*</th>
              </tr>
              {/* Letters Row */}
              <tr className="bg-[#5e2887] text-white text-xs">
                <th className="p-1 border border-slate-400 font-normal">A</th>
                <th className="p-1 border border-slate-400 font-normal">Dates</th>
                <th className="p-1 border border-slate-400 font-normal">B</th>
                <th className="p-1 border border-slate-400 font-normal">C</th>
                <th className="p-1 border border-slate-400 font-normal">D</th>
                <th className="p-1 border border-slate-400 font-normal">E</th>
                <th className="p-1 border border-slate-400 font-normal">F</th>
                <th className="p-1 border border-slate-400 font-normal">G</th>
                <th className="p-1 border border-slate-400 font-normal">H</th>
                <th className="p-1 border border-slate-400 font-normal">I</th>
                <th className="p-1 border border-slate-400 font-normal">J = D + E + F<br/>+ G + H</th>
                <th className="p-1 border border-slate-400 font-normal">k = j / b</th>
                <th className="p-1 border border-slate-400 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {blocksToTrack.map((block, idx) => {
                const stats = getEngStats(block);
                return (
                  <tr key={idx} className="border-b hover:bg-slate-50 text-slate-800">
                    <td className="p-2 border border-slate-300 font-medium">PSS-{block}</td>
                    <td className="p-2 border border-slate-300">{stats?.dates || '-'}</td>
                    <td className="p-2 border border-slate-300">{stats?.total || '-'}</td>
                    <td className="p-2 border border-slate-300">{stats?.docsReceived || '-'}</td>
                    <td className="p-2 border border-slate-300">{stats?.catI || '0'}</td>
                    <td className="p-2 border border-slate-300">{stats?.catII || '0'}</td>
                    <td className="p-2 border border-slate-300">{stats?.catIII || '0'}</td>
                    <td className="p-2 border border-slate-300">{stats?.catIV || '0'}</td>
                    <td className="p-2 border border-slate-300">{stats?.catIVStar || '0'}</td>
                    <td className="p-2 border border-slate-300">{stats?.underReview || '-'}</td>
                    <td className="p-2 border border-slate-300">{stats?.totalApproved || '-'}</td>
                    <td className="p-2 border border-slate-300">{stats ? `${stats.approvedPct}%` : '-'}</td>
                    <td className="p-2 border border-slate-300">-</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-xs text-slate-600 mt-2">
            Cat I: Approved, Cat II: Approved with minor comments, Cat III: Not approved, Cat IV: For Information, Cat IV*:Incorporate comments and resubmit for information
          </div>
        </div>
      </Slide>

      {/* Procurement Status Divider Slide */}
      <Card className="w-full max-w-[1400px] mx-auto mb-12 shadow-lg border-2 border-slate-200 aspect-[16/9] flex flex-col relative overflow-hidden bg-slate-100">
        <div className="flex flex-col items-center justify-center text-center pt-16 pb-20">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="h-20 object-contain mb-2" />
          <div className="w-32 h-0.5 bg-slate-400 mb-3"></div>
          <p className="text-3xl font-bold text-slate-600">Renewables</p>
        </div>
        <div className="w-full py-6 bg-gradient-to-r from-red-500 to-orange-400 text-center">
          <h2 className="text-3xl font-bold text-white">Procurement Status: PSS 11, 12, 10B, 9, 05B & 08B</h2>
        </div>
        <div className="h-16 bg-slate-100"></div>
      </Card>

      {/* Procurement Slides */}
      {blocksToTrack.map((block, index) => {
        const packages = [
          "Battery Container", "PCS", "EMS", "Converter Transformer", "CSS",
          "MV Switchgear", "HT Cable", "DC & LT Cables", "Control Cable",
          "SCADA Cable", "FO Cable"
        ];

        return (
          <Slide key={`proc-${block}`} title={`Procurement & Monthly Rolling Plan for Supply of Equipment – PSS ${block}`} slideNumber={String(globalSlideNum++)}>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-xs text-center border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-[#7030a0] text-white">
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>Sr. No.</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>Packages</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>Manufacturer</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>UOM</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>Scope</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>Ordering<br/>Completed</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>Balance<br/>Ordering</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>PO Number</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>PO Date</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" colSpan={2}>Expected Delivery at Site</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" colSpan={2}>Manufacturing Status</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>Delivered At<br/>Site</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" colSpan={2}>Forecast Delivery<br/>Schedule (Qty)</th>
                    <th className="p-1 border border-slate-400 font-semibold align-middle" rowSpan={2}>Remarks</th>
                  </tr>
                  <tr className="bg-[#5e2887] text-white">
                    <th className="p-1 border border-slate-400 font-semibold">Start</th>
                    <th className="p-1 border border-slate-400 font-semibold">Finish</th>
                    <th className="p-1 border border-slate-400 font-semibold">QAP Acceptance<br/>Date</th>
                    <th className="p-1 border border-slate-400 font-semibold">MC Date</th>
                    <th className="p-1 border border-slate-400 font-semibold">Jun-26</th>
                    <th className="p-1 border border-slate-400 font-semibold">Jul-26</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg, pIdx) => {
                    // Look for DB values matching this block & package
                    const ordAct = orderingData?.find(a => 
                      getBlockForItem(a) === block &&
                      `${a.packages || ''} ${a.description || ''} ${a.name || ''}`.toLowerCase().includes(pkg.split(' ')[0].toLowerCase())
                    );
                    const delAct = deliveryData?.find(a => 
                      getBlockForItem(a) === block &&
                      `${a.packages || ''} ${a.description || ''} ${a.name || ''}`.toLowerCase().includes(pkg.split(' ')[0].toLowerCase())
                    );

                    return (
                      <tr key={pIdx} className="border-b hover:bg-slate-50 text-slate-800">
                        <td className="p-2 border border-slate-300">{pIdx + 1}</td>
                        <td className="p-2 border border-slate-300 font-medium text-left">{pkg}</td>
                        <td className="p-2 border border-slate-300 text-xs max-w-[150px] truncate" title={ordAct?.supplierOem}>{ordAct?.supplierOem || '-'}</td>
                        <td className="p-2 border border-slate-300">{ordAct?.uom || '-'}</td>
                        <td className="p-2 border border-slate-300">{ordAct?.scope || '-'}</td>
                        
                        <td className="p-2 border border-slate-300">{ordAct?.completed || (ordAct ? `${ordAct.percent_complete || 0}%` : '-')}</td>
                        <td className="p-2 border border-slate-300">{ordAct?.balance || '-'}</td>
                        <td className="p-2 border border-slate-300">-</td>
                        <td className="p-2 border border-slate-300">{ordAct?.actualFinish ? formatDateOnly(ordAct.actualFinish) : (ordAct?.forecastFinish ? formatDateOnly(ordAct.forecastFinish) : '-')}</td>
                        
                        <td className="p-2 border border-slate-300">{delAct?.actualStart ? formatDateOnly(delAct.actualStart) : (delAct?.forecastStart ? formatDateOnly(delAct.forecastStart) : '-')}</td>
                        <td className="p-2 border border-slate-300">{delAct?.actualFinish ? formatDateOnly(delAct.actualFinish) : (delAct?.forecastFinish ? formatDateOnly(delAct.forecastFinish) : '-')}</td>
                        <td className="p-2 border border-slate-300">-</td>
                        <td className="p-2 border border-slate-300">-</td>
                        
                        <td className="p-2 border border-slate-300">{delAct?.completed || (delAct ? `${delAct.percent_complete || 0}%` : '-')}</td>
                        <td className="p-2 border border-slate-300">-</td>
                        <td className="p-2 border border-slate-300">-</td>
                        <td className="p-2 border border-slate-300 text-left text-[10px] max-w-[150px] truncate" title={delAct?.status || ordAct?.status}>{delAct?.status || ordAct?.status || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Slide>
        );
      })}

      {/* PSS-11, 12 & 10B Progress Divider Slide */}
      <Card className="w-full max-w-[1400px] mx-auto mb-12 shadow-lg border-2 border-slate-200 aspect-[16/9] flex flex-col relative overflow-hidden bg-slate-100">
        <div className="flex flex-col items-center justify-center text-center pt-16 pb-20">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="h-20 object-contain mb-2" />
          <div className="w-32 h-0.5 bg-slate-400 mb-3"></div>
          <p className="text-3xl font-bold text-slate-600">Renewables</p>
        </div>
        <div className="w-full py-6 bg-gradient-to-r from-red-500 to-orange-400 text-center">
          <h2 className="text-3xl font-bold text-white">PSS-11, 12 & 10B Progress</h2>
        </div>
        <div className="h-16 bg-slate-100"></div>
      </Card>

      {/* Civil Construction Progress - first group */}
      {['11', '12', '10B'].map((block, index) => {
        return (
          <Slide key={`const-${block}`} title={`Civil Construction Progress (Plan VS Actual) (PSS-${block})`} slideNumber={String(globalSlideNum++)}>
            <CivilDetailedTables block={block} civilData={internalCivilData} dpQtyData={internalDpQtyData} projectName={projectName || projectData?.Name || projectData?.name || projectData?.projectName || ''} />
          </Slide>
        );
      })}

      {/* PSS-09, 5B & 8B Progress Divider Slide */}
      <Card className="w-full max-w-[1400px] mx-auto mb-12 shadow-lg border-2 border-slate-200 aspect-[16/9] flex flex-col relative overflow-hidden bg-slate-100">
        <div className="flex flex-col items-center justify-center text-center pt-16 pb-20">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="h-20 object-contain mb-2" />
          <div className="w-32 h-0.5 bg-slate-400 mb-3"></div>
          <p className="text-3xl font-bold text-slate-600">Renewables</p>
        </div>
        <div className="w-full py-6 bg-gradient-to-r from-red-500 to-orange-400 text-center">
          <h2 className="text-3xl font-bold text-white">PSS-09, 5B & 8B Progress</h2>
        </div>
        <div className="h-16 bg-slate-100"></div>
      </Card>

      {/* Civil Construction Progress - second group */}
      {['9', '5B', '8B'].map((block, index) => {
        return (
          <Slide key={`const-${block}`} title={`Civil Construction Progress (Plan VS Actual) (PSS-${block})`} slideNumber={String(globalSlideNum++)}>
            <CivilDetailedTables block={block} civilData={internalCivilData} dpQtyData={internalDpQtyData} projectName={projectName || projectData?.Name || projectData?.name || projectData?.projectName || ''} />
          </Slide>
        );
      })}

      {/* Manpower Status Divider Slide */}
      <Card className="w-full max-w-[1400px] mx-auto mb-12 shadow-lg border-2 border-slate-200 aspect-[16/9] flex flex-col relative overflow-hidden bg-slate-100">
        <div className="flex flex-col items-center justify-center text-center pt-16 pb-20">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="h-20 object-contain mb-2" />
          <div className="w-32 h-0.5 bg-slate-400 mb-3"></div>
          <p className="text-3xl font-bold text-slate-600">Renewables</p>
        </div>
        <div className="w-full py-6 bg-gradient-to-r from-red-500 to-orange-400 text-center">
          <h2 className="text-3xl font-bold text-white">Manpower Status: PSS 11, 12, 10B, 9, 05B & 08B</h2>
        </div>
        <div className="h-16 bg-slate-100"></div>
      </Card>

      {/* Manpower Deployment Plan vs Actual */}
      <Slide title="Manpower Deployment Plan vs Actual for Overall Project Execution" slideNumber={String(globalSlideNum++)}>
        <div className="flex flex-col items-center justify-center h-full flex-1 text-slate-400 italic border-2 border-dashed border-slate-200 rounded-lg p-12">
          <p>Manpower Deployment Chart - Requires historical manpower data to plot</p>
        </div>
      </Slide>

      {/* Manpower Status per block */}
      {blocksToTrack.map((block, index) => {
        const mpStats = getManpowerStatus(block);
        return (
          <Slide key={`mp-${block}`} title={`Contractor Manpower Status: PSS ${block}`} slideNumber={String(globalSlideNum++)}>
            <div className="flex gap-4">
              <div className="p-6 bg-slate-50 flex-1 text-center rounded-lg border">
                <h3 className="text-sm uppercase tracking-wide text-slate-500 mb-2">Peak Manpower</h3>
                <p className="text-4xl font-bold text-slate-800">{mpStats.peakManpower}</p>
              </div>
              <div className="p-6 bg-slate-50 flex-1 text-center rounded-lg border">
                <h3 className="text-sm uppercase tracking-wide text-slate-500 mb-2">Average Manpower</h3>
                <p className="text-4xl font-bold text-slate-800">{Math.round(mpStats.avgManpower)}</p>
              </div>
            </div>
          </Slide>
        );
      })}

      <Slide title="Major Milestones - Next 3 months" slideNumber={String(globalSlideNum++)}>
        {majorMilestones.length > 0 ? (
          <ul className="list-disc pl-6 space-y-2">
            {majorMilestones.map((m, idx) => (
              <li key={idx} className="text-slate-700">
                <span className="font-semibold">{m.blockNo} - {m.activity}</span> (Ends: {m.trailRunEndDate})
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400 italic">No upcoming milestones found in the next 3 months.</p>
        )}
      </Slide>

      <Slide title="Critical Issues" slideNumber={String(globalSlideNum++)}>
        {criticalIssues.length > 0 ? (
          <div className="space-y-4">
            <h3 className="font-semibold text-red-600 mb-2">Delayed Activities</h3>
            {criticalIssues.map((c, idx) => (
              <div key={idx} className="p-3 bg-red-50 border border-red-100 rounded-md text-sm text-red-800">
                <strong>{c.description}</strong> - Forecast Finish: {c.forecastFinish || 'Unknown'} (Currently {c.status})
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 italic">No critical issues or delayed activities found.</p>
        )}
      </Slide>
      
      <Slide title="Financial S Curve" slideNumber={String(globalSlideNum++)}>
        <div className="flex flex-col items-center justify-center h-full flex-1 text-slate-400 italic border-2 border-dashed border-slate-200 rounded-lg p-12">
          <p>Financial Data - No data available in DB</p>
        </div>
      </Slide>



      {/* Ordering Status Divider 1 */}
      <Card className="w-full max-w-[1400px] mx-auto mb-12 shadow-lg border-2 border-slate-200 aspect-[16/9] flex flex-col relative overflow-hidden bg-slate-100">
        <div className="flex flex-col items-center justify-center text-center pt-16 pb-20">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="h-20 object-contain mb-8" />
          <p className="text-3xl font-bold text-slate-600 mb-4">Renewables</p>
        </div>
        <div className="w-full py-6 bg-gradient-to-r from-red-500 to-orange-400 text-center mb-auto">
          <h2 className="text-4xl font-bold text-white tracking-wide drop-shadow-md">Ordering Status: PSS-11, 12 & 10(B)</h2>
        </div>
        <div className="absolute bottom-4 right-6 text-slate-400 font-medium">Slide {String(globalSlideNum++)}</div>
      </Card>

      {renderPaginatedSlides("Supply Ordering Status (PSS-11, 12 & 10B)", orderingData.filter(item => ['11', '12', '10B'].includes(getBlockForItem(item)) && isSupply(item)), 41, 4)}

      {renderPaginatedSlides("Service Ordering Status (PSS-11, 12 & 10B)", orderingData.filter(item => ['11', '12', '10B'].includes(getBlockForItem(item)) && isService(item)), 45, 2)}

      {/* Ordering Status Divider 2 */}
      <Card className="w-full max-w-[1400px] mx-auto mb-12 shadow-lg border-2 border-slate-200 aspect-[16/9] flex flex-col relative overflow-hidden bg-slate-100">
        <div className="flex flex-col items-center justify-center text-center pt-16 pb-20">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="h-20 object-contain mb-8" />
          <p className="text-3xl font-bold text-slate-600 mb-4">Renewables</p>
        </div>
        <div className="w-full py-6 bg-gradient-to-r from-red-500 to-orange-400 text-center mb-auto">
          <h2 className="text-4xl font-bold text-white tracking-wide drop-shadow-md">Ordering Status: PSS-09, 05(B) & 08(B)</h2>
        </div>
        <div className="absolute bottom-4 right-6 text-slate-400 font-medium">Slide {String(globalSlideNum++)}</div>
      </Card>

      {renderPaginatedSlides("Supply Ordering Status (PSS-09, 05B & 08B)", orderingData.filter(item => ['9', '5B', '8B'].includes(getBlockForItem(item)) && isSupply(item)), 48, 4)}

      {renderPaginatedSlides("Service Ordering Status (PSS-09, 05B & 08B)", orderingData.filter(item => ['9', '5B', '8B'].includes(getBlockForItem(item)) && isService(item)), 52, 2)}

      <Slide title="Statutory & Other approvals" slideNumber={`${globalSlideNum}-${globalSlideNum + 5}`}>
        <div className="flex flex-col items-center justify-center h-full flex-1 text-slate-400 italic border-2 border-dashed border-slate-200 rounded-lg p-12">
          <p>Statutory Approvals - No data available in DB</p>
        </div>
      </Slide>

    </div>
  );
};
