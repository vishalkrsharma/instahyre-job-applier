# Instahyre Job Applier

Node.js + Playwright tool that opens **Google Chrome**, signs into [Instahyre](https://www.instahyre.com), applies to jobs from the **Opportunities** tab, then runs a **custom job search** using filters from a JSON config file.

## Prerequisites

- **Node.js 18+**
- **Google Chrome** installed (the tool uses `channel: 'chrome'`)

## Setup

```bash
npm install
```

Playwright is installed as a dependency. You do **not** need bundled Chromium for this project; the script launches your system Chrome. If Playwright prompts for browser binaries in other contexts, you can run `npx playwright install` (optional).

## Configuration

1. Copy the example config:

   ```bash
   cp config.example.json config.json
   ```

2. Edit `config.json`:
   - Set `credentials.email` and `credentials.password`
   - Adjust `filters` (skills, job functions, industries, locations, companies, company size, experience)
   - Tune `behavior` (limits, delays, dry run)

`config.json` is **gitignored** — never commit real passwords.

## Run

```bash
npm start
```

On first login you may need to complete **2FA**, **CAPTCHA**, or **Google SSO** manually in the opened browser window. A **persistent Chrome profile** is stored under `.chrome-profile/` (configurable) so later runs usually stay logged in.

Press **Ctrl+C** to stop gracefully; a short summary is printed.

## Legal & ethics

You are responsible for complying with **Instahyre’s Terms of Service** and applicable laws. Automated applying may be restricted or disallowed; use at your own risk. This tool is for personal productivity only.

## Troubleshooting

- If buttons are not found, Instahyre may have changed their UI. Update selectors in `src/opportunities.js` and `src/search.js` (exported `SELECTORS` maps).
- Increase `browser.slowMoMs` to slow down actions for debugging.
- Set `behavior.dryRun` to `true` to log actions without clicking Apply.
