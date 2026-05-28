export const getUIColumnsForSheet = (sheetType: string): { columns: string[], columnWidths: Record<string, number> } | null => {
  switch (sheetType) {
    case 'wind_33kv':
      return {
        columns: [
          "SR. NO.", "CABLE FROM", "CABLE TO", "TOTAL LENGTH (METER)", "TERMINATION END", "JOINTING KIT",
          "Today", "Cumulative", "Balance", "Jointing Cumulative", "Jointing Balance",
          "Termination Cumulative", "Termination Balance"
        ],
        columnWidths: {
          "SR. NO.": 80,
          "CABLE FROM": 220,
          "CABLE TO": 220,
          "TOTAL LENGTH (METER)": 160,
          "TERMINATION END": 140,
          "JOINTING KIT": 120,
          "Today": 100,
          "Cumulative": 120,
          "Balance": 100,
          "Jointing Cumulative": 160,
          "Jointing Balance": 140,
          "Termination Cumulative": 180,
          "Termination Balance": 160
        }
      };
    case 'wind_progress':
      return {
        columns: [
          "S.No", "Activity ID", "Description", "Status", "Substation", "SPV", "Location", "Activity Group",
          "Feeder", "WTG FDN Vendor", "FDN Allotment Date", "Stone Column Contractor", "Soil Test Status",
          "Coord E", "Coord N", "Resource", "Scope", "Completed", "Baseline Start", "Baseline Finish",
          "Actual/Forecast Start", "Actual/Forecast Finish", "No of Days"
        ],
        columnWidths: {
          "S.No": 50, "Activity ID": 160, "Description": 220, "Status": 110, "Substation": 100, "SPV": 100,
          "Location": 90, "Activity Group": 110, "Feeder": 80, "WTG FDN Vendor": 130, "FDN Allotment Date": 120,
          "Stone Column Contractor": 150, "Soil Test Status": 110, "Coord E": 80, "Coord N": 80, "Resource": 140,
          "Scope": 70, "Completed": 80, "Baseline Start": 100, "Baseline Finish": 100, "Actual/Forecast Start": 100,
          "Actual/Forecast Finish": 100, "No of Days": 80
        }
      };
    case 'wind_ehv':
    case 'testing_commissioning':
    case 'wind_pss':
      return {
        columns: [
          "S.No", "Activity ID", "Description", "Status", "Substation", "SPV", "Location", "Activity Group",
          "Feeder", "Resource", "Scope", "Completed", "Baseline Start", "Baseline Finish",
          "Actual/Forecast Start", "Actual/Forecast Finish", "No of Days"
        ],
        columnWidths: {
          "S.No": 50, "Activity ID": 160, "Description": 220, "Status": 110, "Substation": 100, "SPV": 100,
          "Location": 90, "Activity Group": 110, "Feeder": 80, "Resource": 140, "Scope": 70, "Completed": 80,
          "Baseline Start": 100, "Baseline Finish": 100, "Actual/Forecast Start": 100, "Actual/Forecast Finish": 100,
          "No of Days": 80
        }
      };
    case 'wind_manpower':
    case 'manpower_details':
      return {
        columns: [
          "S.No", "Category", "Subcontractor", "Total Scope", "Cum Upto Prev Day", "Today", "Cum Upto Today", "Remarks"
        ],
        columnWidths: {
          "S.No": 50, "Category": 150, "Subcontractor": 200, "Total Scope": 100, "Cum Upto Prev Day": 150,
          "Today": 100, "Cum Upto Today": 150, "Remarks": 250
        }
      };
    case 'dp_qty':
    case 'dp_block':
      return {
        columns: [
          "S.No", "Description", "Status", "UOM", "Scope", "Completed", "Balance",
          "Baseline Start", "Baseline Finish", "Actual Start", "Actual Finish",
          "Forecast Start", "Forecast Finish", "Resource", "Yesterday", "Today"
        ],
        columnWidths: {
          "S.No": 50, "Description": 250, "Status": 110, "UOM": 60, "Scope": 80,
          "Completed": 120, "Balance": 80, "Baseline Start": 100, "Baseline Finish": 100,
          "Actual Start": 100, "Actual Finish": 100, "Forecast Start": 100, "Forecast Finish": 100,
          "Resource": 140, "Yesterday": 80, "Today": 80
        }
      };
    case 'ac_sheet':
    case 'dc_sheet':
    case 'switchyard':
    case 'transmission_line':
    case 'infra_works':
      return {
        columns: [
          "S.No", "WBS / Section", "Category", "Description", "Status", "UOM", "Scope",
          "Completed", "Balance", "Baseline Start", "Baseline Finish", "Actual Start",
          "Actual Finish", "Forecast Start", "Forecast Finish", "Resource", "Yesterday", "Today"
        ],
        columnWidths: {
          "S.No": 50, "WBS / Section": 150, "Category": 150, "Description": 250, "Status": 110,
          "UOM": 60, "Scope": 80, "Completed": 120, "Balance": 80, "Baseline Start": 100,
          "Baseline Finish": 100, "Actual Start": 100, "Actual Finish": 100, "Forecast Start": 100,
          "Forecast Finish": 100, "Resource": 140, "Yesterday": 80, "Today": 80
        }
      };
    default:
      return null;
  }
};
