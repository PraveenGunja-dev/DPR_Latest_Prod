import { Button } from "@/components/ui/button";
import { StyledExcelTable } from "@/components/StyledExcelTable"; // Changed from ExcelTable to StyledExcelTable
import { AlertCircle, Plus } from "lucide-react";

interface Issue {
  id: string;
  description: string;
  startDate: string;
  finishedDate: string | null;
  delayedDays: number;
  status: "Open" | "In Progress" | "Resolved";
  actionRequired: string;
  remarks: string;
  attachment: File | null;
  attachmentName: string | null;
}

interface IssuesTableProps {
  issues: Issue[];
  onAddIssue: () => void;
}

export function IssuesTable({ issues, onAddIssue }: IssuesTableProps) {
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "Not set";
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  if (issues.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertCircle className="mx-auto h-12 w-12 opacity-50" />
        <h3 className="mt-2 text-lg font-medium">No issues reported</h3>
        <p className="mt-1">Get started by adding a new issue.</p>
        <div className="mt-4">
          <Button onClick={onAddIssue}>
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Issue Log
          </Button>
        </div>
      </div>
    );
  }

  // Define columns
  const columns = [
    "Description",
    "Start Date",
    "Finished Date",
    "Delayed Days",
    "Status",
    "Action Required",
    "Remarks",
    "Attachment"
  ];

  // Convert issues to table data
  const tableData = issues.map(issue => [
    issue.description,
    issue.startDate,
    issue.finishedDate || "N/A",
    issue.delayedDays.toString(),
    issue.status,
    issue.actionRequired || "N/A",
    issue.remarks || "N/A",
    issue.attachmentName || "N/A"
  ]);

  return (
    <StyledExcelTable // Changed from ExcelTable to StyledExcelTable
      title="Issue Logs"
      columns={columns}
      data={tableData}
      onDataChange={() => {}} // Read-only table
      isReadOnly={true}
    />
  );
}