import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Check, ChevronDown, ChevronRight, Layers, Loader2, Pencil, Plus, RefreshCw,
  Search, Trash2, UserPlus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { showConfirm } from "@/components/AppDialog";
import {
  listMasterGroups, createMasterGroup, renameMasterGroup, deleteMasterGroup,
  getMasterGroupProjects, addMasterGroupProjects, removeMasterGroupProjects, assignMasterGroup,
  type MasterGroup, type MasterGroupProject, type AssignMode,
} from "@/services/masterGroupService";
import apiClient from "@/services/apiClient";

const CATEGORY_OPTIONS = ["solar", "wind", "rajasthan", "bess", "other"];

const CATEGORY_COLORS: Record<string, string> = {
  solar: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  wind: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  rajasthan: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  bess: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

interface AllProject {
  ObjectId: number;
  Name: string;
}
interface UserOption {
  ObjectId: number;
  Name: string;
  Email: string;
}

/**
 * SuperAdmin "Master Groups": name a set of projects once (Master Solar, Master Wind, ...) and
 * bulk-assign the whole set to a user in one action, either replacing their current assignments
 * ("Reset & Assign") or adding to them ("Add to Existing"). See masterGroupService.ts and the
 * backend's app/routers/super_admin.py for what each action actually does.
 */
export const MasterGroupsTab: React.FC = () => {
  const [groups, setGroups] = useState<MasterGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("solar");
  const [assignGroup, setAssignGroup] = useState<MasterGroup | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("solar");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listMasterGroups()
      .then(setGroups)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load master groups"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { toast.error("Group name is required"); return; }
    setCreating(true);
    try {
      await createMasterGroup(name, newCategory);
      toast.success(`"${name}" created`);
      setNewName("");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail?.message || "Could not create the group");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (group: MasterGroup) => {
    const ok = await showConfirm(
      `This only removes the group definition - it does not touch any project assignment ` +
        `already made from it.`,
      { title: `Delete "${group.name}"?`, tone: "warning", confirmLabel: "Delete", cancelLabel: "Cancel" },
    );
    if (!ok) return;
    try {
      await deleteMasterGroup(group.id);
      toast.success(`"${group.name}" deleted`);
      if (expandedId === group.id) setExpandedId(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail?.message || "Could not delete the group");
    }
  };

  const startEditing = (group: MasterGroup) => {
    setEditingId(group.id);
    setEditName(group.name);
    setEditCategory(group.category);
  };

  const handleSaveEdit = async (group: MasterGroup) => {
    const name = editName.trim();
    if (!name) { toast.error("Group name is required"); return; }
    if (name === group.name && editCategory === group.category) { setEditingId(null); return; }
    setSavingEdit(true);
    try {
      await renameMasterGroup(group.id, { name, category: editCategory });
      toast.success("Saved");
      setEditingId(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail?.message || "Could not save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5" /> Master Project Groups
          </h2>
          <p className="text-sm text-muted-foreground">
            Define a set of projects once, then bulk-assign it to any user.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Create group */}
      <div className="flex items-end gap-2 border rounded-lg p-4 bg-muted/30">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="newGroupName" className="text-xs">New group name</Label>
          <Input
            id="newGroupName" placeholder="e.g. Master Solar"
            value={newName} onChange={(e) => setNewName(e.target.value)} disabled={creating}
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={newCategory} onValueChange={setNewCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
          Create
        </Button>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {loading && groups.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading groups...
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No master groups yet.</div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="border rounded-lg overflow-hidden">
              {editingId === g.id ? (
                <div className="flex items-center gap-2 p-4 bg-muted/30">
                  <Input
                    value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1" autoFocus disabled={savingEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(g); if (e.key === "Escape") setEditingId(null); }}
                  />
                  <Select value={editCategory} onValueChange={setEditCategory} disabled={savingEdit}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => handleSaveEdit(g)} disabled={savingEdit}>
                    {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={savingEdit}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-background">
                  <button
                    className="flex items-center gap-3 flex-1 text-left"
                    onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                  >
                    {expandedId === g.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-medium">{g.name}</span>
                    <Badge className={`text-[10px] ${CATEGORY_COLORS[g.category] || ""}`}>{g.category}</Badge>
                    <span className="text-xs text-muted-foreground">{g.projectCount} project{g.projectCount === 1 ? "" : "s"}</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setAssignGroup(g)} className="mr-1">
                      <UserPlus className="w-4 h-4 mr-1.5" /> Assign
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEditing(g)} title="Rename">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(g)} title="Delete" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              {expandedId === g.id && editingId !== g.id && <GroupDetailPanel group={g} onChanged={load} />}
            </div>
          ))}
        </div>
      )}

      {assignGroup && (
        <AssignToUserDialog group={assignGroup} onClose={() => setAssignGroup(null)} />
      )}
    </div>
  );
};

