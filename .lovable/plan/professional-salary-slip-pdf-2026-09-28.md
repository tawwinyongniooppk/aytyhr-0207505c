# Professional Salary Slip PDF

## Goal
Rework only the downloaded salary slip presentation into a clean invoice-style document while keeping every salary, bonus, leave, transaction, signature, and permission rule unchanged.

## Changes
- Replace the loose report layout with a structured header, staff/pay-period details, financial summary, yearly bonus and leave panels, transaction table, totals, and signature area.
- Render transaction descriptions and staff names through the browser's Unicode font canvas before embedding them, so Burmese and mixed Burmese/English text appears correctly instead of broken symbols or excessive letter spacing.
- Add consistent spacing, table columns, wrapping, row separators, page breaks, and repeated table headers for long histories.
- Keep the existing download action, filename, logo source, signature requirement, and all supplied amounts/data intact.

## Validation
- Check TypeScript and the production build.
- Generate a representative PDF containing mixed Burmese/English descriptions, render its pages to images, and inspect for clipping, broken glyphs, overlaps, and page-break issues.

## Technical scope
Only the salary-slip PDF presentation component will change. No database, query, authorization, payroll calculation, task, leave, overtime, cron, realtime, or caching behavior will change.
