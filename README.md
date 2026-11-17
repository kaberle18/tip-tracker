# TipTrack

Track tips, hours worked, and your real average hourly wage (base pay + tips).

- **Running clock** — clock in/out with breaks; clocking out prompts for cash and card tips.
- **Base rate history** — add a new rate whenever your pay changes. Each shift stores the rate in effect on its date, so past numbers never shift.
- **Any time period** — today, this/last week, month, last 30 days, year, all time, or a custom range.
- **Workplace branding** — paste your company's website and the app restyles itself with its name, logo, and colors.
- Export CSV, backup/restore JSON. Data stays in the browser (localStorage).

## AI branding
`/api/brand` scrapes the site's theme color, stylesheets and icons. If the `ANTHROPIC_API_KEY` environment variable is set in Vercel, Claude picks the final palette; otherwise a color-frequency heuristic is used.

## Deploy
Static site + one Vercel serverless function. No build step.