// ── Expanded group: project list + add/remove ──────────────────────────────

const GroupDetailPanel: React.FC<{ group: MasterGroup; onChanged: () => void }> = ({ group, onChanged }) => {
  const [projects, setProjects] = useState<MasterGroupProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedToRemove, setSelectedToRemove] = useState<number[]>([]);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getMasterGroupProjects(group.id)
      .then((r) => setProjects(r.projects))
      .catch(() => toast.error("Could not load this group's projects"))
      .finally(() => setLoading(false));
  }, [group.id]);

  useEffect(() => { load(); setSelectedToRemove([]); }, [load]);

  const handleRemoveSelected = async () => {
    if (selectedToRemove.length === 0) return;
    setRemoving(true);
    try {
      await removeMasterGroupProjects(group.id, selectedToRemove);
      toast.success(`Removed ${selectedToRemove.length} project(s)`);
      setSelectedToRemove([]);
      load();
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail?.message || "Could not remove the selected projects");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="border-t p-4 bg-muted/20 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Projects in this group
        </p>
        <div className="flex items-center gap-2">
          {selectedToRemove.length > 0 && (
            <Button variant="outline" size="sm" className="text-destructive" onClick={handleRemoveSelected} disabled={removing}>
              {removing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
              Remove {selectedToRemove.length} selected
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Projects
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading...
        </div>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No projects in this group yet.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto border rounded bg-background divide-y">
          {projects.map((p) => (
            <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
              <input
                type="checkbox"
                checked={selectedToRemove.includes(p.id)}
                onChange={(e) => {
                  setSelectedToRemove((prev) =>
                    e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                  );
                }}
              />
              <span className="font-mono text-[10px] bg-muted px-1 rounded text-muted-foreground">{p.id}</span>
              <span className="flex-1">{p.name}</span>
              {p.status && <span className="text-xs text-muted-foreground">{p.status}</span>}
            </label>
          ))}
        </div>
      )}

      {pickerOpen && (
        <ProjectPickerDialog
          group={group}
          existingIds={new Set(projects.map((p) => p.id))}
          onClose={() => setPickerOpen(false)}
          onAdded={() => { load(); onChanged(); }}
        />
      )}
    </div>
  );
};

// ── Add-projects picker ─────────────────────────────────────────────────────

