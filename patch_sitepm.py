import re

# PMEditEntryModal.tsx
path = r'd:\DPR\Digitalized_DPR_Prod\frontend\src\modules\sitepm\components\PMEditEntryModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

import_old = """    WindSummaryTable,
    WindProgressTable,
    WindManpowerTable,
    PSSSummaryTable,"""
import_new = """    WindSummaryTable,
    WindProgressTable,
    WindManpowerTable,
    Wind33KVTable,
    Wind33KVOHTable,
    WindPSSTable,
    WindEHVTable,
    WindStoneColumnTable,
    WindErectionTable,
    WindProductivityTable,
    PSSSummaryTable,"""
content = content.replace(import_old, import_new)

render_old = """                    {editingEntry.sheet_type === 'wind_manpower' && (
                        <WindManpowerTable
                            data={editData.rows}
                            setData={(newRows) => setEditData({ ...editData, rows: newRows })}
                            onSave={() => { }}
                            onSubmit={onSave}
                            isLocked={false}
                            status={editingEntry.status}
                            yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday}
                            today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today}
                        />
                    )}"""
render_new = """                    {editingEntry.sheet_type === 'wind_manpower' && (
                        <WindManpowerTable
                            data={editData.rows}
                            setData={(newRows) => setEditData({ ...editData, rows: newRows })}
                            onSave={() => { }}
                            onSubmit={onSave}
                            isLocked={false}
                            status={editingEntry.status}
                            yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday}
                            today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today}
                        />
                    )}
                    {editingEntry.sheet_type === 'wind_33kv' && (
                        <Wind33KVTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={onSave} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_33kv_oh' && (
                        <Wind33KVOHTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={onSave} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_erection' && (
                        <WindErectionTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={onSave} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_stone_column' && (
                        <WindStoneColumnTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={onSave} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_pss' && (
                        <WindPSSTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={onSave} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_ehv' && (
                        <WindEHVTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={onSave} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_productivity' && (
                        <WindProductivityTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} isLocked={false} />
                    )}"""
content = content.replace(render_old, render_new)

generic_old = """!['dp_qty', 'dc_sheet', 'ac_sheet', 'testing_commissioning', 'wind_progress', 'wind_summary', 'wind_manpower', 'pss_progress', 'pss_summary', 'pss_manpower', 'manpower_details'].includes(editingEntry.sheet_type)"""
generic_new = """!['dp_qty', 'dc_sheet', 'ac_sheet', 'testing_commissioning', 'wind_progress', 'wind_summary', 'wind_manpower', 'wind_33kv', 'wind_33kv_oh', 'wind_erection', 'wind_stone_column', 'wind_pss', 'wind_ehv', 'wind_productivity', 'pss_progress', 'pss_summary', 'pss_manpower', 'manpower_details'].includes(editingEntry.sheet_type)"""
content = content.replace(generic_old, generic_new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied to Site PM Edit Entry Modal.")
