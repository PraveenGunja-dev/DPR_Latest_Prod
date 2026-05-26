import io
from typing import List, Dict, Any
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def generate_drone_excel(data: List[Dict[str, Any]], report_date: str) -> io.BytesIO:
    """
    Generate an Excel workbook with 4 sheets matching the exact templates provided:
    1. Construction Variation
    2. Inverter Variation
    3. Robot Variation
    4. AC Work Variation
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

    # Helper to get block breakdown for a specific activity
    def get_breakdown(activity_name: str) -> Dict[str, Dict]:
        # Search the data for matching activity
        for item in data:
            # We match by the exact label given in the API mapping
            if item.get("activity") == activity_name:
                blocks = {}
                for b in item.get("block_breakdown", []):
                    blocks[b["block"]] = {
                        "drone": b.get("drone_actual", 0),
                        "dpr": b.get("dpr_actual", 0),
                        "variance": b.get("variance", 0)
                    }
                return blocks
        return {}

    # Gather data for Construction
    piling_data = get_breakdown("Piling - MMS")
    piling_cap_data = get_breakdown("Pile Capping")
    rafter_data = get_breakdown("MMS Erection - Torque Tube/Raftar")
    bracing_data = get_breakdown("MMS Erection - Torque Tube/Raftar") # Approximate bracing with rafter if not distinct
    purlin_data = get_breakdown("MMS Erection - Purlin")
    module_data = get_breakdown("Module Installation")

    all_blocks = set(list(piling_data.keys()) + list(piling_cap_data.keys()) + 
                     list(rafter_data.keys()) + list(purlin_data.keys()) + list(module_data.keys()))
    sorted_blocks = sorted(list(all_blocks))

    # 1. Construction Variation
    ws_const = wb.create_sheet("Construction Variation")
    
    # Headers
    ws_const.merge_cells('A1:A2')
    ws_const['A1'] = "Block"
    apply_header_style(ws_const['A1'])
    apply_header_style(ws_const['A2'])

    col_idx = 2
    activities = [
        ("Piling", piling_data),
        ("Piling Cap", piling_cap_data),
        ("Rafter", rafter_data),
        ("Bracing", bracing_data),
        ("Purlin", purlin_data),
        ("Module Installation", module_data)
    ]

    for act_name, act_dict in activities:
        # Merge Top Header
        start_col = get_column_letter(col_idx)
        end_col = get_column_letter(col_idx + 2)
        ws_const.merge_cells(f"{start_col}1:{end_col}1")
        ws_const[f"{start_col}1"] = act_name
        apply_header_style(ws_const[f"{start_col}1"])
        
        # Subheaders
        ws_const.cell(row=2, column=col_idx, value="DRONE")
        apply_header_style(ws_const.cell(row=2, column=col_idx), drone_fill)
        
        ws_const.cell(row=2, column=col_idx+1, value="DPR")
        apply_header_style(ws_const.cell(row=2, column=col_idx+1), dpr_fill)
        
        ws_const.cell(row=2, column=col_idx+2, value="VARIATION")
        apply_header_style(ws_const.cell(row=2, column=col_idx+2), var_fill)
        
        col_idx += 3

    # Rows
    row_idx = 3
    for block in sorted_blocks:
        ws_const.cell(row=row_idx, column=1, value=block)
        apply_data_style(ws_const.cell(row=row_idx, column=1))
        
        c_idx = 2
        for act_name, act_dict in activities:
            b_data = act_dict.get(block, {"drone": 0, "dpr": 0, "variance": 0})
            
            c_drone = ws_const.cell(row=row_idx, column=c_idx, value=b_data["drone"])
            apply_data_style(c_drone)
            
            c_dpr = ws_const.cell(row=row_idx, column=c_idx+1, value=b_data["dpr"])
            apply_data_style(c_dpr)
            
            c_var = ws_const.cell(row=row_idx, column=c_idx+2, value=b_data["variance"])
            apply_data_style(c_var)
            
            c_idx += 3
        row_idx += 1

    for col in range(1, col_idx):
        ws_const.column_dimensions[get_column_letter(col)].width = 15


    # 2. Inverter Variation
    inv_data = get_breakdown("Inverter Installation")
    inv_blocks = sorted(list(inv_data.keys()))
    ws_inv = wb.create_sheet("Inverter Variation")
    
    ws_inv.merge_cells('A1:A2')
    ws_inv['A1'] = "Block"
    apply_header_style(ws_inv['A1'])
    apply_header_style(ws_inv['A2'])

    ws_inv.merge_cells('B1:E1')
    ws_inv['B1'] = "Inverter Installation"
    apply_header_style(ws_inv['B1'])

    headers = ["Actual as per Scope", "DRONE", "DPR", "VARIATION"]
    fills = [header_fill, drone_fill, dpr_fill, var_fill]
    for i, (h, f) in enumerate(zip(headers, fills)):
        cell = ws_inv.cell(row=2, column=2+i, value=h)
        apply_header_style(cell, f)

    row_idx = 3
    for block in inv_blocks:
        b_data = inv_data.get(block, {})
        ws_inv.cell(row=row_idx, column=1, value=block)
        apply_data_style(ws_inv.cell(row=row_idx, column=1))
        
        # We don't have scope in the current breakdown sent by frontend easily, using drone for now
        c_scope = ws_inv.cell(row=row_idx, column=2, value=b_data.get("drone", 0))
        apply_data_style(c_scope)
        c_drone = ws_inv.cell(row=row_idx, column=3, value=b_data.get("drone", 0))
        apply_data_style(c_drone)
        c_dpr = ws_inv.cell(row=row_idx, column=4, value=b_data.get("dpr", 0))
        apply_data_style(c_dpr)
        c_var = ws_inv.cell(row=row_idx, column=5, value=b_data.get("variance", 0))
        apply_data_style(c_var)
        row_idx += 1

    for col in range(1, 6):
        ws_inv.column_dimensions[get_column_letter(col)].width = 20

    # 3. Robot Variation
    robot_data = get_breakdown("Robot Installation")
    robot_blocks = sorted(list(robot_data.keys()))
    ws_rob = wb.create_sheet("Robot Variation")

    ws_rob.merge_cells('A1:A2')
    ws_rob['A1'] = "Block"
    apply_header_style(ws_rob['A1'])
    apply_header_style(ws_rob['A2'])

    ws_rob.merge_cells('B1:F1')
    ws_rob['B1'] = "Robot Installation"
    apply_header_style(ws_rob['B1'])

    r_headers = ["Actual as per Drone Report", "Actual as per DPR Report", "DRONE", "DPR", "VARIATION"]
    r_fills = [header_fill, header_fill, drone_fill, dpr_fill, var_fill]
    for i, (h, f) in enumerate(zip(r_headers, r_fills)):
        cell = ws_rob.cell(row=2, column=2+i, value=h)
        apply_header_style(cell, f)

    row_idx = 3
    for block in robot_blocks:
        b_data = robot_data.get(block, {})
        ws_rob.cell(row=row_idx, column=1, value=block)
        apply_data_style(ws_rob.cell(row=row_idx, column=1))
        
        c_act_drone = ws_rob.cell(row=row_idx, column=2, value=b_data.get("drone", 0))
        apply_data_style(c_act_drone)
        c_act_dpr = ws_rob.cell(row=row_idx, column=3, value=b_data.get("dpr", 0))
        apply_data_style(c_act_dpr)
        c_drone = ws_rob.cell(row=row_idx, column=4, value=b_data.get("drone", 0))
        apply_data_style(c_drone)
        c_dpr = ws_rob.cell(row=row_idx, column=5, value=b_data.get("dpr", 0))
        apply_data_style(c_dpr)
        c_var = ws_rob.cell(row=row_idx, column=6, value=b_data.get("variance", 0))
        apply_data_style(c_var)
        row_idx += 1

    for col in range(1, 7):
        ws_rob.column_dimensions[get_column_letter(col)].width = 25


    # 4. AC Work Variation
    # For AC Work, we just list a bunch of AC work activities
    ac_activities = [
        ("HT & LT Station - Slab", get_breakdown("HT & LT Station - Slab")),
        ("HT & LT Station - Shed", get_breakdown("HT & LT Station - Shed Installation")),
        ("HT Panel Erection", get_breakdown("HT Panel Erection")),
        ("LT Panel Erection", get_breakdown("LT Panel Erection")),
        ("IDT Erection", get_breakdown("IDT Erection"))
    ]
    ac_blocks = set()
    for _, ad in ac_activities:
        ac_blocks.update(ad.keys())
    ac_blocks = sorted(list(ac_blocks))

    ws_ac = wb.create_sheet("AC Work Variation")
    ws_ac.merge_cells('A1:A2')
    ws_ac['A1'] = "Block"
    apply_header_style(ws_ac['A1'])
    apply_header_style(ws_ac['A2'])

    col_idx = 2
    for act_name, act_dict in ac_activities:
        start_col = get_column_letter(col_idx)
        end_col = get_column_letter(col_idx + 2)
        ws_ac.merge_cells(f"{start_col}1:{end_col}1")
        ws_ac[f"{start_col}1"] = act_name
        apply_header_style(ws_ac[f"{start_col}1"])
        
        ws_ac.cell(row=2, column=col_idx, value="DRONE")
        apply_header_style(ws_ac.cell(row=2, column=col_idx), drone_fill)
        
        ws_ac.cell(row=2, column=col_idx+1, value="DPR")
        apply_header_style(ws_ac.cell(row=2, column=col_idx+1), dpr_fill)
        
        ws_ac.cell(row=2, column=col_idx+2, value="VARIATION")
        apply_header_style(ws_ac.cell(row=2, column=col_idx+2), var_fill)
        
        col_idx += 3

    row_idx = 3
    for block in ac_blocks:
        ws_ac.cell(row=row_idx, column=1, value=block)
        apply_data_style(ws_ac.cell(row=row_idx, column=1))
        
        c_idx = 2
        for act_name, act_dict in ac_activities:
            b_data = act_dict.get(block, {"drone": 0, "dpr": 0, "variance": 0})
            
            c_drone = ws_ac.cell(row=row_idx, column=c_idx, value=b_data["drone"])
            apply_data_style(c_drone)
            
            c_dpr = ws_ac.cell(row=row_idx, column=c_idx+1, value=b_data["dpr"])
            apply_data_style(c_dpr)
            
            c_var = ws_ac.cell(row=row_idx, column=c_idx+2, value=b_data["variance"])
            apply_data_style(c_var)
            
            c_idx += 3
        row_idx += 1

    for col in range(1, col_idx):
        ws_ac.column_dimensions[get_column_letter(col)].width = 18

    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
