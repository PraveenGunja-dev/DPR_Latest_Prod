// src/types/project.ts

export interface Project {
    id: number;
    ObjectId?: number; // P6 compatibility
    name: string;
    Name?: string; // P6 compatibility
    location?: string;
    Location?: string; // P6 compatibility
    status?: string;
    Status?: string; // P6 compatibility
    progress?: number;
    p6_object_id?: number;
    p6_last_sync?: string;
    p6_data_date?: string;
    p6_last_updated?: string;
    p6_last_user?: string;
    parentEps?: string;
    parent_eps?: string;
    P6Id?: string;
    projectType?: string;
    project_type?: string;
    sheetTypes?: string[];
    sheet_types?: string[];
}

export interface ProjectAssignment {
    id: number;
    user_id: number;
    project_id: number;
    sheet_types: string[];
    created_at: string;
}
