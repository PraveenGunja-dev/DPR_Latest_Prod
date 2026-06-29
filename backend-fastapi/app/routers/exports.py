import openpyxl
        summary_data[sheet_type] += val

    if summary_data:
        # Create Summary sheet as the first tab
        ws_summary = wb.create_sheet("Analytics", 0)
        ws_summary.append(["Sheet Type", "Total Progress Unit"])
        
        # Add bold header styling
        ws_summary["A1"].font = header_font
        ws_summary["A1"].fill = header_fill
        ws_summary["B1"].font = header_font
        ws_summary["B1"].fill = header_fill
        
        for sht, total in summary_data.items():
            ws_summary.append([sht, total])
            
        # Create Pie Chart
        from openpyxl.chart import PieChart, Reference
        chart = PieChart()
        labels = Reference(ws_summary, min_col=1, min_row=2, max_row=len(summary_data)+1)
        data = Reference(ws_summary, min_col=2, min_row=1, max_row=len(summary_data)+1)
        chart.add_data(data, titles_from_data=True)
        chart.set_categories(labels)
        chart.title = "Total Progress Volume by Category"
        
        ws_summary.add_chart(chart, "D2")

    # Save to a BytesIO stream
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    filename = f"Historical_Data_{projectId}_{startDate}_to_{endDate}.xlsx"
    headers = {
        "Content-Disposition": f"attachment; filename={filename}"
    }

    return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)
