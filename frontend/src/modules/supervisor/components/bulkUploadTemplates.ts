/**
 * Centralized configuration for bulk upload activities.
 *
 * All sheet-specific column mappings, template definitions, field configs,
 * and preview table column definitions live here — separated from the modal
 * component for easy tracking and maintenance.
 */

// ============================================================================
// HEADER_MAP — Excel column header aliases → internal field name
// ============================================================================

/**
 * Maps internal field names to possible Excel column header variations (lowercase).
 * The upload parser uses this to flexibly recognise columns regardless of naming style.
 */
export const HEADER_MAP: Record<string, string[]> = {
  activityId: ['activity id', 'id', 'activity_id'],
  description: ['description', 'activity description', 'activity', 'activity name', 'desc', 'name'],
  uom: ['uom', 'unit', 'unit of measure', 'unit of measurement'],
  scope: ['scope', 'quantity', 'qty', 'total quantity', 'total qty', 'target', 'budgeted days'],
  columnInScope: ['column in scope', 'number of column in scope'],
  wbsName: ['wbs', 'wbs name', 'section', 'wbs / section', 'wbs/section'],
  category: ['category', 'cat', 'type', 'activity group'],
  plannedStart: ['planned start', 'plan start', 'start date', 'planned_start', 'start', 'baseline start'],
  plannedFinish: ['planned finish', 'plan finish', 'finish date', 'planned_finish', 'finish', 'end date', 'baseline finish'],
  remarks: ['remarks', 'remark', 'notes', 'note', 'comment', 'comments'],
  vendor: ['vendor', 'vendor name', 'agency', 'agency name', 'vendor / agency', 'subcontractor', 'stone column contractor', 'wtg fdn vendor'],
  feeder: ['feeder', 'feeder name'],
  priority: ['priority'],
  duration: ['duration'],
  lineKm: ['line km', 'line in km', 'linekm'],
  totalPole: ['total poles', 'total pole', 'poles', 'totalpole'],
  block: ['block', 'block name', 'location', 'locations', 'location no'],
  cableFrom: ['cable from'],
  cableTo: ['cable to'],
  totalLengthMeter: ['total length', 'total length (meter)'],
  length: ['length'],
  terminationEnd: ['termination end'],
  jointingKit: ['jointing kit'],
  pss: ['pss', 'substation'],
  drawingStatus: ['drawing status'],
  rig: ['rig'],
  plan: ['plan'],
  achieved: ['achieved', 'completed'],
  balance: ['balance'],
  substation: ['substation'],
  spv: ['spv'],
  fdnAllotmentDate: ['fdn allotment date'],
  soilTestStatus: ['soil test status'],
  wtgCoordE: ['coord e', 'wtg coord e'],
  wtgCoordN: ['coord n', 'wtg coord n'],
  hoursPerDay: ['hours/day', 'hours per day', 'hours / day'],
  yesterdayValue: ['yesterday'],
  todayValue: ['today'],
  jointingCumulative: ['jointing cumulative'],
  jointingBalance: ['jointing balance'],
  terminationCumulative: ['termination cumulative'],
  terminationCumulative: ['termination cumulative'],
  terminationBalance: ['termination balance'],
  typeOfTower: ['type of tower', 'tower type', 'tower'],
  weightHT: ['ht', 'weight ht'],
  weightMS: ['ms', 'weight ms'],
  weightPW: ['pw', 'weight pw'],
  weightBN: ['b & n', 'b&n', 'bn', 'weight bn'],
  weightTotal: ['total', 'weight total', 'total weight'],
};

// ============================================================================
// SHEET_FIELD_CONFIG — Per-sheet field requirements & extraData mappings
// ============================================================================

export interface SheetFieldConfig {
  /** The primary identifier field for this sheet (used for validation instead of 'description' when applicable) */
  primaryField: 'description' | 'block';
  /** Human-readable label for the primary field (shown in validation errors) */
  primaryFieldLabel: string;
  /** Whether description is strictly required (false = can fallback to block/location or sheet name) */
  descriptionRequired: boolean;
  /** extraData field keys relevant for this sheet (mapped from HEADER_MAP during parsing) */
  extraDataFields: string[];
  /** If true, for 33KV sheets, description is set to cableFrom value */
  useCableFromAsDescription?: boolean;
  /** Vendor field mapping — some sheets use 'agencyName' instead of 'vendorName' */
  vendorFieldName?: 'vendorName' | 'agencyName';
}

