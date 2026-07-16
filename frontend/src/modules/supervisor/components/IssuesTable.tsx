import React from "react";
import { Button } from "@/components/ui/button";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { AlertCircle, Plus } from "lucide-react";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";

interface Issue {
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
  attachmentName: string | null;
  projectName?: string;
  location?: string;
  wbs?: string;
  activity?: string;
}

interface IssuesTableProps {
  issues: Issue[];
  onAddIssue: () => void;
  onEditIssue?: (issue: Issue) => void;
  onDeleteIssue?: (id: string) => void;
  isReadOnly?: boolean;
  projectName?: string;
}

export function IssuesTable({ issues, onAddIssue, onEditIssue, onDeleteIssue, isReadOnly = true, projectName }: IssuesTableProps) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const userRoleLower = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRoleLower === 'pmag' || userRoleLower === 'super admin';
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "Not set";
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  // Define columns - memoized to prevent infinite renders in StyledExcelTable
  const columns = React.useMemo(() => [
    "Project Name",
    "Location",
    "WBS",
    "Activity",
    "Description",
    "Priority",
    "Start Date",
    "Finished Date",
    "Delayed Days",
    "Status",
    "Action Required",
    "Remarks",
    "Attachment"
  ], []);

  // Convert issues to table data - memoized
  const tableData = React.useMemo(() => issues.map(issue => [
    issue.projectName || projectName || "N/A",
    issue.location || "-",
    issue.wbs || "-",
    issue.activity || "-",
    issue.description,
    issue.priority,
    formatDate(issue.startDate),
    formatDate(issue.finishedDate),
    String(issue.delayedDays),
    issue.status,
    issue.actionRequired,
    issue.remarks,
    issue.attachmentName || "No attachment"
  ]), [issues, projectName]);

  const handleDataChange = React.useCallback(() => { }, []);

  const handleRowEdit = React.useCallback((rowIndex: number) => {
    if (onEditIssue && issues[rowIndex]) {
      onEditIssue(issues[rowIndex]);
    }
  }, [issues, onEditIssue]);

  // Effect to highlight and scroll to a specific issue if navigated from IssuesViewModal
  React.useEffect(() => {
    const highlightDesc = location.state?.highlightIssueDesc;
    if (highlightDesc && issues.length > 0) {
      // Find the index of the issue with the matching description
      const targetIndex = issues.findIndex(i => i.description === highlightDesc);
      
      if (targetIndex >= 0) {
        // Give StyledExcelTable a moment to paint the rows
        setTimeout(() => {
          // Find the table and get the exact row by index
          const table = document.querySelector('table');
          if (table) {
            const tbody = table.querySelector('tbody');
            if (tbody && tbody.children.length > targetIndex) {
              const tr = tbody.children[targetIndex] as HTMLElement;
              
              tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              // The cells (td) have their own solid backgrounds, so we must highlight the cells directly
              const cells = Array.from(tr.children) as HTMLElement[];
              
              cells.forEach(cell => {
                cell.style.transition = 'background-color 0.5s ease-in-out';
                cell.style.setProperty('background-color', '#fef9c3', 'important'); // Tailwind yellow-100
              });
              
              // Flash it a few times for visibility, then leave it permanently highlighted
              setTimeout(() => { 
                cells.forEach(cell => cell.style.setProperty('background-color', 'transparent', 'important')); 
              }, 400);
              setTimeout(() => { 
                cells.forEach(cell => cell.style.setProperty('background-color', '#fef9c3', 'important')); 
              }, 800);
              setTimeout(() => { 
                cells.forEach(cell => cell.style.setProperty('background-color', 'transparent', 'important')); 
              }, 1200);
              setTimeout(() => { 
                cells.forEach(cell => cell.style.setProperty('background-color', '#fef9c3', 'important')); 
              }, 1600);
              
              // Clear the highlight state from the URL history so it doesn't re-highlight on refresh
              navigate(location.pathname, { replace: true, state: { ...location.state, highlightIssueDesc: undefined } });
            }
          }
        }, 500); // 500ms delay to ensure the DOM is ready
      }
    }
  }, [issues, location.state?.highlightIssueDesc]);

  const handleRowDelete = React.useCallback((rowIndex: number) => {
    if (onDeleteIssue && issues[rowIndex]) {
      onDeleteIssue(issues[rowIndex].id);
    }
  }, [issues, onDeleteIssue]);

  // Handle attachment click - force file download
  const handleAttachmentClick = React.useCallback((rowIndex: number) => {
    const issue = issues[rowIndex];
    if (!issue) return;

    const triggerDownload = (url: string, filename: string) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    if (issue.attachment instanceof File) {
      // Local File object
      const url = URL.createObjectURL(issue.attachment);
      triggerDownload(url, issue.attachment.name);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } else if (typeof issue.attachment === 'string' && issue.attachment) {
      // URL string from backend
      triggerDownload(issue.attachment, issue.attachmentName || 'attachment');
    } else if (issue.attachmentName) {
      // We have a name but the file was lost (e.g. after page reload)
      alert(`The file "${issue.attachmentName}" was not uploaded to the server (backend file storage is not implemented). Please re-attach the file if needed.`);
    }
  }, [issues]);

  // Attachment column index (0-based) = 12
  const ATTACHMENT_COL_INDEX = 12;

  const handleTableClick = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const cell = target.closest('td');
    if (!cell) return;

    const row = cell.closest('tr');
    if (!row) return;

    // Get cell index within the row
    const cells = Array.from(row.children);
    const cellIndex = cells.indexOf(cell);

    // The Attachment column is exactly at index 12 in IssuesTable
    if (cellIndex === ATTACHMENT_COL_INDEX) {
      e.preventDefault();
      e.stopPropagation();

      const tbody = row.parentElement;
      if (tbody) {
        const rows = Array.from(tbody.children);
        const rowIndex = rows.indexOf(row);

        if (rowIndex >= 0) {
          const issue = issues[rowIndex];
          if (issue && (issue.attachment || issue.attachmentName)) {
            handleAttachmentClick(rowIndex);
          }
        }
      }
    }
  }, [issues, handleAttachmentClick]);

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

  return (
    <div className="flex flex-col gap-4 w-full h-full">
      {!isReadOnly && (
        <div className="flex justify-end w-full px-2">
          <Button onClick={onAddIssue} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Issue
          </Button>
        </div>
      )}
      <div className="flex-1 w-full min-h-0" onClick={handleTableClick} style={{ cursor: 'default' }}>
        <StyledExcelTable
          title="Issue Logs"
          columns={columns}
          data={tableData}
          onDataChange={handleDataChange} // Read-only table
          isReadOnly={isReadOnly}
          onSave={undefined}
          onSubmit={undefined}
          onExportAll={undefined}
          totalRows={undefined}
          onRowEdit={!isReadOnly && onEditIssue ? handleRowEdit : undefined}
          onRowDelete={!isReadOnly && onDeleteIssue ? handleRowDelete : undefined}
          rowIsEditable={() => true}
          rowIsDeletable={() => !isReadOnly}
        />
      </div>
    </div>
  );
}