import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar, Cell } from 'recharts';
import { Hammer, Truck, ShoppingCart, Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";

interface EDSummaryDashboardProps {
  engineeringData: any[];
  orderingData: any[];
  deliveryData: any[];
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

const parseDateRobustly = (d: any): Date | null => {
  if (!d || d === "-") return null;
  const date = new Date(d);
  if (!isNaN(date.getTime())) return date;
  if (typeof d === "string") {
    const parts = d.split(/[-/]/);
    if (parts.length === 3) {
      const try2 = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      if (!isNaN(try2.getTime())) return try2;
    }
  }
  return null;
};

const getStatus = (start: any, finish: any) => {
  if (finish && finish !== "-") return "Completed";
  if (start && start !== "-") return "In Progress";
  return "Not Started";
};

export const EDSummaryDashboard: React.FC<EDSummaryDashboardProps> = ({
  engineeringData = [],
  orderingData = [],
  deliveryData = []
}) => {
  const [showPendingModal, setShowPendingModal] = useState(false);
  // Filter data to only include "tracked" items
  const trackedEngineering = useMemo(() => {
    return engineeringData.filter(d => 
      parseFloat(d.percent_complete || '0') > 0 ||
      (d.baselineStart && d.baselineStart !== "-") ||
      (d.baselineFinish && d.baselineFinish !== "-") ||
      (d.actualStart && d.actualStart !== "-") ||
      (d.actualFinish && d.actualFinish !== "-") ||
      (d.forecastStart && d.forecastStart !== "-") ||
      (d.forecastFinish && d.forecastFinish !== "-")
    );
  }, [engineeringData]);

  const trackedOrdering = useMemo(() => {
    return orderingData.filter(d => 
      Number(d.scope) > 0 ||
      (d.boqBaselineStart && d.boqBaselineStart !== "-") || 
      (d.posoBaselineStart && d.posoBaselineStart !== "-") ||
      (d.boqActualStart && d.boqActualStart !== "-") ||
      (d.posoActualStart && d.posoActualStart !== "-")
    );
  }, [orderingData]);

  const trackedDelivery = useMemo(() => {
    return deliveryData.filter(d => Number(d.scope) > 0 || Number(d.completed) > 0);
  }, [deliveryData]);

  // Determine if percent_complete is on a 0-1 scale or 0-100 scale
  const pctScale = useMemo(() => {
    const maxPct = Math.max(0, ...trackedEngineering.map((r: any) => parseFloat(r.percent_complete) || 0));
    return maxPct > 1 ? 1 : 100;
  }, [trackedEngineering]);

  // 1. Engineering KPIs
  const engStats = useMemo(() => {
    const total = trackedEngineering.length;
    
    const completed = trackedEngineering.filter(d => {
      const pct = (parseFloat(d.percent_complete || '0') * pctScale);
      return pct >= 99.9; // Using 99.9 to handle float precision issues
    }).length;
    
    const inProgress = trackedEngineering.filter(d => {
      const pct = (parseFloat(d.percent_complete || '0') * pctScale);
      return pct > 0 && pct < 99.9;
    }).length;
    
    const notStarted = total - completed - inProgress;
    
    // Average completion
    const totalPct = trackedEngineering.reduce((sum, d) => sum + (parseFloat(d.percent_complete || '0') * pctScale), 0);
    const avgPct = total > 0 ? (totalPct / total).toFixed(1) : "0.0";

    return { total, completed, inProgress, notStarted, avgPct };
  }, [trackedEngineering, pctScale]);



  // 2. Ordering KPIs (Ready to automatically work when data comes)
  const ordStats = useMemo(() => {
    const total = trackedOrdering.length;
    let completedPOs = 0;
    const pendingList: any[] = [];
    
    trackedOrdering.forEach(d => {
      if ((d.posoActualStart && d.posoActualStart !== "-") || (d.posoActualFinish && d.posoActualFinish !== "-")) {
        completedPOs++;
      } else {
        pendingList.push(d);
      }
    });

    const pendingPOs = total - completedPOs;
    
    return { total, completedPOs, pendingPOs, pendingList };
  }, [trackedOrdering]);

  // 3. Delivery KPIs
  const delStats = useMemo(() => {
    const total = trackedDelivery.length;
    let totalScope = 0;
    let totalDelivered = 0;
    
    trackedDelivery.forEach(d => {
      totalScope += Number(d.scope) || 0;
      totalDelivered += Number(d.completed) || 0;
    });

    const totalBalance = totalScope - totalDelivered;
    const overallDeliveryPct = totalScope > 0 ? ((totalDelivered / totalScope) * 100).toFixed(1) : "0.0";

    return { total, totalScope, totalDelivered, totalBalance, overallDeliveryPct };
  }, [trackedDelivery]);

  const overallChartData = useMemo(() => {
    const engPct = parseFloat(engStats.avgPct);
    const ordPct = ordStats.total > 0 ? Number(((ordStats.completedPOs / ordStats.total) * 100).toFixed(1)) : 0;
    const delPct = parseFloat(delStats.overallDeliveryPct);
    
    return [
      { name: 'Engineering', Completed: engPct, Pending: 100 - engPct },
      { name: 'Ordering', Completed: ordPct, Pending: 100 - ordPct },
      { name: 'Delivery', Completed: delPct, Pending: 100 - delPct }
    ];
  }, [engStats.avgPct, ordStats.total, ordStats.completedPOs, delStats.overallDeliveryPct]);

  // 4. Monthly Timeline Data for Line Chart
  const timelineData = useMemo(() => {
    const monthMap: Record<string, { monthDate: Date; Engineering: number; Ordering: number; Delivery: number }> = {};
    
    // First, gather all valid dates to find min and max
    const allDates: Date[] = [];
    const extractDate = (d: any, type: string) => {
      if (type === 'Ordering') {
         return (d.posoActualStart && d.posoActualStart !== "-") ? d.posoActualStart : 
                (d.posoForecastStart && d.posoForecastStart !== "-") ? d.posoForecastStart : 
                d.posoBaselineStart || d.boqBaselineStart;
      }
      const dateStr = (d.actualFinish && d.actualFinish !== "-") ? d.actualFinish : 
                      (d.forecastFinish && d.forecastFinish !== "-") ? d.forecastFinish : 
                      d.baselineFinish;
      return dateStr;
    };

    trackedEngineering.forEach(d => {
      const date = parseDateRobustly(extractDate(d, 'Engineering'));
      if (date) allDates.push(date);
    });
    trackedOrdering.forEach(d => {
      const date = parseDateRobustly(extractDate(d, 'Ordering'));
      if (date) allDates.push(date);
    });
    trackedDelivery.forEach(d => {
      const date = parseDateRobustly(extractDate(d, 'Delivery'));
      if (date) allDates.push(date);
    });

    // If we have dates, generate a continuous range of months
    if (allDates.length > 0) {
      const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
      
      // Start from the 1st of the min month
      let curr = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
      
      while (curr <= end) {
        const monthKey = curr.toLocaleString('default', { month: 'short', year: '2-digit' });
        monthMap[monthKey] = { monthDate: new Date(curr), Engineering: 0, Ordering: 0, Delivery: 0 };
        curr.setMonth(curr.getMonth() + 1);
      }
    }

    const addToMonth = (dateStr: string, type: 'Engineering' | 'Ordering' | 'Delivery') => {
      const date = parseDateRobustly(dateStr);
      if (!date) return;
      
      const monthKey = date.toLocaleString('default', { month: 'short', year: '2-digit' });
      
      if (!monthMap[monthKey]) {
        // Fallback just in case
        const sortDate = new Date(date.getFullYear(), date.getMonth(), 1);
        monthMap[monthKey] = { monthDate: sortDate, Engineering: 0, Ordering: 0, Delivery: 0 };
      }
      monthMap[monthKey][type] += 1;
    };

    // Engineering dates (Finish dates)
    trackedEngineering.forEach(d => {
      const date = (d.actualFinish && d.actualFinish !== "-") ? d.actualFinish : 
                   (d.forecastFinish && d.forecastFinish !== "-") ? d.forecastFinish : 
                   d.baselineFinish;
      addToMonth(date, 'Engineering');
    });

    // Ordering dates (PO Dates)
    trackedOrdering.forEach(d => {
      const date = (d.posoActualStart && d.posoActualStart !== "-") ? d.posoActualStart : 
                   (d.posoForecastStart && d.posoForecastStart !== "-") ? d.posoForecastStart : 
                   d.posoBaselineStart || d.boqBaselineStart;
      addToMonth(date, 'Ordering');
    });

    // Delivery dates (Finish/Delivery dates)
    trackedDelivery.forEach(d => {
      const date = (d.actualFinish && d.actualFinish !== "-") ? d.actualFinish : 
                   (d.forecastFinish && d.forecastFinish !== "-") ? d.forecastFinish : 
                   d.baselineFinish;
      addToMonth(date, 'Delivery');
    });

    // Convert map to sorted array
    return Object.entries(monthMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.monthDate.getTime() - b.monthDate.getTime());
      
  }, [trackedEngineering, trackedOrdering, trackedDelivery]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 shadow-lg rounded-lg text-xs">
          <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">{label || payload[0].name}</p>
          {payload.map((p: any, i: number) => (
            <p key={i} style={{ color: p.color || p.payload.color }}>
              {p.name}: {p.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-4 space-y-6">
      
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Engineering Card */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-gradient-to-br from-blue-50 to-white dark:from-slate-900 dark:to-slate-950">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Hammer className="w-4 h-4" /> Engineering
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{engStats.avgPct}%</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Overall Completion</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{engStats.total} Activities</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500">{engStats.completed} Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ordering Card */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-gradient-to-br from-amber-50 to-white dark:from-slate-900 dark:to-slate-950 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowPendingModal(true)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-500">
              <ShoppingCart className="w-4 h-4" /> Ordering
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-end group">
              <div>
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-500 group-hover:text-amber-700 transition-colors">{ordStats.pendingPOs}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Pending Orders</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{ordStats.total} Total Packages</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">{ordStats.completedPOs} POs Placed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Card */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-gradient-to-br from-purple-50 to-white dark:from-slate-900 dark:to-slate-950">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <Truck className="w-4 h-4" /> Material
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{delStats.overallDeliveryPct}%</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Volume Delivered</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Total Scope: {delStats.totalScope.toLocaleString()}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400">Balance: {delStats.totalBalance.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[300px]">
        
        {/* Overall Status Bar Chart */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">Overall Progress by Category</CardTitle>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#10b981]"></div>Completed</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#94a3b8]"></div>Pending</div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center min-h-[250px] pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overallChartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }} dy={10} />
                <YAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(val) => `${val}%`} />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} barSize={28} />
                <Bar dataKey="Pending" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Timeline Line Chart */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Monthly Completion Trend (All Sheets)
            </CardTitle>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#00609C]"></div>Engineering</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#f59e0b]"></div>Ordering</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#8b5cf6]"></div>Delivery</div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center min-h-[250px] pt-4">
            {timelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="Engineering" stroke="#00609C" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="Ordering" stroke="#f59e0b" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="Delivery" stroke="#8b5cf6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-slate-400 flex flex-col items-center">
                <AlertCircle className="w-8 h-8 mb-2 opacity-20" />
                No Timeline Data Available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
    
      <Dialog open={showPendingModal} onOpenChange={setShowPendingModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pending Orders ({ordStats.pendingPOs})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {ordStats.pendingList?.length > 0 ? (
              ordStats.pendingList.map((item, idx) => (
                <div key={idx} className="p-3 border rounded-md shadow-sm bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                  <h4 className="font-semibold text-sm mb-1">{item.description || item.wbsName || 'Unnamed Package'}</h4>
                  <div className="text-xs text-slate-600 dark:text-slate-400 grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <span className="font-medium">Substation:</span> {item.substation || '-'}
                    </div>
                    <div>
                      <span className="font-medium">Package No:</span> {item.packageNo || '-'}
                    </div>
                    <div>
                      <span className="font-medium">BOQ Status:</span> {getStatus(item.boqActualStart, item.boqActualFinish)}
                    </div>
                    <div>
                      <span className="font-medium">POSO Status:</span> {getStatus(item.posoActualStart, item.posoActualFinish)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No pending orders found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
