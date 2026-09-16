// src/services/historicImportService.ts
// PMAG dashboard "Import History" — backfills daily progress + vendor/block/priority metadata
// for a Solar project from a legacy tracking workbook. See the matching backend service,
// app/services/excel_historic_import_service.py, for exactly what is read, matched and written.

import apiClient from "./apiClient";

export interface HistoricImportSheetReport {
  sheetName: string;
  found: boolean;
  note?: string;
  sheetType?: string;
  totalRows?: number;
  uniqueActivityIds?: number;
  matchedInDb?: number;
  unmatchedCount?: number;
  unmatchedSample?: string[];
  duplicatesSkipped?: number;
  duplicateSamples?: { activityId: string; reason: string }[];
  blankVendorCount?: number;
  rowsWithDailyData?: number;
  dailyDateRange?: { from: string | null; to: string | null };
  dailyCellsFound?: number;
  dailyRowsToImport?: number;
  dailyRowsExcludedLiveOverlap?: number;
}

export interface HistoricImportIssueLogReport {
  sheetName: string;
  found: boolean;
  note?: string;
  issuesFound?: number;
  issuesAlreadyImported?: number;
  issuesToImport?: number;
}

export interface HistoricImportReport {
  importId: string;
  projectId: string;
  projectName: string;
  sheets: HistoricImportSheetReport[];
  issueLog: HistoricImportIssueLogReport;
  metadata: {
    activitiesToUpdate: number;
    fieldsFilled: Record<string, number>;
  };
  totals: {
    dailyProgressRowsToWrite: number;
    metadataUpdatesToWrite: number;
    issuesToCreate: number;
  };
  warnings: string[];
  /** True when none of the file's activity IDs exist in this project — almost certainly the
   * wrong workbook was uploaded for the currently open project. */
  projectMismatch: boolean;
  mismatchMessage: string | null;
  expiresInMinutes: number;
}

export interface HistoricImportCommitResult {
  importId: string;
  written: {
    dailyProgressRows: number;
    metadataUpdates: number;
    issuesCreated: number;
  };
  committedAt: string;
}

/** Uploads the workbook and returns the full preview report. Writes nothing. */
export const previewHistoricImport = async (
  projectId: string | number,
  file: File
): Promise<HistoricImportReport> => {
  const form = new FormData();
  form.append("projectId", String(projectId));
  form.append("file", file);

  const response = await apiClient.post("/historic-import/preview", form, {
    headers: { "Content-Type": "multipart/form-data" },
    // Large multi-sheet workbooks (900+ columns) take longer than the default 120s to parse.
    timeout: 5 * 60 * 1000,
  });
  return response.data;
};

/** Commits the plan a prior previewHistoricImport() call built for importId. */
export const commitHistoricImport = async (
  importId: string
): Promise<HistoricImportCommitResult> => {
  const response = await apiClient.post(`/historic-import/${importId}/commit`, null, {
    timeout: 5 * 60 * 1000,
  });
  return response.data;
};
