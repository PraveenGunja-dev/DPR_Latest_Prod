// src/types/issue.ts

export interface FormIssue {
  id: string;
  description: string;
  startDate: string;
  finishedDate: string | null;
  delayedDays: number;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  priority: "Low" | "Medium" | "High" | "Critical";
  actionRequired: string;
  remarks: string;
  attachment: File | null;
  attachmentName?: string | null;
  notificationEmail?: string;
  projectName?: string;
  location?: string;
  wbs?: string;
  activity?: string;
}

export interface IssueFormData {
  id?: string | number;
  description: string;
  startDate: string;
  finishedDate?: string | null;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  priority: "Low" | "Medium" | "High" | "Critical";
  actionRequired: string;
  remarks: string;
  attachment: File | string | null;
  attachmentName?: string | null;
  notificationEmail?: string;
  location?: string;
  wbs?: string;
  activity?: string;
}
