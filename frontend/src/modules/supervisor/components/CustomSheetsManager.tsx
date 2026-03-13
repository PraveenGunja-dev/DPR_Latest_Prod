import React, { useState, useEffect } from 'react';
import { StyledExcelTable } from '@/components/StyledExcelTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import {
  createCustomSheet,
  getCustomSheets,
  updateCustomSheet,
  deleteCustomSheet,
  addColumnToSheet,
  removeColumnFromSheet,
  getCustomSheetDraftEntry,
  saveCustomSheetDraftEntry,
  submitCustomSheetEntry
} from '@/modules/auth/services/customSheetsService';

interface CustomSheet {
  id: number;
  project_id: number;
  name: string;
  description: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  columns: CustomSheetColumn[];
}

interface CustomSheetColumn {
  id: number;
  sheet_id: number;
  name: string;
  display_name: string;
  data_type: string;
  is_required: boolean;
  default_value: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

interface CustomSheetEntry {
  id: number;
  sheet_id: number;
  project_id: number;
  supervisor_id: number;
  entry_date: string;
  previous_date: string;
  data_json: any;
  status: string;
  submitted_at: string | null;
  updated_at: string;
  created_at: string;
  isReadOnly?: boolean;
  readOnlyMessage?: string;
}

interface CustomSheetsManagerProps {
  projectId: number;
  userId: number;
}

export const CustomSheetsManager: React.FC<CustomSheetsManagerProps> = ({
  projectId,
  userId
}) => {
  const [sheets, setSheets] = useState<CustomSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<CustomSheet | null>(null);
  const [entry, setEntry] = useState<CustomSheetEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newSheet, setNewSheet] = useState({
    name: '',
    description: '',
    columns: [{ name: '', displayName: '', dataType: 'text', isRequired: false, defaultValue: '' }]
  });
  const [editSheet, setEditSheet] = useState({
    id: 0,
    name: '',
    description: '',
    columns: [] as any[]
  });

  // Load custom sheets for the project
  useEffect(() => {
    loadCustomSheets();
  }, [projectId]);

