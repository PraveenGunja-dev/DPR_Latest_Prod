// src/utils/formatters.ts

import { EntryStatus } from "@/types";

/**
 * Format date string to YYYY-MM-DD
 */
export const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "Not set";
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Invalid date";
        return date.toISOString().split('T')[0];
    } catch (e) {
        return "Invalid date";
    }
};

/**
 * Format date string to locale string
 */
export const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return "N/A";
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Invalid date";
        return date.toLocaleString();
    } catch (e) {
        return "Invalid date";
    }
};

/**
 * Format entry status for display
 */
export const formatStatus = (status: string | undefined): string => {
    if (!status) return "Unknown";
    switch (status) {
        case "submitted_to_pm": return "Pending PM Review";
        case "approved_by_pm": return "PM Approved";
        case "rejected_by_pm": return "Rejected by PM";
        case "final_approved":
        case "approved_by_pmag": return "Final Approved";
        case "rejected_by_pmag": return "Rejected by PMAG";
        case "draft": return "Draft";
        default: return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
};

/**
 * Get color variant for status badge
 */
export const getStatusVariant = (status: string | undefined): "default" | "secondary" | "destructive" | "outline" => {
    if (!status) return "secondary";
    const s = status.toLowerCase();
    if (s.includes('approved')) return "default";
    if (s.includes('rejected')) return "destructive";
    if (s.includes('submitted')) return "secondary";
    if (s.includes('draft')) return "outline";
    return "secondary";
};

/**
 * Get readable label for sheet type
 */
export const getSheetTypeLabel = (sheetType: string | undefined): string => {
    if (!sheetType) return "Unknown Type";
    const labels: Record<string, string> = {
        // Solar
        dp_qty: "DP Qty",
        dp_vendor_idt: "Vendor IDT",
        dp_vendor_block: "Vendor Block",
        mms_module_rfi: "MMS/RFI",
        manpower_details: "Manpower",
        // Wind
        wind_summary: "Wind Summary",
        wind_progress: "Wind Progress",
        wind_manpower: "Labour Days",
        // PSS
        pss_summary: "PSS Summary",
        pss_progress: "PSS Progress",
        pss_manpower: "PSS Manpower",
    };
    return labels[sheetType] || sheetType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Get today and yesterday dates in YYYY-MM-DD format
 */
export const getTodayAndYesterday = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
        today: today.toLocaleDateString('en-CA'),
        yesterday: yesterday.toLocaleDateString('en-CA')
    };
};
