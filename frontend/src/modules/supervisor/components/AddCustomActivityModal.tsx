import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface AddCustomActivityModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (activity: {
        description: string;
        uom: string;
        scope: number;
        wbsName: string;
        category: string;
        plannedStart: string;
        plannedFinish: string;
        remarks: string;
        extraData: Record<string, any>;
    }) => void;
    sheetType: string;
    defaultWbsName?: string;
    defaultCategory?: string;
}

const UOM_OPTIONS = ['Nos', 'Mtr', 'Sqm', 'Cum', 'MT', 'KM', 'Set', 'Lot', 'Each', 'RM', 'Days'];

export const AddCustomActivityModal: React.FC<AddCustomActivityModalProps> = ({
    isOpen,
    onClose,
    onAdd,
    sheetType,
    defaultWbsName = '',
    defaultCategory = '',
}) => {
    const [description, setDescription] = useState('');
    const [uom, setUom] = useState('Nos');
    const [scope, setScope] = useState('');
    const [wbsName, setWbsName] = useState(defaultWbsName);
    const [category, setCategory] = useState(defaultCategory);
    const [plannedStart, setPlannedStart] = useState('');
    const [plannedFinish, setPlannedFinish] = useState('');
    const [remarks, setRemarks] = useState('');

    // Sheet-specific fields
    const [vendorName, setVendorName] = useState('');
    const [priority, setPriority] = useState('');
    const [duration, setDuration] = useState('');
    const [feederName, setFeederName] = useState('');
    const [lineKm, setLineKm] = useState('');
    const [totalPole, setTotalPole] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!description.trim()) return;

        const extraData: Record<string, any> = {};
        if (sheetType === 'wind_pss') {
            if (vendorName) extraData.vendorName = vendorName;
            if (priority) extraData.priority = priority;
            if (duration) extraData.duration = duration;
        } else if (sheetType === 'wind_33kv') {
            if (vendorName) extraData.agencyName = vendorName; // 33KV uses agencyName or vendor
            if (feederName) extraData.feeder = feederName;
            if (lineKm) extraData.lineKm = lineKm;
            if (totalPole) extraData.totalPole = totalPole;
        }

        onAdd({
            description: description.trim(),
            uom,
            scope: Number(scope) || 0,
            wbsName,
            category,
            plannedStart,
            plannedFinish,
            remarks,
            extraData,
        });

        // Reset form
        setDescription('');
        setScope('');
        setRemarks('');
        setPlannedStart('');
        setPlannedFinish('');
        setVendorName('');
        setPriority('');
        setDuration('');
        setFeederName('');
        setLineKm('');
        setTotalPole('');
        onClose();
    };

    const sheetLabel = sheetType === 'wind_ehv' ? 'EHV' :
                       sheetType === 'wind_pss' ? 'PSS' :
                       sheetType === 'wind_33kv' ? '33KV' : sheetType;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700">
                    <div className="flex items-center gap-2 text-white">
                        <Plus className="w-5 h-5" />
                        <h3 className="text-lg font-semibold">Add DPR Activity — {sheetLabel}</h3>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Activity Description <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g., 400KV Cable Laying - Phase B"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            required
                            autoFocus
                        />
                    </div>

                    {/* UOM + Scope */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">UOM</label>
                            <select
                                value={uom}
                                onChange={(e) => setUom(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            >
                                {UOM_OPTIONS.map(u => (
                                    <option key={u} value={u}>{u}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Scope / Quantity</label>
                            <input
                                type="number"
                                value={scope}
                                onChange={(e) => setScope(e.target.value)}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                        </div>
                    </div>

                    {/* WBS Name + Category */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">WBS / Section</label>
                            <input
                                type="text"
                                value={wbsName}
                                onChange={(e) => setWbsName(e.target.value)}
                                placeholder="e.g., BOS CONSTRUCTION"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                            <input
                                type="text"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                placeholder="e.g., EHV, PSS"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Planned Start</label>
                            <input
                                type="date"
                                value={plannedStart}
                                onChange={(e) => setPlannedStart(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Planned Finish</label>
                            <input
                                type="date"
                                value={plannedFinish}
                                onChange={(e) => setPlannedFinish(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                        </div>
                    </div>

                    {/* Sheet-Specific Extra Fields */}
                    {sheetType === 'wind_pss' && (
                        <div className="grid grid-cols-3 gap-4 border-t border-gray-200 pt-3 mt-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Vendor Name</label>
                                <input
                                    type="text"
                                    value={vendorName}
                                    onChange={(e) => setVendorName(e.target.value)}
                                    placeholder="Vendor"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                                <input
                                    type="text"
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value)}
                                    placeholder="e.g. High"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Duration</label>
                                <input
                                    type="text"
                                    value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                    placeholder="e.g. 10d"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                        </div>
                    )}

                    {sheetType === 'wind_33kv' && (
                        <div className="grid grid-cols-2 gap-4 border-t border-gray-200 pt-3 mt-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Vendor / Agency</label>
                                <input
                                    type="text"
                                    value={vendorName}
                                    onChange={(e) => setVendorName(e.target.value)}
                                    placeholder="Vendor"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Feeder Name</label>
                                <input
                                    type="text"
                                    value={feederName}
                                    onChange={(e) => setFeederName(e.target.value)}
                                    placeholder="e.g. FDR-01"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Line in KM</label>
                                <input
                                    type="number"
                                    value={lineKm}
                                    onChange={(e) => setLineKm(e.target.value)}
                                    placeholder="0"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Total Poles</label>
                                <input
                                    type="number"
                                    value={totalPole}
                                    onChange={(e) => setTotalPole(e.target.value)}
                                    placeholder="0"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                        </div>
                    )}

                    {/* Remarks */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                        <textarea
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Optional notes..."
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                        />
                    </div>

                    {/* Info banner */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-800">
                        <strong>DPR-Level Activity:</strong> This activity will be tracked within DPR only. It will not be synced to Oracle P6.
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!description.trim()}
                            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                        >
                            <Plus className="w-4 h-4" />
                            Add Activity
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
