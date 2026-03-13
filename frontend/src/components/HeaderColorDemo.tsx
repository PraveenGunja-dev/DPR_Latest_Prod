import React from "react";
import { StyledExcelTable } from "./StyledExcelTable";

export const HeaderColorDemo = () => {
  // Sample data for testing
  const columns = [
    "Sl.No (p6)",
    "Description (p6)",
    "Total Quantity (p6 edit)",
    "UOM (p6 edit)",
    "Balance (auto)",
    "Base Plan Start (p6)",
    "Base Plan Finish (p6)",
    "Actual Start (p6 edit)",
    "Actual Finish (p6 edit)",
    "Forecast Start (p6)",
    "Forecast Finish (p6)",
    "Remarks (user)",
    "Cumulative (auto)",
    "Yesterday",
    "Today"
  ];

  const data = [
    ["1", "Excavation Work", "1000", "CuM", "200", "2025-01-01", "2025-01-31", "2025-01-02", "2025-01-25", "2025-01-02", "2025-01-26", "Completed as planned", "800", "0", "50"],
    ["2", "Foundation Work", "500", "CuM", "100", "2025-02-01", "2025-02-28", "2025-02-02", "", "2025-02-02", "", "In progress", "400", "0", "20"],
  ];

  const columnTypes = {
    "Sl.No (p6)": "text",
    "Description (p6)": "text",
    "Total Quantity (p6 edit)": "number",
    "UOM (p6 edit)": "text",
    "Balance (auto)": "number",
    "Base Plan Start (p6)": "date",
    "Base Plan Finish (p6)": "date",
    "Actual Start (p6 edit)": "date",
    "Actual Finish (p6 edit)": "date",
    "Forecast Start (p6)": "date",
    "Forecast Finish (p6)": "date",
    "Remarks (user)": "text",
    "Cumulative (auto)": "number",
    "Yesterday": "number",
    "Today": "number"
  };

  // Define header structure for multi-row headers
  const headerStructure = [
    [
      "Sl.No (p6)",
      "Description (p6)",
      { label: "Quantity Details (p6 edit)", colSpan: 3 },
      { label: "Schedule Dates (p6)", colSpan: 6 },
      { label: "Remarks & Status (user)", colSpan: 4 }
    ],
    [
      "Sl.No (p6)",
      "Description (p6)",
      "Total Quantity (p6 edit)",
      "UOM (p6 edit)",
      "Balance (auto)",
      "Base Plan Start (p6)",
      "Base Plan Finish (p6)",
      "Actual Start (p6 edit)",
      "Actual Finish (p6 edit)",
      "Forecast Start (p6)",
      "Forecast Finish (p6)",
      "Remarks (user)",
      "Cumulative (auto)",
      "Yesterday",
      "Today"
    ]
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Header Background Color Demo</h1>
      
      <div className="bg-blue-50 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-2">Color Coding Legend</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><span className="inline-block w-4 h-4 bg-[#00B050] mr-2"></span> Green (#00B050): Total Quantity, UOM, Actual Start, Actual Finish</li>
          <li><span className="inline-block w-4 h-4 bg-[#0070C0] mr-2"></span> Blue (#0070C0): Remarks, Today</li>
          <li><span className="inline-block w-4 h-4 bg-[#FA6868] mr-2"></span> Red (#FA6868): Auto, Cumulative, Balance</li>
        </ul>
      </div>

      <StyledExcelTable
        title="DP Qty Table with Colored Headers"
        columns={columns}
        data={data}
        onDataChange={() => { } }
        columnTypes={columnTypes}
        headerStructure={headerStructure}
        isReadOnly={true} onSave={undefined} onSubmit={undefined} onExportAll={undefined} totalRows={undefined}      />
    </div>
  );
};