const DEFAULT_FIELD_CONFIG: SheetFieldConfig = {
  primaryField: 'description',
  primaryFieldLabel: 'Description',
  descriptionRequired: true,
  extraDataFields: [],
};

export const SHEET_FIELD_CONFIG: Record<string, SheetFieldConfig> = {
  // ── Wind Sheets ──────────────────────────────────────────────────
  wind_stone_column: {
    primaryField: 'block',
    primaryFieldLabel: 'Location no',
    descriptionRequired: false,
    extraDataFields: [
      'vendor', 'pss', 'drawingStatus', 'rig', 'length', 'columnInScope',
      'plan', 'achieved', 'balance',
    ],
  },
  wind_erection: {
    primaryField: 'block',
    primaryFieldLabel: 'Location No.',
    descriptionRequired: false,
    extraDataFields: [
      'typeOfTower', 'weightHT', 'weightMS', 'weightPW', 'weightBN', 'weightTotal',
      'remarks', 'vendorName'
    ],
  },
  wind_33kv: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: false,
    useCableFromAsDescription: true,
    vendorFieldName: 'agencyName',
    extraDataFields: [
      'feeder', 'cableFrom', 'cableTo', 'totalLengthMeter',
      'terminationEnd', 'jointingKit',
      'jointingCumulative', 'jointingBalance',
      'terminationCumulative', 'terminationBalance',
    ],
  },
  wind_pss: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: true,
    extraDataFields: ['vendor', 'priority', 'duration'],
  },
  wind_ehv: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: true,
    extraDataFields: [],
  },
  wind_progress: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: true,
    extraDataFields: [
      'spv', 'fdnAllotmentDate', 'soilTestStatus',
      'wtgCoordE', 'wtgCoordN', 'feeder', 'vendor',
    ],
  },
  wind_manpower: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: true,
    extraDataFields: ['hoursPerDay', 'yesterdayValue', 'todayValue'],
  },

  // ── Solar Sheets ─────────────────────────────────────────────────
  dp_qty: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: true,
    extraDataFields: [],
  },
  dp_vendor_idt: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: true,
    extraDataFields: [],
  },
  ac_sheet: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: true,
    extraDataFields: [],
  },
  dc_sheet: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: true,
    extraDataFields: [],
  },
  testing_commissioning: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: true,
    extraDataFields: [],
  },
  manpower_details: {
    primaryField: 'description',
    primaryFieldLabel: 'Description',
    descriptionRequired: true,
    extraDataFields: ['hoursPerDay', 'yesterdayValue', 'todayValue'],
  },
};

/**
 * Get the field config for a given sheet type, with a sensible default fallback.
 */
export function getSheetFieldConfig(sheetType: string): SheetFieldConfig {
  return SHEET_FIELD_CONFIG[sheetType] || DEFAULT_FIELD_CONFIG;
}


// ============================================================================
// TEMPLATE — Excel template column headers & sample data per sheet
// ============================================================================

