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
    { id: 'dp_qty',                label: 'DP Qty',                  dataEntry: false },
    { id: 'dp_block',              label: 'DP Block',                dataEntry: false },
    { id: 'dp_vendor_idt',         label: 'DC Side',                 dataEntry: true },
    { id: 'dp_vendor_block',       label: 'AC Side',                 dataEntry: true },
    { id: 'testing_commissioning', label: 'Testing & Commissioning', dataEntry: true },
    { id: 'manpower_details',      label: 'Manpower',                dataEntry: true },
    { id: 'manpower_details_2',    label: 'Manpower Details 2',      dataEntry: true },
    { id: 'resource',              label: 'Machinery Sheet',         dataEntry: true },
    { id: 'issues',                label: 'Issues',                  dataEntry: false },
  ],
  filters: [
    { id: 'package', label: 'Activity Filter', type: 'select' },
    { id: 'block',   label: 'Block',           type: 'select' },
  ],
};

// ============================================================================
// RAJASTHAN EXTENSIONS
// ============================================================================
const RAJASTHAN_SHEETS: SheetDefinition[] = [
  { id: 'switchyard',        label: 'Switchyard',        dataEntry: true },
  { id: 'transmission_line', label: 'Transmission Line', dataEntry: true },
  { id: 'infra_works',       label: 'Infra Works',       dataEntry: true },
];

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
    { id: 'activityGroup', label: 'Activity Group', type: 'select' },
    { id: 'location',      label: 'Location',       type: 'select' },
    { id: 'substation',    label: 'Substation',     type: 'select' },
    { id: 'spv',           label: 'SPV',            type: 'select' },
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
export const getProjectTypeConfig = (projectType?: string, projectDetails?: any, fallbackName?: string): ProjectTypeConfig => {
  const normalized = (projectType || 'solar').toLowerCase() as ProjectType;
  const config = { ...(SHEET_REGISTRY[normalized] || SHEET_REGISTRY.solar) };
  
  // Inject Rajasthan sheets if project matches EPS or specific project name keywords
  if (normalized === 'solar') {
    const eps = (
      projectDetails?.parentEps || 
      projectDetails?.parent_eps || 
      projectDetails?.ParentEPSName || 
      projectDetails?.eps ||
      projectDetails?.EPS ||
      ''
    ).toLowerCase();
    
    const p6Id = (projectDetails?.P6Id || projectDetails?.p6Id || '').toUpperCase();
    
    const projectName = (
      projectDetails?.Name || 
      projectDetails?.name || 
      fallbackName ||
      ''
    ).toUpperCase();

    const isRajasthan = eps.includes('rajasthan') || 
                        eps.includes('rj') ||
                        projectName.includes('BAIYA') || 
                        projectName.includes('BANDHA') ||
                        projectName.includes('RAJASTHAN') ||
                        p6Id.startsWith('RJ');

    if (isRajasthan) {
      // Find insertion point - after testing_commissioning but before manpower
      const tcIdx = config.sheets.findIndex(s => s.id === 'testing_commissioning');
      if (tcIdx !== -1) {
        const newSheets = [...config.sheets];
        newSheets.splice(tcIdx + 1, 0, ...RAJASTHAN_SHEETS);
        config.sheets = newSheets;
      } else {
        // Fallback: append at end but before issues
        const issuesIdx = config.sheets.findIndex(s => s.id === 'issues');
        const newSheets = [...config.sheets];
        newSheets.splice(issuesIdx !== -1 ? issuesIdx : newSheets.length, 0, ...RAJASTHAN_SHEETS);
        config.sheets = newSheets;
      }
    }
  }

  return config;
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
