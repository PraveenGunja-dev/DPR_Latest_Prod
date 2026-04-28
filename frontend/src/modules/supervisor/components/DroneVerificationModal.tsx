import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import apiClient from "@/services/apiClient";

interface DroneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  reportDate: string;
  dprRows?: any[];
}

interface ComparisonResult {
  block_name: string;
  activity: string;
  dpr_actual: number;
  drone_actual: number;
  variance: number;
  status: string;
}

export const DroneVerificationModal: React.FC<DroneVerificationModalProps> = ({ isOpen, onClose, projectId, reportDate, dprRows }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ComparisonResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ totalBlocks: 0, discrepancies: 0 });

  useEffect(() => {
    if (isOpen && projectId) {
      fetchComparison();
    }
  }, [isOpen, projectId, reportDate]);

  const fetchComparison = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        report_date: reportDate,
        dpr_rows: dprRows || []
      };
      const response = await apiClient.post(`drone/compare/${projectId}`, payload);
      if (response.data.status === "success") {
        setData(response.data.data);
        const discrepanciesCount = response.data.data.filter((r: ComparisonResult) => r.status === "Over-Reported").length;
        setSummary({
          totalBlocks: response.data.total_blocks_surveyed || 0,
          discrepancies: discrepanciesCount,
        });
      } else {
        setError(response.data.message || "Failed to load drone data.");
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error connecting to Drone Verification Service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-2xl">
           Drone Progress Verification
          </DialogTitle>
          <DialogDescription>
            Side-by-side comparison of Contractor DPR entries against AI-processed aerial drone surveys.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Analyzing aerial data and cross-referencing with DPR...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start mt-4">
            <AlertCircle className="w-5 h-5 mr-2 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to perform verification</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 bg-slate-50 border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 font-medium mb-1">Flight Date</p>
                <p className="text-xl font-bold text-slate-800">{reportDate}</p>
              </Card>
              <Card className="p-4 bg-blue-50 border-blue-200 shadow-sm">
                <p className="text-sm text-blue-600 font-medium mb-1">Blocks Surveyed</p>
                <p className="text-xl font-bold text-blue-900">{summary.totalBlocks}</p>
              </Card>
              <Card className={`p-4 shadow-sm ${summary.discrepancies > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <p className={`text-sm font-medium mb-1 ${summary.discrepancies > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  Over-Reported Alerts
                </p>
                <div className="flex items-center">
                  <p className={`text-xl font-bold ${summary.discrepancies > 0 ? 'text-red-900' : 'text-green-900'}`}>
                    {summary.discrepancies}
                  </p>
                  {summary.discrepancies > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-red-500 ml-2" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-500 ml-2" />
                  )}
                </div>
              </Card>
            </div>

            <div className="border rounded-md shadow-sm overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-slate-100">
                  <TableRow>
                    <TableHead className="w-[150px] font-semibold">Block Name</TableHead>
                    <TableHead className="font-semibold">Activity</TableHead>
                    <TableHead className="text-right font-semibold">DPR Actuals</TableHead>
                    <TableHead className="text-right font-semibold">Drone Actuals</TableHead>
                    <TableHead className="text-right font-semibold">Variance</TableHead>
                    <TableHead className="text-center font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground bg-slate-50">
                        <AlertCircle className="w-8 h-8 mx-auto text-slate-400 mb-3" />
                        <p className="text-base font-semibold text-slate-700">No matching activities found.</p>
                        <p className="text-sm mt-1 max-w-md mx-auto">
                          The drone scanned {summary.totalBlocks} blocks, but none could be matched against your current table entries.
                          <strong> Please ensure your activities and block names are correctly synced from P6</strong> for comparison.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((row, idx) => (
                      <TableRow key={idx} className={row.status === "Over-Reported" ? "bg-red-50/50" : ""}>
                        <TableCell className="font-medium">{row.block_name}</TableCell>
                        <TableCell>{row.activity}</TableCell>
                        <TableCell className="text-right">{row.dpr_actual}</TableCell>
                        <TableCell className="text-right font-semibold text-blue-700">{row.drone_actual}</TableCell>
                        <TableCell className={`text-right font-bold ${
                          row.variance > 0 ? "text-red-600" : row.variance < 0 ? "text-orange-600" : "text-slate-600"
                        }`}>
                          {row.variance > 0 ? `+${row.variance}` : row.variance}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.status === "Verified" ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                              🟢 Verified
                            </span>
                          ) : row.status === "Over-Reported" ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                              🔴 Over-Reported
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                              🟠 Under-Reported
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
