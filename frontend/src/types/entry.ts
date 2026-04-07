// src/types/entry.ts

export type EntryStatus = 'submitted_to_pm' | 'approved_by_pm' | 'rejected_by_pm' | 'final_approved' | 'approved_by_pmag' | 'rejected_by_pmag' | 'draft' | 'archived';

export type SheetType = 'dp_qty' | 'dp_block' | 'dp_vendor_idt' | 'dp_vendor_block' | 'mms_module_rfi' | 'manpower_details' | 'testing_commissioning';

export interface DPREntry {
    id: number;
    project_id: number;
    user_id: number;
    sheet_type: SheetType;
    entry_date: string;
    status: EntryStatus;
    data_json: any;
    submitted_at?: string;
    submitted_by?: number;
    pm_reviewed_at?: string;
    pm_reviewed_by?: number;
    rejection_reason?: string;
    pushed_at?: string;
    pushed_by?: number;
    created_at: string;
    updated_at: string;
    // Joined fields
    supervisor_name?: string;
    supervisor_email?: string;
    project_name?: string;
    user_email?: string;
}

export interface CellComment {
    id: string;
    sheet_id: number;
    row_index: number;
    column_key: string;
    parent_comment_id?: string | null;
    comment_text: string;
    comment_type: 'REJECTION' | 'GENERAL';
    created_by: number;
    role: string;
    created_at: string;
    is_deleted?: boolean;
    // UI fields
    replies?: CellComment[];
    author_name?: string;
}