export function getTemplateForSheet(sheetType: string) {
  let cols = ['Activity ID', 'Description', 'UOM', 'Scope', 'Planned Start', 'Planned Finish', 'Remarks'];
  let sampleData1: any[] = ['', 'Sample Activity 1', 'Nos', 10, '2025-01-01', '2025-01-15', 'Phase 1'];
  let sampleData2: any[] = ['', 'Sample Activity 2', 'Nos', 5, '2025-02-01', '2025-02-28', ''];

  switch (sheetType) {
    case 'wind_33kv':
      cols = ['Activity ID', 'Description', 'Feeder', 'Cable From', 'Cable To', 'Total Length (Meter)', 'Termination End', 'Jointing Kit', 'Today', 'Cumulative', 'Balance', 'Jointing Cumulative', 'Jointing Balance', 'Termination Cumulative', 'Termination Balance'];
      sampleData1 = ['', '33kV Laying', 'FDR01', 'WTG1', 'WTG2', '2', '0', '0', '0', '0', '0', '0', '0', '0', '0'];
      sampleData2 = ['', '33kV Laying', 'FDR01', 'WTG2', 'WTG3', '1.5', '0', '0', '0', '0', '0', '0', '0', '0', '0'];
      break;
    case 'wind_pss':
      cols = ['Activity ID', 'Description', 'Priority', 'Duration', 'UOM', 'Scope', 'Vendor', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['', 'Tower Foundation', 'High', '10', 'Nos', 10, 'ABC Corp', '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['', 'Tower Erection', 'Normal', '15', 'Nos', 10, 'XYZ Ltd', '2025-02-01', '2025-02-28', 'Phase 2'];
      break;
    case 'wind_progress':
      cols = ['Activity ID', 'Description', 'Substation', 'SPV', 'Location', 'Activity Group', 'Feeder', 'WTG FDN Vendor', 'FDN Allotment Date', 'Stone Column Contractor', 'Soil Test Status', 'Coord E', 'Coord N', 'Scope', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['', 'Foundation', 'Sub1', 'SPV1', 'WTG1', 'Civil', 'FDR01', 'Vendor A', '2025-01-01', 'Contractor X', 'Done', '12.34', '56.78', 1, '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['', 'Erection', 'Sub1', 'SPV1', 'WTG2', 'Mech', 'FDR01', 'Vendor B', '2025-02-01', 'Contractor Y', 'Done', '12.35', '56.79', 1, '2025-02-01', '2025-02-28', 'Phase 2'];
      break;
    case 'wind_stone_column':
      cols = ['Activity ID', 'Location no', 'Vendor', 'PSS', 'Drawing Status', 'RIG', 'Length', 'Number of column in scope', 'Plan', 'Achieved', 'Balance', 'Start Date', 'Finish Date', 'Remarks'];
      sampleData1 = ['', 'WTG1', 'Contractor A', 'PSS1', 'Approved', 'Rig 1', '15', 50, '10', '5', '45', '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['', 'WTG2', 'Contractor B', 'PSS1', 'Pending', 'Rig 2', '20', 60, '20', '0', '60', '2025-02-01', '2025-02-28', 'Phase 2'];
      break;
    case 'wind_erection':
      cols = ['Activity ID', 'Location No.', 'Type of tower', 'Start Date', 'Finish Date', 'HT', 'MS', 'PW', 'B & N', 'Total', 'Remarks', "Vendor's Name"];
      sampleData1 = ['', 'WTG1', 'RD+0', '2026-03-17', '2026-03-25', '27012.7', '11299.5', '22.56', '1248.62', '39583.41', '', 'Vendor A'];
      sampleData2 = ['', 'WTG2', 'RC+0', '2026-03-27', '2026-04-02', '22213.14', '7281.32', '25.87', '1181.6', '30701.93', 'ROW not Clear', 'Vendor B'];
      break;
    case 'wind_manpower':
    case 'manpower_details':
      cols = ['Activity ID', 'Description', 'Block', 'Hours/Day', 'Budgeted Days', 'Yesterday', 'Today', 'Remarks'];
      sampleData1 = ['', 'Supervisor', 'Block A', '8', 30, '0', '1', 'Phase 1'];
      sampleData2 = ['', 'Labor', 'Block A', '8', 150, '5', '10', 'Phase 2'];
      break;
    case 'wind_ehv':
    case 'testing_commissioning':
      cols = ['Activity ID', 'Description', 'UOM', 'Scope', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['', 'Equipment Installation', 'Nos', 10, '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['', 'Testing & Commissioning', 'Lot', 1, '2025-02-01', '2025-02-28', ''];
      break;
    case 'dp_qty':
    case 'dp_vendor_idt':
      cols = ['Activity ID', 'Description', 'UOM', 'Scope', 'Block', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['', 'Trenching', 'Mtr', 500, 'Block A', '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['', 'Cable Laying', 'Mtr', 500, 'Block A', '2025-02-01', '2025-02-28', 'Phase 2'];
      break;
    case 'ac_sheet':
    case 'dc_sheet':
      cols = ['Activity ID', 'Description', 'UOM', 'Scope', 'WBS / Section', 'Category', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['', 'Inverter Installation', 'Nos', 5, 'Section A', 'Electrical', '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['', 'Module Mounting', 'Nos', 100, 'Section A', 'Mechanical', '2025-02-01', '2025-02-28', 'Phase 2'];
      break;
    default:
      break;
  }
  
  return { cols, data: [cols, sampleData1, sampleData2] };
}


// ============================================================================
// PREVIEW TABLE COLUMNS — Data-driven preview column definitions per sheet
// ============================================================================

export interface PreviewColumn {
  /** Header text displayed in the preview table */
  header: string;
  /** Function that extracts the cell value from a ParsedActivity */
  accessor: (act: any) => string;
  /** Text alignment */
  align?: 'left' | 'right';
  /** Minimum width CSS class (optional) */
  minWidth?: string;
}

/**
 * Common columns shared across most preview tables.
 */
const COL_ACTIVITY_ID: PreviewColumn = { header: 'Activity ID', accessor: a => a.activityId || '-' };
const COL_DESCRIPTION: PreviewColumn = { header: 'Description', accessor: a => a.description || '', minWidth: 'min-w-[180px]' };
const COL_UOM: PreviewColumn = { header: 'UOM', accessor: a => a.uom || '-' };
const COL_SCOPE: PreviewColumn = { header: 'Scope', accessor: a => a.scope || '-', align: 'right' };
const COL_START: PreviewColumn = { header: 'Start', accessor: a => a.plannedStart || '-' };
const COL_FINISH: PreviewColumn = { header: 'Finish', accessor: a => a.plannedFinish || '-' };
const COL_REMARKS: PreviewColumn = { header: 'Remarks', accessor: a => a.remarks || '-' };
const COL_VENDOR: PreviewColumn = { header: 'Vendor', accessor: a => a.extraData?.vendor || a.extraData?.vendorName || a.extraData?.agencyName || '-' };

/**
 * Get preview table columns for a specific sheet type.
 * Returns an array of PreviewColumn definitions that the modal uses for data-driven rendering.
 */
export function getPreviewColumnsForSheet(sheetType: string): PreviewColumn[] {
  switch (sheetType) {
    case 'wind_stone_column':
      return [
        COL_ACTIVITY_ID,
        { header: 'Location no', accessor: a => a.block || '-' },
        COL_VENDOR,
        { header: 'PSS', accessor: a => a.extraData?.pss || '-' },
        { header: 'Drawing Status', accessor: a => a.extraData?.drawingStatus || '-' },
        { header: 'RIG', accessor: a => a.extraData?.rig || '-' },
        { header: 'Length', accessor: a => a.extraData?.length || '-', align: 'right' },
        { header: 'Col in Scope', accessor: a => a.extraData?.columnInScope || '-', align: 'right' },
        { header: 'Plan', accessor: a => a.scope || '-', align: 'right' },
        { header: 'Achieved', accessor: a => a.extraData?.achieved || '-', align: 'right' },
        { header: 'Balance', accessor: a => a.extraData?.balance || '-', align: 'right' },
        COL_START,
        COL_FINISH,
        COL_REMARKS,
      ];

    case 'wind_erection':
      return [
        COL_ACTIVITY_ID,
        { header: 'Location No.', accessor: a => a.block || '-' },
        { header: 'Type', accessor: a => a.extraData?.typeOfTower || '-' },
        COL_START,
        COL_FINISH,
        { header: 'HT', accessor: a => a.extraData?.weightHT || '-', align: 'right' },
        { header: 'MS', accessor: a => a.extraData?.weightMS || '-', align: 'right' },
        { header: 'PW', accessor: a => a.extraData?.weightPW || '-', align: 'right' },
        { header: 'B&N', accessor: a => a.extraData?.weightBN || '-', align: 'right' },
        { header: 'Total', accessor: a => a.extraData?.weightTotal || '-', align: 'right' },
        COL_REMARKS,
        COL_VENDOR,
      ];

    case 'wind_33kv':
      return [
        COL_ACTIVITY_ID,
        COL_DESCRIPTION,
        { header: 'Feeder', accessor: a => a.extraData?.feeder || '-' },
        { header: 'Cable To', accessor: a => a.extraData?.cableTo || '-' },
        { header: 'Length', accessor: a => a.extraData?.totalLengthMeter || '-', align: 'right' },
        { header: 'Term. End', accessor: a => a.extraData?.terminationEnd || '-', align: 'right' },
        { header: 'Joint. Kit', accessor: a => a.extraData?.jointingKit || '-', align: 'right' },
        COL_START,
        COL_FINISH,
        COL_REMARKS,
      ];

    case 'wind_pss':
    case 'wind_progress':
    case 'manpower_details':
      return [
        COL_ACTIVITY_ID,
        COL_DESCRIPTION,
        COL_UOM,
        COL_SCOPE,
        COL_VENDOR,
        COL_START,
        COL_FINISH,
        COL_REMARKS,
      ];

    case 'ac_sheet':
    case 'dc_sheet':
      return [
        COL_ACTIVITY_ID,
        COL_DESCRIPTION,
        COL_UOM,
        COL_SCOPE,
        { header: 'WBS', accessor: a => a.wbsName || '-' },
        { header: 'Category', accessor: a => a.category || '-' },
        COL_START,
        COL_FINISH,
        COL_REMARKS,
      ];

    case 'dp_qty':
    case 'dp_vendor_idt':
      return [
        COL_ACTIVITY_ID,
        COL_DESCRIPTION,
        COL_UOM,
        COL_SCOPE,
        { header: 'Location', accessor: a => a.block || '-' },
        COL_START,
        COL_FINISH,
        COL_REMARKS,
      ];

    default:
      // Default: generic columns
      return [
        COL_ACTIVITY_ID,
        COL_DESCRIPTION,
        COL_UOM,
        COL_SCOPE,
        COL_START,
        COL_FINISH,
        COL_REMARKS,
      ];
  }
}


// ============================================================================
// UI COLUMNS — Column definitions for the main sheet tables (existing)
// ============================================================================

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
    case 'wind_stone_column':
      return {
        columns: [
          "SR. NO.", "Location no", "Vendor", "PSS", "Drawing Status", "RIG", "Length",
          "Number of column in scope", "Plan", "Achieved", "Balance", "Start Date", "Finish Date"
        ],
        columnWidths: {
          "SR. NO.": 80, "Location no": 150, "Vendor": 120, "PSS": 100, "Drawing Status": 140,
          "RIG": 100, "Length": 100, "Number of column in scope": 160, "Plan": 90, "Achieved": 90,
          "Balance": 90, "Start Date": 120, "Finish Date": 120
        }
      };
    case 'wind_erection':
      return {
        columns: [
          "Sl.No.", "Location No.", "Type of tower", "Start Date", "Finish Date",
          "HT", "MS", "PW", "B & N", "Total", "Remarks", "Vendor's Name"
        ],
        columnWidths: {
          "Sl.No.": 70, "Location No.": 130, "Type of tower": 130, "Start Date": 120,
          "Finish Date": 120, "HT": 110, "MS": 110, "PW": 90, "B & N": 100,
          "Total": 110, "Remarks": 200, "Vendor's Name": 160
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
      return {
        columns: [
          "S.No", "Description", "Status", "UOM", "Scope", "Completed", "Balance",
          "Baseline Start", "Baseline Finish", "Actual Start", "Actual Finish",
          "Forecast Start", "Forecast Finish", "Yesterday", "Today"
        ],
        columnWidths: {
          "S.No": 50, "Description": 250, "Status": 110, "UOM": 60, "Scope": 80,
          "Completed": 120, "Balance": 80, "Baseline Start": 100, "Baseline Finish": 100,
          "Actual Start": 100, "Actual Finish": 100, "Forecast Start": 100, "Forecast Finish": 100,
          "Yesterday": 80, "Today": 80
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
