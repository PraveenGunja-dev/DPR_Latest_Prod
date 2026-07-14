import React, { useState, useEffect } from "react";
import { BarChart3, Search, Save, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getWindAchievements, saveWindAchievements } from "@/services/p6ActivityService";

interface WindProductivityTableProps {
  projectId: number;
  isLocked?: boolean;
  status?: string;
}

export const WindProductivityTable: React.FC<WindProductivityTableProps> = ({
  projectId,
  isLocked = false,
  status,
}) => {
  const [editableData, setEditableData] = useState<Record<string, Record<string, string>>>({
    rigs: {}, gangs: {}, cranes: {}, commissioning: {}
  });

  const [months, setMonths] = useState<string[]>([]);

  const [autoData, setAutoData] = useState<any>({
    stone_column: { no_of_columns: [], cumm_sc: [], productivity: [] },
    wtg_foundation: { no_of_foundations: [], cumm_foundations: [], productivity: [] },
    wtg_erection: { no_of_erections: [], cumm_erections: [], productivity: [] },
    wtg_commissioning: { no_of_commissioning: [], cumm_commissioning: [] }
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchAchievements = async () => {
      if (projectId) {
        setLoading(true);
        try {
          const data = await getWindAchievements(projectId);
          setMonths(data.months || []);
          setEditableData({
            rigs: data.rigs || {},
            gangs: data.gangs || {},
            cranes: data.cranes || {},
            commissioning: data.commissioning || {}
          });
          setAutoData({
            stone_column: data.stone_column || { no_of_columns: [], cumm_sc: [], productivity: [] },
            wtg_foundation: data.wtg_foundation || { no_of_foundations: [], cumm_foundations: [], productivity: [] },
            wtg_erection: data.wtg_erection || { no_of_erections: [], cumm_erections: [], productivity: [] },
            wtg_commissioning: data.wtg_commissioning || { no_of_commissioning: [], cumm_commissioning: [] }
          });
        } catch (error) {
          console.error("Failed to load productivity data", error);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchAchievements();
  }, [projectId]);

  const handleInputChange = (field: "rigs" | "gangs" | "cranes" | "commissioning", month: string, value: string) => {
    setEditableData(prev => {
      const newData = { ...prev };
      newData[field] = { ...newData[field], [month]: value };
      return newData;
    });
  };

  const handleSave = async () => {
    if (projectId) {
      setSaving(true);
      try {
        await saveWindAchievements(projectId, editableData);
        toast.success("Productivity data saved to database!");
      } catch (error) {
        toast.error("Failed to save productivity data.");
      } finally {
        setSaving(false);
      }
    }
  };

  const handleExport = () => {
    const exportToast = toast.loading("Preparing Productivity export...");
    import("xlsx").then((XLSX) => {
      if (!months.length) {
        toast.error("No data to export.", { id: exportToast });
        return;
      }
      const numVal = (v: any) => (v !== undefined && v !== null && v !== "") ? Number(v) : "";
      const m = months;
      const auto = autoData;
      const e = editableData;

      const rows = [
        { "Sr No": 1, "Activity": "Stone Column", "Resources & Work Done": "Rigs", ...Object.fromEntries(m.map((month: string) => [month, numVal(e.rigs?.[month])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "No of Columns", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.stone_column?.no_of_columns?.[i])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "Cumm SC", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.stone_column?.cumm_sc?.[i])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "Productivity", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.stone_column?.productivity?.[i])])) },

        { "Sr No": 2, "Activity": "WTG Foundation", "Resources & Work Done": "Gangs", ...Object.fromEntries(m.map((month: string) => [month, numVal(e.gangs?.[month])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "No of Foundations", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_foundation?.no_of_foundations?.[i])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "Cumm Foundations", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_foundation?.cumm_foundations?.[i])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "Productivity", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_foundation?.productivity?.[i])])) },

        { "Sr No": 3, "Activity": "WTG Erection", "Resources & Work Done": "Cranes Packages", ...Object.fromEntries(m.map((month: string) => [month, numVal(e.cranes?.[month])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "No of Erections", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_erection?.no_of_erections?.[i])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "Cumm Erections", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_erection?.cumm_erections?.[i])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "Productivity", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_erection?.productivity?.[i])])) },

        { "Sr No": 4, "Activity": "WTG Commissioning", "Resources & Work Done": "Commissioning", ...Object.fromEntries(m.map((month: string) => [month, numVal(e.commissioning?.[month])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "No of Commissioning", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_commissioning?.no_of_commissioning?.[i])])) },
        { "Sr No": "", "Activity": "", "Resources & Work Done": "Cumm Commissioning", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_commissioning?.cumm_commissioning?.[i])])) },
      ];

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Productivity");
      XLSX.writeFile(wb, `Productivity_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Export completed!", { id: exportToast });
    }).catch(err => {
      console.error("Export failed:", err);
      toast.error("Export failed.", { id: exportToast });
    });
  };

  const renderEditableCells = (field: "rigs" | "gangs" | "cranes" | "commissioning") => {
    return months.map((month) => (
      <td key={month} className="px-1 py-1 min-w-[70px]">
        <input
          type="text"
          className="w-full h-8 text-center font-medium border border-slate-200 dark:border-slate-700 rounded text-xs bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#10b981] focus:border-[#10b981] transition-all shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
          value={editableData[field][month] || ""}
          onChange={(e) => handleInputChange(field, month, e.target.value)}
          placeholder="-"
          disabled={isLocked}
        />
      </td>
    ));
  };

  const renderReadOnlyCells = (arr: string[], colorClass: string = "text-slate-700 dark:text-slate-300") => {
    return months.map((month, i) => (
      <td key={month} className={`px-2 py-2 text-center text-sm font-medium ${arr && arr[i] ? colorClass : 'text-slate-400'}`}>
        {(arr && arr[i]) || "-"}
      </td>
    ));
  };

  const renderProductivityCells = (
    field: "rigs" | "gangs" | "cranes",
    counts: any[],
    colorClass: string = "text-blue-600 dark:text-blue-400"
  ) => {
    return months.map((month, i) => {
      const workDone = parseFloat(String(counts?.[i])) || 0;
      const resources = parseFloat(editableData[field]?.[month]) || 0;

      let productivity: string | number = "-";
      if (resources > 0) {
        productivity = String(Math.round(workDone / resources));
      }

      return (
        <td key={`prod-${month}`} className={`px-2 py-2 text-center text-sm font-medium ${productivity !== "-" ? colorClass : 'text-slate-400'}`}>
          {productivity}
        </td>
      );
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#10b981]"/> Productivity Tracking
        </h3>
        <div className="flex items-center gap-4">
          <Button onClick={handleExport} variant="outline" size="sm" disabled={loading} className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
          {!isLocked && (
            <Button onClick={handleSave} size="sm" disabled={saving || loading} className="bg-[#10b981] hover:bg-[#047857] text-white gap-2 shadow-md">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save Data"}
            </Button>
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search productivity..."
              className="h-9 w-64 pl-9 pr-4 text-sm rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#10b981]/50 transition-all"
            />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto relative custom-scrollbar">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-50">
            <Loader2 className="w-8 h-8 animate-spin text-[#10b981]" />
          </div>
        ) : null}
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-900/80 uppercase sticky top-0 z-40 backdrop-blur-md shadow-sm">
            <tr>
              <th className="px-4 py-3 font-semibold tracking-wider w-[60px] min-w-[60px] sticky left-0 z-30 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">Sr No</th>
              <th className="px-4 py-3 font-semibold tracking-wider w-[200px] min-w-[200px] sticky left-16 z-30 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">Activity</th>
              <th className="px-4 py-3 font-semibold tracking-wider w-[180px] min-w-[180px] sticky left-[264px] z-30 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Resources & Work Done</th>
              {months.map(month => (
                <th key={month} className="px-4 py-3 font-semibold tracking-wider text-center">{month}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 border-b-[3px] border-slate-300 dark:border-slate-600 shadow-sm">
            {/* Stone Column */}
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>1</td>
              <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 sticky left-16 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>Stone Column</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Rigs</td>
              {renderEditableCells("rigs")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-[#10b981] sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">No of Columns</td>
              {renderReadOnlyCells(autoData.stone_column.no_of_columns, "text-[#10b981]")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Cumm SC</td>
              {renderReadOnlyCells(autoData.stone_column.cumm_sc)}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-slate-50/50 dark:bg-slate-800/30">
              <td className="px-4 py-2 font-medium text-blue-600 dark:text-blue-400 sticky left-[264px] z-20 bg-slate-50/50 dark:bg-slate-800/30 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-100 dark:group-hover:bg-slate-800/80">Productivity</td>
              {renderProductivityCells("rigs", autoData.stone_column.no_of_columns, "text-blue-600 dark:text-blue-400")}
            </tr>

            {/* WTG Foundation */}
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
              <td className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>2</td>
              <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 sticky left-16 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>WTG Foundation</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Gangs</td>
              {renderEditableCells("gangs")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-[#10b981] sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">No of Foundations</td>
              {renderReadOnlyCells(autoData.wtg_foundation.no_of_foundations, "text-[#10b981]")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Cumm Foundations</td>
              {renderReadOnlyCells(autoData.wtg_foundation.cumm_foundations)}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-slate-50/50 dark:bg-slate-800/30">
              <td className="px-4 py-2 font-medium text-blue-600 dark:text-blue-400 sticky left-[264px] z-20 bg-slate-50/50 dark:bg-slate-800/30 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-100 dark:group-hover:bg-slate-800/80">Productivity</td>
              {renderProductivityCells("gangs", autoData.wtg_foundation.no_of_foundations, "text-blue-600 dark:text-blue-400")}
            </tr>

            {/* WTG Erection */}
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
              <td className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>3</td>
              <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 sticky left-16 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>WTG Erection</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Cranes Packages</td>
              {renderEditableCells("cranes")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-[#10b981] sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">No of Erections</td>
              {renderReadOnlyCells(autoData.wtg_erection.no_of_erections, "text-[#10b981]")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Cumm Erections</td>
              {renderReadOnlyCells(autoData.wtg_erection.cumm_erections)}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-slate-50/50 dark:bg-slate-800/30">
              <td className="px-4 py-2 font-medium text-blue-600 dark:text-blue-400 sticky left-[264px] z-20 bg-slate-50/50 dark:bg-slate-800/30 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-100 dark:group-hover:bg-slate-800/80">Productivity</td>
              {renderProductivityCells("cranes", autoData.wtg_erection.no_of_erections, "text-blue-600 dark:text-blue-400")}
            </tr>

            {/* WTG Commissioning */}
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
              <td className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={3}>4</td>
              <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 sticky left-16 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={3}>WTG Commissioning</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Commissioning</td>
              {renderEditableCells("commissioning")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-[#10b981] sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">No of Commissioning</td>
              {renderReadOnlyCells(autoData.wtg_commissioning.no_of_commissioning, "text-[#10b981]")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Cumm Commissioning</td>
              {renderReadOnlyCells(autoData.wtg_commissioning.cumm_commissioning)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