const ProjectPickerDialog: React.FC<{
  group: MasterGroup;
  existingIds: Set<number>;
  onClose: () => void;
  onAdded: () => void;
}> = ({ group, existingIds, onClose, onAdded }) => {
  const [allProjects, setAllProjects] = useState<AllProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get("/super-admin/projects")
      .then((res) => setAllProjects((res.data || []).map((p: any) => ({ ObjectId: p.ObjectId, Name: p.Name }))))
      .catch(() => toast.error("Could not load the project list"))
      .finally(() => setLoading(false));
  }, []);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allProjects
      .filter((p) => !existingIds.has(p.ObjectId))
      .filter((p) => !q || p.Name.toLowerCase().includes(q) || String(p.ObjectId).includes(q));
  }, [allProjects, existingIds, search]);

  const handleAdd = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      const result = await addMasterGroupProjects(group.id, selected);
      toast.success(result.message);
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail?.message || "Could not add the selected projects");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Add projects to {group.name}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search projects..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading projects...
            </div>
          ) : available.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">No matching projects.</p>
          ) : (
            available.map((p) => (
              <label key={p.ObjectId} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/40 rounded">
                <input
                  type="checkbox"
                  checked={selected.includes(p.ObjectId)}
                  onChange={(e) => {
                    setSelected((prev) => e.target.checked ? [...prev, p.ObjectId] : prev.filter((id) => id !== p.ObjectId));
                  }}
                />
                <span className="font-mono text-[10px] bg-muted px-1 rounded text-muted-foreground">{p.ObjectId}</span>
                {p.Name}
              </label>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAdd} disabled={selected.length === 0 || saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Add {selected.length > 0 ? selected.length : ""} project{selected.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Assign-to-user dialog ───────────────────────────────────────────────────

const AssignToUserDialog: React.FC<{ group: MasterGroup; onClose: () => void }> = ({ group, onClose }) => {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserOption[]>([]);
  const [assigning, setAssigning] = useState<AssignMode | null>(null);

  useEffect(() => {
    apiClient.get("/super-admin/users", { params: { pageSize: 0 } })
      .then((res) => setUsers((res.data.items || []).map((u: any) => ({ ObjectId: u.ObjectId, Name: u.Name, Email: u.Email }))))
      .catch(() => toast.error("Could not load the user list"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.Name.toLowerCase().includes(q) || u.Email.toLowerCase().includes(q));
  }, [users, search]);

  const selectedIds = useMemo(() => new Set(selected.map((u) => u.ObjectId)), [selected]);

  const toggleUser = (u: UserOption) => {
    setSelected((prev) =>
      prev.some((p) => p.ObjectId === u.ObjectId)
        ? prev.filter((p) => p.ObjectId !== u.ObjectId)
        : [...prev, u]
    );
  };

  const handleAssign = async (mode: AssignMode) => {
    if (selected.length === 0) return;
    if (mode === "reset") {
      const ok = await showConfirm(
        `This removes ALL current project assignments for ${selected.length} user(s) ` +
          `(${selected.map((u) => u.Name).join(", ")}) and replaces them with "${group.name}"'s ` +
          `${group.projectCount} project(s). This can't be undone from this screen.`,
        { title: "Reset & Assign", tone: "warning", confirmLabel: "Reset & Assign", cancelLabel: "Cancel" },
      );
      if (!ok) return;
    }

    setAssigning(mode);
    try {
      const result = await assignMasterGroup(group.id, selected.map((u) => u.ObjectId), mode);
      toast.success(result.message);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail?.message || "Could not assign the group");
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" /> Assign "{group.name}"
            </h3>
            <p className="text-xs text-muted-foreground">{group.projectCount} project(s) in this group</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-3 border-b bg-muted/20">
            {selected.map((u) => (
              <span key={u.ObjectId} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs pl-2.5 pr-1 py-1">
                {u.Name}
                <button onClick={() => toggleUser(u)} className="hover:bg-primary/20 rounded-full p-0.5" title="Remove">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search users by name or email..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading users...
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">No matching users.</p>
          ) : (
            filtered.map((u) => (
              <label
                key={u.ObjectId}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 rounded"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(u.ObjectId)}
                  onChange={() => toggleUser(u)}
                />
                <span className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                  <span className="font-medium">{u.Name}</span>
                  <span className="text-xs text-muted-foreground truncate">{u.Email}</span>
                </span>
              </label>
            ))
          )}
        </div>

        <div className="border-t p-4 space-y-2">
          <Button
            className="w-full justify-start" variant="outline"
            disabled={selected.length === 0 || assigning !== null}
            onClick={() => handleAssign("add")}
          >
            {assigning === "add" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add to Existing{selected.length > 0 ? ` (${selected.length} user${selected.length === 1 ? "" : "s"})` : ""}
            <span className="ml-auto text-xs text-muted-foreground font-normal hidden sm:inline">keeps current, adds this group</span>
          </Button>
          <Button
            className="w-full justify-start" variant="outline"
            disabled={selected.length === 0 || assigning !== null}
            onClick={() => handleAssign("reset")}
          >
            {assigning === "reset" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Reset &amp; Assign Only This{selected.length > 0 ? ` (${selected.length} user${selected.length === 1 ? "" : "s"})` : ""}
            <span className="ml-auto text-xs text-muted-foreground font-normal hidden sm:inline">removes current first</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MasterGroupsTab;
