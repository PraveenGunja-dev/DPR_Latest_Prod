import io
from typing import List, Dict, Any
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def generate_drone_excel(data: List[Dict[str, Any]], report_date: str) -> io.BytesIO:
    """
    Generate an Excel workbook with 4 sheets matching the exact categories from Spectra APIs:
    1. Construction Variation (block_progress)
    2. Inverter Variation (inverter_progress)
    3. Robot Variation (robot_progress)
    4. AC Work Variation (ac_work_progress)
    """
    wb = openpyxl.Workbook()
    # Remove default sheet
    wb.remove(wb.active)

    # Common styles
    header_font = Font(bold=True, color="000000")
    header_fill = PatternFill("solid", fgColor="DDEBF7")  # Light blue
    drone_fill = PatternFill("solid", fgColor="FCE4D6")   # Light orange for drone
    dpr_fill = PatternFill("solid", fgColor="E2EFDA")     # Light green for dpr
    var_fill = PatternFill("solid", fgColor="FFF2CC")     # Light yellow for variance
    
    thin_border = Border(left=Side(style='thin'), right=Side(style='thin'),
                         top=Side(style='thin'), bottom=Side(style='thin'))
    center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)

    def apply_header_style(cell, fill_color=header_fill):
        cell.font = header_font
        cell.fill = fill_color
        cell.border = thin_border
        cell.alignment = center_align

    def apply_data_style(cell):
        cell.border = thin_border
        cell.alignment = center_align

    def build_variation_sheet(sheet_name: str, items: List[Dict[str, Any]]):
        ws = wb.create_sheet(sheet_name)
        
        if not items:
            ws.cell(row=1, column=1, value="No data available for this category.")
            ws.column_dimensions['A'].width = 30
            return

        # Collect all unique blocks across all items for this category
        all_blocks = set()
        for item in items:
            for b in item.get("block_breakdown", []):
                block_name = b.get("block")
                if block_name:
                    all_blocks.add(block_name)
        sorted_blocks = sorted(list(all_blocks))

        # Headers
        ws.merge_cells('A1:A2')
        ws['A1'] = "Block"
        apply_header_style(ws['A1'])
        apply_header_style(ws['A2'])

        col_idx = 2
        for item in items:
            act_name = item.get("activity") or "Activity"
            # Merge Top Header (3 columns per activity)
            start_col = get_column_letter(col_idx)
            end_col = get_column_letter(col_idx + 2)
            ws.merge_cells(f"{start_col}1:{end_col}1")
            ws[f"{start_col}1"] = act_name
            apply_header_style(ws[f"{start_col}1"])
            
            # Subheaders
            ws.cell(row=2, column=col_idx, value="DRONE")
            apply_header_style(ws.cell(row=2, column=col_idx), drone_fill)
            
            ws.cell(row=2, column=col_idx+1, value="DPR")
            apply_header_style(ws.cell(row=2, column=col_idx+1), dpr_fill)
            
            ws.cell(row=2, column=col_idx+2, value="VARIATION")
            apply_header_style(ws.cell(row=2, column=col_idx+2), var_fill)
            
            col_idx += 3

        # Rows
        row_idx = 3
        for block in sorted_blocks:
            ws.cell(row=row_idx, column=1, value=block)
            apply_data_style(ws.cell(row=row_idx, column=1))
            
            c_idx = 2
            for item in items:
                # Find block breakdown for this specific block
                block_data = {"drone": 0, "dpr": 0, "variance": 0}
                for b in item.get("block_breakdown", []):
                    if b.get("block") == block:
                        block_data = {
                            "drone": b.get("drone_actual", 0),
                            "dpr": b.get("dpr_actual", 0),
                            "variance": b.get("variance", 0)
                        }
                        break
                
                c_drone = ws.cell(row=row_idx, column=c_idx, value=block_data["drone"])
                apply_data_style(c_drone)
                
                c_dpr = ws.cell(row=row_idx, column=c_idx+1, value=block_data["dpr"])
                apply_data_style(c_dpr)
                
                c_var = ws.cell(row=row_idx, column=c_idx+2, value=block_data["variance"])
                apply_data_style(c_var)
                
                c_idx += 3
            row_idx += 1

        # Adjust column widths
        for col in range(1, col_idx):
            col_letter = get_column_letter(col)
            if col == 1:
                ws.column_dimensions[col_letter].width = 18
            else:
                ws.column_dimensions[col_letter].width = 15

    # Filter items based on spectra_api
    const_items = [item for item in data if item.get("spectra_api") == "block_progress"]
    inv_items = [item for item in data if item.get("spectra_api") == "inverter_progress"]
    robot_items = [item for item in data if item.get("spectra_api") == "robot_progress"]
    ac_items = [item for item in data if item.get("spectra_api") == "ac_work_progress"]

    # Build the sheets dynamically
    build_variation_sheet("Construction Variation", const_items)
    build_variation_sheet("Inverter Variation", inv_items)
    build_variation_sheet("Robot Variation", robot_items)
    build_variation_sheet("AC Work Variation", ac_items)

    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def generate_bess_drone_excel(blocks: List[Dict[str, Any]], report_date: str, project_label: str,
                              sync_info: Dict[str, Any] | None = None) -> io.BytesIO:
    """
    Excel report of the BESS (PSS 13 / PSS 14) drone survey - drone data only, no DPR side.

    Sheet 1 "Block Wise": one row per block, and for every structure/stage a Scope, Work Done and
    % Done column (the same block-per-row layout the Solar report uses), with a Total row.
    Sheet 2 "Summary": the totals by structure and stage across all blocks.
    A null work_done (not detected in the survey) is written as "ND" and counts as 0 in the totals.
    """
    wb = openpyxl.Workbook()
    header_font = Font(bold=True, color="000000")
    header_fill = PatternFill("solid", fgColor="DDEBF7")
    scope_fill = PatternFill("solid", fgColor="E2EFDA")
    done_fill = PatternFill("solid", fgColor="FCE4D6")
    pct_fill = PatternFill("solid", fgColor="FFF2CC")
    total_fill = PatternFill("solid", fgColor="D9D9D9")
    thin = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    center = Alignment(horizontal='center', vertical='center', wrap_text=True)

    def head(cell, fill=header_fill):
        cell.font, cell.fill, cell.border, cell.alignment = header_font, fill, thin, center

    def body(cell, bold=False, fill=None):
        cell.border, cell.alignment = thin, center
        if bold:
            cell.font = Font(bold=True)
        if fill:
            cell.fill = fill

    def num(v):
        return None if v is None else float(v)

    def pct(done, scope):
        return round(done / scope * 100, 1) if scope else None

    # (structure, stage) columns in the order Spectra lists them
    columns: List[tuple] = []
    for block in blocks:
        for st in block.get("structures") or []:
            for sg in st.get("stages") or []:
                key = (st.get("name") or "", sg.get("name") or "")
                if key not in columns:
                    columns.append(key)

    # ---------------------------------------------------------------- Block Wise
    ws = wb.active
    ws.title = "Block Wise"
    ws["A1"] = f"{project_label} - drone survey progress | Report date: {report_date}"
    ws["A1"].font = Font(bold=True, size=12)
    meta = (sync_info or {}).get("bess_progress") or {}
    if meta.get("last_synced_date"):
        ws["A2"] = f"Drone data last synced: {meta['last_synced_date']}"

    top, sub = 4, 5
    ws.merge_cells(start_row=top, start_column=1, end_row=sub, end_column=1)
    ws.cell(row=top, column=1, value="Block")
    head(ws.cell(row=top, column=1))
    head(ws.cell(row=sub, column=1))

    col = 2
    for structure, stage in columns:
        ws.merge_cells(start_row=top, start_column=col, end_row=top, end_column=col + 2)
        ws.cell(row=top, column=col, value=f"{structure} - {stage}")
        for k, (label, fill) in enumerate((("SCOPE", scope_fill), ("WORK DONE", done_fill), ("% DONE", pct_fill))):
            head(ws.cell(row=top, column=col + k))
            ws.cell(row=sub, column=col + k, value=label)
            head(ws.cell(row=sub, column=col + k), fill)
        col += 3

    totals = {key: [0.0, 0.0] for key in columns}
    row_idx = sub + 1
    for block in blocks:
        ws.cell(row=row_idx, column=1, value=block.get("block_name"))
        body(ws.cell(row=row_idx, column=1), bold=True)
        lookup = {}
        for st in block.get("structures") or []:
            for sg in st.get("stages") or []:
                lookup[(st.get("name") or "", sg.get("name") or "")] = sg
        col = 2
        for key in columns:
            sg = lookup.get(key)
            scope = num(sg.get("scope")) if sg else None
            done = num(sg.get("work_done")) if sg else None
            ws.cell(row=row_idx, column=col, value=scope)
            ws.cell(row=row_idx, column=col + 1, value=("ND" if (sg is not None and done is None) else done))
            ws.cell(row=row_idx, column=col + 2, value=pct(done or 0, scope) if scope else None)
            for k in range(3):
                body(ws.cell(row=row_idx, column=col + k))
            totals[key][0] += scope or 0
            totals[key][1] += done or 0
            col += 3
        row_idx += 1

    ws.cell(row=row_idx, column=1, value="Total")
    body(ws.cell(row=row_idx, column=1), bold=True, fill=total_fill)
    col = 2
    for key in columns:
        scope, done = totals[key]
        ws.cell(row=row_idx, column=col, value=scope)
        ws.cell(row=row_idx, column=col + 1, value=done)
        ws.cell(row=row_idx, column=col + 2, value=pct(done, scope))
        for k in range(3):
            body(ws.cell(row=row_idx, column=col + k), bold=True, fill=total_fill)
        col += 3

    ws.column_dimensions['A'].width = 16
    for c in range(2, col):
        ws.column_dimensions[get_column_letter(c)].width = 13
    ws.freeze_panes = ws.cell(row=sub + 1, column=2)

    # ---------------------------------------------------------------- Summary
    sm = wb.create_sheet("Summary")
    headers = ["Structure", "Stage", "Total Scope", "Total Work Done", "% Done", "Blocks"]
    for i, h in enumerate(headers, 1):
        sm.cell(row=1, column=i, value=h)
        head(sm.cell(row=1, column=i))
    for r, (structure, stage) in enumerate(columns, 2):
        scope, done = totals[(structure, stage)]
        n_blocks = sum(1 for b in blocks for st in (b.get("structures") or []) for sg in (st.get("stages") or [])
                       if (st.get("name") or "", sg.get("name") or "") == (structure, stage))
        for i, v in enumerate([structure, stage, scope, done, pct(done, scope), n_blocks], 1):
            sm.cell(row=r, column=i, value=v)
            body(sm.cell(row=r, column=i))
    for letter, width in zip("ABCDEF", (14, 38, 14, 16, 10, 10)):
        sm.column_dimensions[letter].width = width

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
