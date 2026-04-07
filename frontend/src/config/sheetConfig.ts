// src/config/sheetConfig.ts
// Central registry for project-type-specific sheet configurations

export type ProjectType = 'solar' | 'wind' | 'pss' | 'other';

export interface SheetDefinition {
  id: string;           // Unique identifier, used as tab value and draft sheetType
  label: string;        // Display name on tab
  dataEntry: boolean;   // Whether this sheet supports save/submit (vs read-only summary)
}

export interface FilterDefinition {
  id: string;
  label: string;
  type: 'select';
}

export interface ProjectTypeConfig {
  label: string;                   // Display name ("Solar", "Wind", "PSS")
  sheets: SheetDefinition[];       // Ordered list of sheet tabs
  filters: FilterDefinition[];     // Filter controls shown in header
}

// ============================================================================
// SOLAR — existing sheets, no changes
// ============================================================================
const SOLAR_CONFIG: ProjectTypeConfig = {
  label: 'Solar',
  sheets: [
    { id: 'summary',               label: 'Summary',                 dataEntry: false },
    { id: 'dp_qty',                label: 'DP Qty',                  dataEntry: true },
    { id: 'dp_block',              label: 'DP Block',                dataEntry: true },
    { id: 'dp_vendor_idt',         label: 'DC Side',                 dataEntry: true },
    { id: 'dp_vendor_block',       label: 'AC Side',                 dataEntry: true },
    { id: 'testing_commissioning', label: 'Testing & Commissioning', dataEntry: true },
    { id: 'manpower_details',      label: 'Manpower',                dataEntry: true },
    { id: 'resource',              label: 'Machinery Sheet',         dataEntry: true },
    { id: 'issues',                label: 'Issues',                  dataEntry: false },
  ],
  filters: [
    { id: 'package', label: 'Activity Filter', type: 'select' },
    { id: 'block',   label: 'Block',           type: 'select' },
  ],
};

// ============================================================================
// WIND — new sheets with different column structures
// ============================================================================
const WIND_CONFIG: ProjectTypeConfig = {
  label: 'Wind',
  sheets: [
    { id: 'wind_summary',     label: 'Summary',         dataEntry: false },
    { id: 'wind_progress',    label: 'Progress Sheet',  dataEntry: true },
    { id: 'wind_manpower',    label: 'Manpower',        dataEntry: true },
    { id: 'issues',           label: 'Issues',          dataEntry: false },
  ],
  filters: [
    { id: 'substation', label: 'Substation', type: 'select' },
    { id: 'spv',        label: 'SPV',        type: 'select' },
    { id: 'location',   label: 'Location',   type: 'select' },
  ],
};

// ============================================================================
// PSS — new sheets with different column structures
// ============================================================================
const PSS_CONFIG: ProjectTypeConfig = {
  label: 'PSS',
  sheets: [
    { id: 'pss_summary',     label: 'Summary',         dataEntry: false },
    { id: 'pss_progress',    label: 'Progress Sheet',  dataEntry: true },
    { id: 'pss_manpower',    label: 'Manpower',        dataEntry: true },
    { id: 'issues',          label: 'Issues',          dataEntry: false },
  ],
  filters: [
    // PSS can add filters later when P6 mapping is defined
  ],
};

// ============================================================================
// REGISTRY
// ============================================================================
export const SHEET_REGISTRY: Record<ProjectType, ProjectTypeConfig> = {
  solar: SOLAR_CONFIG,
  wind: WIND_CONFIG,
  pss: PSS_CONFIG,
  other: SOLAR_CONFIG, // fallback to solar
};

/**
 * Get config for a project type, with fallback to solar
 */
export const getProjectTypeConfig = (projectType?: string): ProjectTypeConfig => {
  const normalized = (projectType || 'solar').toLowerCase() as ProjectType;
  return SHEET_REGISTRY[normalized] || SHEET_REGISTRY.solar;
};

/**
 * Check if a sheet ID belongs to solar project type
 */
export const isSolarSheet = (sheetId: string): boolean => {
  return SOLAR_CONFIG.sheets.some(s => s.id === sheetId);
};

/**
 * Check if a sheet ID belongs to wind project type
 */
export const isWindSheet = (sheetId: string): boolean => {
  return WIND_CONFIG.sheets.some(s => s.id === sheetId);
};

/**
 * Check if a sheet ID belongs to PSS project type
 */
export const isPSSSheet = (sheetId: string): boolean => {
  return PSS_CONFIG.sheets.some(s => s.id === sheetId);
};
