import React, { useState, useEffect } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";

interface DPRSummarySectionProps {
  // Props can be added here as needed
}

export const DPRSummarySection: React.FC<DPRSummarySectionProps> = () => {
  // State for theme mode
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  
  // Detect theme changes
  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setThemeMode(isDark ? 'dark' : 'light');
    };
    
    // Initial theme detection
    updateTheme();
    
    // Watch for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);
  
  // Sample data for the main activity table
  const mainActivityData = [
    // Category row - we'll handle this specially
    [
      "PILING / MMS", "", "", "", "", "", "", "", "", "", "", "", "", ""
    ],
    [
      "Activity 1",
      "Meters",
      "1000",
      "500",
      "50",
      "20",
      "70",
      "450",
      "100",
      "520",
      "+20",
      "480",
      "52%",
      "On track"
    ],
    [
      "Activity 2",
      "Units",
      "2000",
      "800",
      "80",
      "30",
      "110",
      "720",
      "150",
      "880",
      "-30",
      "1120",
      "44%",
      "Behind schedule"
    ]
  ];

  // Sample data for the charging plan table
  const chargingPlanData = [
    [
      "Meters",
      "1000",
      "520",
      "480",
      "2025-10-01",
      "2026-03-31",
      "2025-10-05",
      "",
      "2026-04-15"
    ],
    [
      "Units",
      "2000",
      "880",
      "1120",
      "2025-10-01",
      "2026-04-30",
      "2025-10-03",
      "",
      "2026-05-10"
    ]
  ];

  // Get theme-appropriate background colors
  const getContainerBgClass = () => {
    return themeMode === 'light' ? 'bg-white' : 'bg-gray-900';
  };
  
  const getTitleBarBgClass = () => {
    return themeMode === 'light' ? 'bg-[#DDE4EC]' : 'bg-[#2D2D2D]';
  };
  
  const getTitleBarTextClass = () => {
    return themeMode === 'light' ? 'text-black' : 'text-white';
  };
  
  const getBorderClass = () => {
    return themeMode === 'light' ? 'border-black' : 'border-gray-600';
  };

  return (
    <div className={`w-full p-4 rounded-lg shadow-md ${getContainerBgClass()}`}>
      {/* Full-width title bar */}
      <div className={`w-full ${getTitleBarBgClass()} ${getBorderClass()} text-center font-bold text-base py-2 mb-4 ${getTitleBarTextClass()}`}>
        DAILY PROGRESS REPORT – KHAVDA HYBRID SOLAR PHASE 3 (YEAR 2025–26)
      </div>
      {/* Main activity table with grouped headers */}
      <div className="mb-6">
        <StyledExcelTable
          title="Main Activity"
          columns={[
            "Activity", "UOM", "Total Scope Qty", "Front Available",
            "Today's Qty - Base Plan", "Today's Qty - Catch Up Plan", "Today's Qty - Actual",
            "Cumulative Qty - Base Plan", "Cumulative Qty - Catch Up Plan", "Cumulative Qty - Actual",
            "Deviation Plan vs Actual", "Total Scope Balance Qty", "% Status as on date", "Remarks"
          ]}
          data={mainActivityData}
          onDataChange={() => {}}
          columnTypes={{
            "Activity": "text",
            "UOM": "text",
            "Total Scope Qty": "number",
            "Front Available": "number",
            "Today's Qty - Base Plan": "number",
            "Today's Qty - Catch Up Plan": "number",
            "Today's Qty - Actual": "number",
            "Cumulative Qty - Base Plan": "number",
            "Cumulative Qty - Catch Up Plan": "number",
            "Cumulative Qty - Actual": "number",
            "Deviation Plan vs Actual": "text",
            "Total Scope Balance Qty": "number",
            "% Status as on date": "text",
            "Remarks": "text"
          }}
          columnWidths={{
            "Activity": 180,
            "UOM": 90,
            "Total Scope Qty": 120,
            "Front Available": 120,
            "Today's Qty - Base Plan": 110,
            "Today's Qty - Catch Up Plan": 110,
            "Today's Qty - Actual": 110,
            "Cumulative Qty - Base Plan": 110,
            "Cumulative Qty - Catch Up Plan": 110,
            "Cumulative Qty - Actual": 110,
            "Deviation Plan vs Actual": 110,
            "Total Scope Balance Qty": 110,
            "% Status as on date": 110,
            "Remarks": 160
          }}
          isReadOnly={true}
          hideAddRow={true}
        />
      </div>

      {/* Charging plan table */}
      <div>
        <StyledExcelTable
          title="Charging Plan"
          columns={[
            "UoM", "Scope", "Total Completed", "Balance", "Base Plan Start", 
            "Base Plan Finish", "Actual Start", "Actual Finish", "Forecast Completion Date"
          ]}
          data={chargingPlanData}
          onDataChange={() => {}}
          columnTypes={{
            "UoM": "text",
            "Scope": "number",
            "Total Completed": "number",
            "Balance": "number",
            "Base Plan Start": "date",
            "Base Plan Finish": "date",
            "Actual Start": "date",
            "Actual Finish": "date",
            "Forecast Completion Date": "date"
          }}
          columnWidths={{
            "UoM": 90,
            "Scope": 120,
            "Total Completed": 120,
            "Balance": 120,
            "Base Plan Start": 120,
            "Base Plan Finish": 120,
            "Actual Start": 120,
            "Actual Finish": 120,
            "Forecast Completion Date": 120
          }}
          isReadOnly={true}
          hideAddRow={true}
        />
      </div>
    </div>
  );
};