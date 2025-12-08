# DPR Summary Section Component

## Overview

The DPR Summary Section is a React component that implements an Excel-style Daily Progress Report section with precise column alignment and styling as specified in the requirements.

## Features

1. **Full-width Title Bar**
   - Center-aligned text
   - Blue-grey background (#DDE4EC)
   - Bold 16px font
   - Thin black border

2. **Left Side Summary Block**
   - Proper 2-column table with 9 rows
   - Light cream background (#FAF0E6)
   - Labels left-aligned and bold, values centered
   - Text top-aligned in each cell
   - Column 1 width ≈ 45%, Column 2 width ≈ 55%
   - Thin black borders around all cells

3. **Main Activity Summary Table**
   - Multi-row header with correct colspans
   - "Today's Qty" group with 3 sub-columns (Base Plan, Catch Up Plan, Actual)
   - "Cumulative Qty" group with 3 sub-columns (Base Plan, Catch Up Plan, Actual)
   - Activities left-aligned
   - Numeric data right-aligned
   - Statuses center-aligned
   - Category rows with grey background and bold text
   - Completed items in green (#22A04B)
   - Negative deviations in red
   - Excel-style blue-grey header background (#DDE4EC)
   - Thin black grid borders
   - Header row height: 32px
   - Sub-header row height: 28px
   - Reduced padding inside headers to 4px
   - Optional row striping
   - Fixed table layout with explicit column widths
   - No text wrapping to maintain consistent column widths
   - Horizontal scrolling enabled to maintain alignment

4. **Right Side Charging Plan Summary Table**
   - Single-row headers aligned with columns
   - Centered headers
   - Right-aligned numbers
   - Center-aligned date columns
   - Completed items in green (#22A04B)
   - Light blue-grey header background (#DDE4EC)
   - Thin black grid borders
   - Header row height: 32px
   - Reduced padding inside headers to 4px
   - Fixed table layout with explicit column widths
   - No text wrapping to maintain consistent column widths

5. **Layout Requirements**
   - Left table and summary block appear together on the same horizontal line
   - Right table aligned below with horizontal scrolling
   - Fixed column widths to prevent stretching
   - No overlapping, shifting, or wrapping of headers
   - No flexbox usage inside table containers

## File Structure

```
src/
├── components/
│   ├── DPRSummarySection.tsx
│   └── DPRSummarySection.css
├── pages/
│   └── DPRSummaryDemo.tsx
└── docs/
    └── dpr-summary-section.md
```

## Implementation Details

### DPRSummarySection.tsx

This is the main React component that renders the entire DPR Summary Section. It uses CSS classes defined in `DPRSummarySection.css` for styling.

### DPRSummarySection.css

This file contains all the CSS classes used by the component:
- Layout classes for responsive design
- Styling classes for the title bar
- Grid classes for the summary block
- Table classes for both main tables
- Utility classes for text alignment and special coloring

### DPRSummaryDemo.tsx

A demo page showcasing the component with implementation notes.

## Usage

To use the DPR Summary Section component in your application:

1. Import the component:
```tsx
import { DPRSummarySection } from '@/components/DPRSummarySection';
```

2. Use it in your JSX:
```tsx
<DPRSummarySection />
```

## Styling Guidelines

The component follows these specific styling requirements:

- **Title Bar**: `#DDE4EC` background, black border, center-aligned, bold 16px text
- **Summary Block**: `#FAF0E6` background, two-column grid, labels left-aligned, values center-aligned
- **Table Headers**: `#DDE4EC` background, thin black borders
- **Positive Values**: `#22A04B` green text
- **Negative Values**: Red text
- **Category Rows**: Grey background, bold text
- **Borders**: Thin black lines throughout

## Responsive Design

The component is fully responsive:
- On mobile devices, the layout stacks vertically
- On larger screens, the summary block and main table appear side-by-side
- All tables have horizontal scrolling on small screens to prevent overflow

## Customization

To customize the component:
1. Modify the CSS classes in `DPRSummarySection.css`
2. Update the data in `DPRSummarySection.tsx`
3. Add props to the component interface for dynamic data

## Browser Support

The component uses modern CSS features and will work in all modern browsers including:
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

## Accessibility

The component follows accessibility best practices:
- Proper semantic HTML structure
- Sufficient color contrast
- Logical tab order
- Screen reader friendly markup