  const loadCustomSheets = async () => {
    try {
      setIsLoading(true);
      const data = await getCustomSheets(projectId);
      setSheets(data);
      setError(null);
    } catch (err) {
      console.error('Error loading custom sheets:', err);
      setError('Failed to load custom sheets');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSheet = async () => {
    try {
      const columns = newSheet.columns.map((col, index) => ({
        name: col.name,
        displayName: col.displayName,
        dataType: col.dataType,
        isRequired: col.isRequired,
        defaultValue: col.defaultValue,
        position: index
      }));

      await createCustomSheet(projectId, newSheet.name, newSheet.description, columns);
      setIsCreateDialogOpen(false);
      setNewSheet({
        name: '',
        description: '',
        columns: [{ name: '', displayName: '', dataType: 'text', isRequired: false, defaultValue: '' }]
      });
      loadCustomSheets();
    } catch (err) {
      console.error('Error creating custom sheet:', err);
      setError('Failed to create custom sheet');
    }
  };

  const handleUpdateSheet = async () => {
    try {
      if (!editSheet.id) return;

      const columns = editSheet.columns.map((col, index) => ({
        name: col.name,
        displayName: col.displayName,
        dataType: col.dataType,
        isRequired: col.isRequired,
        defaultValue: col.defaultValue,
        position: index
      }));

      await updateCustomSheet(editSheet.id, editSheet.name, editSheet.description, columns);
      setIsEditDialogOpen(false);
      setEditSheet({
        id: 0,
        name: '',
        description: '',
        columns: []
      });
      loadCustomSheets();
    } catch (err) {
      console.error('Error updating custom sheet:', err);
      setError('Failed to update custom sheet');
    }
  };

  const handleDeleteSheet = async (sheetId: number) => {
    try {
      await deleteCustomSheet(sheetId);
      loadCustomSheets();
    } catch (err) {
      console.error('Error deleting custom sheet:', err);
      setError('Failed to delete custom sheet');
    }
  };

  const handleSelectSheet = async (sheet: CustomSheet) => {
    setSelectedSheet(sheet);
    try {
      const draftEntry = await getCustomSheetDraftEntry(sheet.id, projectId);
      setEntry(draftEntry);
    } catch (err) {
      console.error('Error loading sheet entry:', err);
      setError('Failed to load sheet entry');
    }
  };

  const handleAddColumn = () => {
    setNewSheet({
      ...newSheet,
      columns: [...newSheet.columns, { name: '', displayName: '', dataType: 'text', isRequired: false, defaultValue: '' }]
    });
  };

  const handleRemoveColumn = (index: number) => {
    const newColumns = [...newSheet.columns];
    newColumns.splice(index, 1);
    setNewSheet({
      ...newSheet,
      columns: newColumns
    });
  };

  const handleColumnChange = (index: number, field: string, value: string | boolean) => {
    const newColumns = [...newSheet.columns];
    newColumns[index] = { ...newColumns[index], [field]: value };
    setNewSheet({
      ...newSheet,
      columns: newColumns
    });
  };

  const handleEditColumnChange = (index: number, field: string, value: string | boolean) => {
    const newColumns = [...editSheet.columns];
    newColumns[index] = { ...newColumns[index], [field]: value };
    setEditSheet({
      ...editSheet,
      columns: newColumns
    });
  };

  const handleAddEditColumn = () => {
    setEditSheet({
      ...editSheet,
      columns: [...editSheet.columns, { name: '', displayName: '', dataType: 'text', isRequired: false, defaultValue: '' }]
    });
  };

  const handleRemoveEditColumn = (index: number) => {
    const newColumns = [...editSheet.columns];
    newColumns.splice(index, 1);
    setEditSheet({
      ...editSheet,
      columns: newColumns
    });
  };

  const handleSaveEntry = async () => {
    if (!entry || !selectedSheet) return;

    try {
      await saveCustomSheetDraftEntry(entry.id, entry.data_json);
      setError(null);
    } catch (err) {
      console.error('Error saving entry:', err);
      setError('Failed to save entry');
    }
  };

  const handleSubmitEntry = async () => {
    if (!entry || !selectedSheet) return;

    try {
      await submitCustomSheetEntry(entry.id);
      // Reload the entry to get updated status
      const updatedEntry = await getCustomSheetDraftEntry(selectedSheet.id, projectId);
      setEntry(updatedEntry);
      setError(null);
    } catch (err) {
      console.error('Error submitting entry:', err);
      setError('Failed to submit entry');
    }
  };

  const handleDataChange = (newData: any[][]) => {
    if (!entry || !selectedSheet) return;

    // Convert array of arrays back to rows with column names
    const updatedRows = newData.map(row => {
      const rowObj: any = {};
      selectedSheet.columns.forEach((col, index) => {
        rowObj[col.name] = row[index] || '';
      });
      return rowObj;
    });

    setEntry({
      ...entry,
      data_json: {
        ...entry.data_json,
        rows: updatedRows
      }
    });
  };

  // Convert rows to array of arrays for the table
  const convertToTableData = () => {
    if (!entry || !selectedSheet) return [];

    const rows = Array.isArray(entry?.data_json?.rows) ? entry.data_json.rows : [];

    return rows.map((row: any) => {
      return selectedSheet.columns.map(col => (row || {})[col.name] || '');
    });
  };

  if (isLoading) {
    return <div>Loading custom sheets...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Custom Sheets</h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create New Sheet
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Custom Sheet</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="sheetName">Sheet Name</Label>
                <Input
                  id="sheetName"
                  value={newSheet.name}
                  onChange={(e) => setNewSheet({ ...newSheet, name: e.target.value })}
                  placeholder="Enter sheet name"
                />
              </div>
              <div>
                <Label htmlFor="sheetDescription">Description</Label>
                <Input
                  id="sheetDescription"
                  value={newSheet.description}
                  onChange={(e) => setNewSheet({ ...newSheet, description: e.target.value })}
                  placeholder="Enter sheet description"
                />
              </div>
              <div>
                <Label>Columns</Label>
                <div className="space-y-2 mt-2">
                  {newSheet.columns.map((column, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label>Column Name</Label>
                        <Input
                          value={column.name}
                          onChange={(e) => handleColumnChange(index, 'name', e.target.value)}
                          placeholder="Column name"
                        />
                      </div>
                      <div className="flex-1">
                        <Label>Display Name</Label>
                        <Input
                          value={column.displayName}
                          onChange={(e) => handleColumnChange(index, 'displayName', e.target.value)}
                          placeholder="Display name"
                        />
                      </div>
                      <div className="flex-1">
                        <Label>Data Type</Label>
                        <select
                          className="w-full p-2 border rounded"
                          value={column.dataType}
                          onChange={(e) => handleColumnChange(index, 'dataType', e.target.value)}
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="boolean">Boolean</option>
                        </select>
                      </div>
                      <div className="flex items-center">
                        <Label>Required</Label>
                        <input
                          type="checkbox"
                          checked={column.isRequired}
                          onChange={(e) => handleColumnChange(index, 'isRequired', e.target.checked)}
                          className="ml-2"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveColumn(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button onClick={handleAddColumn} variant="outline" className="mt-2">
                    <Plus className="mr-2 h-4 w-4" /> Add Column
                  </Button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateSheet}>
                  <Save className="mr-2 h-4 w-4" /> Create Sheet
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {sheets.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No custom sheets created yet.</p>
          <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Your First Sheet
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Available Sheets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sheets.map((sheet) => (
                  <div
                    key={sheet.id}
                    className={`p-3 rounded-lg cursor-pointer flex justify-between items-center ${selectedSheet?.id === sheet.id
                        ? 'bg-blue-100 border border-blue-300'
                        : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    onClick={() => handleSelectSheet(sheet)}
                  >
                    <div>
                      <h3 className="font-medium">{sheet.name}</h3>
                      <p className="text-sm text-gray-500">{sheet.columns.length} columns</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditSheet({
                            id: sheet.id,
                            name: sheet.name,
                            description: sheet.description,
                            columns: sheet.columns.map(col => ({
                              name: col.name,
                              displayName: col.display_name,
                              dataType: col.data_type,
                              isRequired: col.is_required,
                              defaultValue: col.default_value || ''
                            }))
                          });
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSheet(sheet.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2">
            {selectedSheet ? (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>{selectedSheet.name}</CardTitle>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveEntry} disabled={entry?.isReadOnly}>
                        <Save className="mr-2 h-4 w-4" /> Save
                      </Button>
                      <Button
                        onClick={handleSubmitEntry}
                        disabled={entry?.isReadOnly || entry?.status !== 'draft'}
                      >
                        Submit
                      </Button>
                    </div>
                  </div>
                  {entry?.isReadOnly && (
                    <p className="text-sm text-yellow-600">{entry.readOnlyMessage}</p>
                  )}
                </CardHeader>
                <CardContent>
                  {entry ? (
                    <StyledExcelTable
                      title={selectedSheet.name}
                      columns={selectedSheet.columns.map(col => col.display_name)}
                      data={convertToTableData()}
                      onDataChange={handleDataChange}
                      onSave={handleSaveEntry}
                      onSubmit={handleSubmitEntry}
                      isReadOnly={entry.isReadOnly}
                      columnTypes={selectedSheet.columns.reduce((acc, col) => {
                        acc[col.display_name] = col.data_type as 'text' | 'number' | 'date';
                        return acc;
                      }, {} as Record<string, 'text' | 'number' | 'date'>)}
                      status={entry.status}
                    />
                  ) : (
                    <p>Loading sheet data...</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">Select a sheet to view or edit its data</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Sheet Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Custom Sheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editSheetName">Sheet Name</Label>
              <Input
                id="editSheetName"
                value={editSheet.name}
                onChange={(e) => setEditSheet({ ...editSheet, name: e.target.value })}
                placeholder="Enter sheet name"
              />
            </div>
            <div>
              <Label htmlFor="editSheetDescription">Description</Label>
              <Input
                id="editSheetDescription"
                value={editSheet.description}
                onChange={(e) => setEditSheet({ ...editSheet, description: e.target.value })}
                placeholder="Enter sheet description"
              />
            </div>
            <div>
              <Label>Columns</Label>
              <div className="space-y-2 mt-2">
                {editSheet.columns.map((column, index) => (
                  <div key={index} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label>Column Name</Label>
                      <Input
                        value={column.name}
                        onChange={(e) => handleEditColumnChange(index, 'name', e.target.value)}
                        placeholder="Column name"
                      />
                    </div>
                    <div className="flex-1">
                      <Label>Display Name</Label>
                      <Input
                        value={column.displayName}
                        onChange={(e) => handleEditColumnChange(index, 'displayName', e.target.value)}
                        placeholder="Display name"
                      />
                    </div>
                    <div className="flex-1">
                      <Label>Data Type</Label>
                      <select
                        className="w-full p-2 border rounded"
                        value={column.dataType}
                        onChange={(e) => handleEditColumnChange(index, 'dataType', e.target.value)}
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="boolean">Boolean</option>
                      </select>
                    </div>
                    <div className="flex items-center">
                      <Label>Required</Label>
                      <input
                        type="checkbox"
                        checked={column.isRequired}
                        onChange={(e) => handleEditColumnChange(index, 'isRequired', e.target.checked)}
                        className="ml-2"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveEditColumn(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button onClick={handleAddEditColumn} variant="outline" className="mt-2">
                  <Plus className="mr-2 h-4 w-4" /> Add Column
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateSheet}>
                <Save className="mr-2 h-4 w-4" /> Update Sheet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};