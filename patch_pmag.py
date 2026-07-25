import re

# PMAGDashboardDetailModal.tsx
path1 = r'd:\DPR\Digitalized_DPR_Prod\frontend\src\modules\pmag\components\PMAGDashboardDetailModal.tsx'
with open(path1, 'r', encoding='utf-8') as f:
    content1 = f.read()

import1_old = """    WindSummaryTable,
    WindProgressTable,
    WindManpowerTable,
    PSSSummaryTable,"""
import1_new = """    WindSummaryTable,
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
content1 = content1.replace(import1_old, import1_new)

render1_old = """                        {entry.sheet_type === 'wind_manpower' && (
                            <WindManpowerTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} today={entryData.staticHeader?.reportingDate || today} yesterday={entryData.staticHeader?.progressDate || yesterday} />
                        )}"""
render1_new = """                        {entry.sheet_type === 'wind_manpower' && (
                            <WindManpowerTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} today={entryData.staticHeader?.reportingDate || today} yesterday={entryData.staticHeader?.progressDate || yesterday} />
                        )}
                        {entry.sheet_type === 'wind_33kv' && (
                            <Wind33KVTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} />
                        )}
                        {entry.sheet_type === 'wind_33kv_oh' && (
                            <Wind33KVOHTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} />
                        )}
                        {entry.sheet_type === 'wind_erection' && (
                            <WindErectionTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} />
                        )}
                        {entry.sheet_type === 'wind_stone_column' && (
                            <WindStoneColumnTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} />
                        )}
                        {entry.sheet_type === 'wind_pss' && (
                            <WindPSSTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} />
                        )}
                        {entry.sheet_type === 'wind_ehv' && (
                            <WindEHVTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} />
                        )}
                        {entry.sheet_type === 'wind_productivity' && (
                            <WindProductivityTable data={entryData.rows} setData={() => { }} isLocked={true} />
                        )}"""
content1 = content1.replace(render1_old, render1_new)

with open(path1, 'w', encoding='utf-8') as f:
    f.write(content1)

# PMAGEditEntryModal.tsx
path2 = r'd:\DPR\Digitalized_DPR_Prod\frontend\src\modules\pmag\components\PMAGEditEntryModal.tsx'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()

import2_old = """    WindSummaryTable,
    WindProgressTable,
    WindManpowerTable,
    PSSSummaryTable,"""
import2_new = """    WindSummaryTable,
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
content2 = content2.replace(import2_old, import2_new)

render2_old = """                    {editingEntry.sheet_type === 'wind_manpower' && (
                        <WindManpowerTable 
                            data={editData.rows} 
                            setData={(newRows) => setEditData({ ...editData, rows: newRows })} 
                            onSave={() => {}} 
                            onSubmit={handleSaveEdit} 
                            isLocked={false} 
                            status={editingEntry.status} 
                            yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday}
                            today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} 
                        />
                    )}"""
render2_new = """                    {editingEntry.sheet_type === 'wind_manpower' && (
                        <WindManpowerTable 
                            data={editData.rows} 
                            setData={(newRows) => setEditData({ ...editData, rows: newRows })} 
                            onSave={() => {}} 
                            onSubmit={handleSaveEdit} 
                            isLocked={false} 
                            status={editingEntry.status} 
                            yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday}
                            today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} 
                        />
                    )}
                    {editingEntry.sheet_type === 'wind_33kv' && (
                        <Wind33KVTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_33kv_oh' && (
                        <Wind33KVOHTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_erection' && (
                        <WindErectionTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_stone_column' && (
                        <WindStoneColumnTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_pss' && (
                        <WindPSSTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_ehv' && (
                        <WindEHVTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} isLocked={false} status={editingEntry.status} />
                    )}
                    {editingEntry.sheet_type === 'wind_productivity' && (
                        <WindProductivityTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} isLocked={false} />
                    )}"""
content2 = content2.replace(render2_old, render2_new)

generic_old = """!['dp_qty', 'dc_sheet', 'ac_sheet', 'testing_commissioning', 'wind_progress', 'wind_summary', 'wind_manpower', 'pss_progress', 'pss_summary', 'pss_manpower', 'manpower_details'].includes(editingEntry.sheet_type)"""
generic_new = """!['dp_qty', 'dc_sheet', 'ac_sheet', 'testing_commissioning', 'wind_progress', 'wind_summary', 'wind_manpower', 'wind_33kv', 'wind_33kv_oh', 'wind_erection', 'wind_stone_column', 'wind_pss', 'wind_ehv', 'wind_productivity', 'pss_progress', 'pss_summary', 'pss_manpower', 'manpower_details'].includes(editingEntry.sheet_type)"""
content2 = content2.replace(generic_old, generic_new)

with open(path2, 'w', encoding='utf-8') as f:
    f.write(content2)

print("Patch applied to PMAG modals.")
