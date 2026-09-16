// src/config/sheetConfig.ts
// Central registry for project-type-specific sheet configurations

export type ProjectType = 'solar' | 'wind' | 'pss' | 'bess' | 'other';

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
    { id: 'dc_sheet',              label: 'DC Side',                 dataEntry: true },
    { id: 'ac_sheet',              label: 'AC Side',                 dataEntry: true },
    { id: 'testing_commissioning', label: 'Testing & Commissioning', dataEntry: true },
    { id: 'manpower_details',      label: 'Labour Days',             dataEntry: true },
    { id: 'manpower_details_2',    label: 'Manpower (Contractor)',   dataEntry: true },
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
// The ids alone, for the PM / PMAG review modals: these sheets are WBS-filtered views of the same
// activity model as AC Side and render through ACSheetTable everywhere.
export const RAJASTHAN_SHEET_IDS: string[] = RAJASTHAN_SHEETS.map(s => s.id);

// ============================================================================
// WIND — new sheets with different column structures
// ============================================================================
const WIND_CONFIG: ProjectTypeConfig = {
  label: 'Wind',
  sheets: [
    { id: 'wind_summary',     label: 'Summary',         dataEntry: false },
    { id: 'wind_progress',    label: 'Progress Sheet',  dataEntry: true },
    { id: 'wind_stone_column',label: 'Stone Column',    dataEntry: true },
    { id: 'wind_33kv',        label: '33KV',            dataEntry: true },
    { id: 'wind_erection',    label: 'Erection',        dataEntry: true },
    { id: 'wind_manpower',    label: 'Labour Days',     dataEntry: true },
    { id: 'manpower_details_2',    label: 'Manpower (Contractor)',   dataEntry: true },
    { id: 'wind_machinery',   label: 'Machinery Sheet', dataEntry: true },
    { id: 'wind_productivity',     label: 'Productivity',            dataEntry: true },
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
    { id: 'pss_summary',          label: 'Summary',                     dataEntry: false },
    { id: 'pss_civil_peb',        label: 'Civil and PEB',               dataEntry: true },
    { id: 'pss_electrical',       label: 'Electrical',                  dataEntry: true },
    { id: 'pss_tl_visual',        label: '400KV Transmission Visual',   dataEntry: true },
    { id: 'pss_transmission',     label: '400KV Transmission',          dataEntry: true },
    { id: 'pss_manpower',         label: 'Manpower',                    dataEntry: true },
    { id: 'manpower_details_2',   label: 'Manpower (Contractor)',       dataEntry: true },
    { id: 'issues',               label: 'Issues',                      dataEntry: true },
  ],
  filters: [],
};

// ============================================================================
// BESS — new sheets with different column structures
// ============================================================================
const BESS_CONFIG: ProjectTypeConfig = {
  label: 'BESS',
  sheets: [
    { id: 'bess_summary',          label: 'Summary',                     dataEntry: false },
    { id: 'bess_dp_qty',           label: 'DP Qty',                      dataEntry: true },
    { id: 'bess_civil',            label: 'Civil',                       dataEntry: true },
    { id: 'bess_electrical',       label: 'Electrical',                  dataEntry: true },
    { id: 'bess_testing',          label: 'Testing & Comm.',             dataEntry: true },

    { id: 'bess_manpower',         label: 'Manpower',                    dataEntry: true },
    { id: 'bess_productivity',     label: 'Productivity',                dataEntry: true },
    { id: 'bess_charging_schedule',label: 'Charging Schedule',           dataEntry: true },
    { id: 'bess_daily_requirement',label: 'Daily requirement',           dataEntry: true },
    { id: 'issues',                label: 'Issues',                      dataEntry: false },
  ],
  filters: [],
};

// ============================================================================
// REGISTRY
// ============================================================================
export const SHEET_REGISTRY: Record<ProjectType, ProjectTypeConfig> = {
  solar: SOLAR_CONFIG,
  wind: WIND_CONFIG,
  pss: PSS_CONFIG,
  bess: BESS_CONFIG,
  other: SOLAR_CONFIG, // fallback to solar
};

// project_configurations.dashboard_layout_type. 'standard' is the column default AND what
// /api/config/project returns when a project has no row at all, so it carries no information -
// it must fall through to the EPS / name detection below. Treating it as an explicit answer
// silently switched off the Rajasthan (solar) and Outside Khavda (wind: PSS, EHV) sheets for every
// project nobody had configured by hand.
const explicitLayoutType = (projectConfig?: any): string | null => {
  const raw = String(projectConfig?.dashboard_layout_type || '').trim().toLowerCase();
  return raw && raw !== 'standard' ? raw : null;
};

/**
 * Get config for a project type, with fallback to solar
 */
export const getProjectTypeConfig = (projectType?: string, projectDetails?: any, fallbackName?: string, projectConfig?: any): ProjectTypeConfig => {
  const normalized = (projectType || 'solar').toLowerCase() as ProjectType;
  const config = { ...(SHEET_REGISTRY[normalized] || SHEET_REGISTRY.solar) };
  const layoutType = explicitLayoutType(projectConfig);
  
  // Inject Rajasthan sheets if project matches EPS or specific project name keywords
  if (normalized === 'solar') {
    let isRajasthan = false;
    
    if (layoutType) {
      isRajasthan = layoutType === 'rajasthan';
    } else {
      // Fallback to hardcoded detection if API failed or hasn't loaded yet
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

      isRajasthan = eps.includes('rajasthan') || 
                          eps.includes('rj') ||
                          projectName.includes('BAIYA') || 
                          projectName.includes('BANDHA') ||
                          projectName.includes('RAJASTHAN') ||
                          p6Id.startsWith('RJ');
    }

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

  // Inject Outside Khavda Wind sheets
  if (normalized === 'wind') {
    let isOutsideKhavda = false;

    if (layoutType) {
        isOutsideKhavda = layoutType === 'outside_khavda';
    } else {
        const eps = (
          projectDetails?.parentEps || 
          projectDetails?.parent_eps || 
          projectDetails?.ParentEPSName || 
          projectDetails?.eps ||
          projectDetails?.EPS ||
          ''
        ).toLowerCase();
    
        // Same rule WindDashboard uses to pick the non-Khavda 33KV layout: Mandvi and Mundra sit
        // outside Khavda but their EPS is "Wind Baselines", so the name has to count as well.
        const projectName = (
          projectDetails?.Name ||
          projectDetails?.name ||
          fallbackName ||
          ''
        ).toLowerCase();

        isOutsideKhavda = eps.includes('outside khavda') || eps.includes('outside khavada') ||
                          eps.includes('mandvi') || eps.includes('mundra') ||
                          projectName.includes('mandvi') || projectName.includes('mundra');
    }

    if (isOutsideKhavda) {
      const outsideSheets: SheetDefinition[] = [
        { id: 'wind_pss',  label: 'PSS',  dataEntry: true },
        { id: 'wind_ehv',  label: 'EHV',  dataEntry: true },
      ];

      // Insert after wind_progress
      const progressIdx = config.sheets.findIndex(s => s.id === 'wind_progress');
      if (progressIdx !== -1) {
        const newSheets = [...config.sheets];
        newSheets.splice(progressIdx + 1, 0, ...outsideSheets);
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

// ============================================================================
// SHEET ASSIGNMENT
// ============================================================================
export interface AssignableSheet { id: string; label: string }
export interface AssignableSheetGroup { key: string; typeLabel: string; sheets: AssignableSheet[] }

const projectTypeOf = (project: any): string =>
  String(project?.projectType || project?.ProjectType || project?.project_type || 'solar').toLowerCase();

/**
 * The sheets a user can be restricted to, for the given project(s), grouped by project type.
 *
 * Every assignment modal used to show one hard-coded solar list (with the pre-rename AC / DC ids),
 * whatever the project was - so a wind or PSS supervisor could only ever be handed solar sheets, and
 * the Rajasthan / Outside-Khavda sheets could not be assigned at all. This resolves each selected
 * project through the same getProjectTypeConfig the supervisor's tab bar uses, so what is offered is
 * exactly what that project renders. 'issues' is left out: it is shared and always accessible.
 */
export const getAssignableSheetGroups = (projects: any[]): AssignableSheetGroup[] => {
  const groups = new Map<string, AssignableSheetGroup>();
  (projects || []).forEach(project => {
    if (!project) return;
    const pt = projectTypeOf(project);
    const name = project?.Name || project?.name || '';
    const config = getProjectTypeConfig(pt, project, name);
    const ids = config.sheets.filter(s => s.id !== 'issues').map(s => s.id);
    // Projects of one type share a group; a variant (Rajasthan solar, Outside-Khavda wind) gets its own.
    const key = `${pt}:${ids.join(',')}`;
    if (groups.has(key)) return;
    const isVariant = ids.some(id => RAJASTHAN_SHEET_IDS.includes(id))
      ? 'Rajasthan'
      : ids.includes('wind_pss') ? 'Outside Khavda' : '';
    groups.set(key, {
      key,
      typeLabel: isVariant ? `${config.label} (${isVariant})` : config.label,
      sheets: config.sheets.filter(s => s.id !== 'issues').map(s => ({ id: s.id, label: s.label })),
    });
  });
  return Array.from(groups.values());
};
