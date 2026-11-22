# BioLens AI — Interactive STEM Lab & Research Copilot

**BioLens AI** is an interactive scientific workbench built for the **STEM2Connect AI Hackathon (Scientific Research Track)** that pairs deterministic in-browser statistics and Z-score anomaly detection with grounded AI synthesis across clean energy, genomics, environmental science, and custom CSV datasets. Researchers can screen sensor outliers live, audit experimental reproducibility (`0–100`), visualize OLS regressions, and export publication-ready Markdown lab briefs in one click.

---

## Core Features

- **Automated Z-Score Sensor Outlier Detection (`|Z| > 2.0`) & Live Exclusion Toggle:** Computes sample size ($n$), variable means, sample standard deviations ($\sigma$), medians, Pearson correlation ($r$), $R^2$, OLS linear fits, and two-tailed Student-$t$ $p$-values in real time, with a live **"Exclude Flagged Outliers (`|Z| > 2.0`)"** toggle showing $\Delta|r|$ and $\Delta\text{Mean}$ shifts.
- **Experiment Rigor & Reproducibility Scorecard (`0–100`):** Audits sample power ($n \ge 25$), anomaly contamination ($< 10\%$), and statistical significance ($p < 0.05$) alongside two actionable methodological recommendations.
- **Lab Synthesis & Streaming Research Q&A Chat:** Generates structured empirical findings, confounding bias checks, and 3 testable follow-up hypotheses, plus interactive dataset-grounded Q&A backed by an expandable `</> View Statistical Context` JSON drawer.
- **3 Built-In STEM Datasets + Custom `.csv` Upload:** Includes *Solar Perovskite Efficiency vs. Thermal Stress* ($n = 28$), *CRISPR-Cas9 Target Knockdown & Cell Viability* ($n = 26$), and *Coastal Microplastic Concentration & pH* ($n = 27$), plus drag-and-drop `.csv` parsing with dynamic X/Y axis swapping.
- **1-Click Lab Report (`.md`), CSV & PNG Exports:** Exports a publication-ready Markdown Lab Report (`.md`), filtered dataset `.csv` from the Data Table workbench, and 3× high-resolution `.png` charts.

---

## How the Two AI Modes Work (In-App Mode Switcher)

### Demo Intelligence Mode (Default — Zero API Key Required)
**Demo Intelligence Mode** is enabled out of the box and runs 100% locally inside the browser using BioLens AI's deterministic statistical synthesis engine (`src/utils/statsEngine.ts` + `src/services/geminiResearch.ts`). Every finding, confounder audit, next-step protocol, and Research Q&A response is dynamically grounded in the active dataset's exact metrics with zero external network calls and zero API key setup.

### Live Gemini AI Mode (`gemini-3.5-flash-lite` with `gemini-3.8-flash` fallback)
When a server `GEMINI_API_KEY` is configured, requests route through the Express backend (`/api/research/synthesize` and `/api/research/chat/stream`) using `gemini-3.5-flash-lite` as the fast primary model with automatic fallback to `gemini-3.8-flash` (`ThinkingLevel.LOW`):
1. Click the **AI Mode pill** (`Demo Mode` / `Gemini AI Live`) in the top navigation bar.
2. Select **Option B: Live Gemini AI Mode**.
3. Click **Test Connection** to verify the server key against Gemini (`Connected ✓`).
4. Click **Activate & Save** to apply Live Gemini AI Mode immediately.

---

## Running Locally & Applying Your Gemini API Key

### Prerequisites
- Node.js 18+ and npm

### 1. Clone & Install
```bash
git clone <repository-url>
cd <repository-folder>
npm install
```

### 2. Configure Optional Gemini API Key
Copy `.env.example` to `.env` and add your Gemini API key if you want to test **Live Gemini AI Mode** (leave unset to run **Demo Intelligence Mode** with zero setup):
```bash
cp .env.example .env
```
Edit `.env`:
```env
GEMINI_API_KEY=your_api_key_here
```

### 3. Build & Start
```bash
npm run build
npm start
```
Open `http://localhost:3000` in your browser (or run `npm run dev` during active development).

> **Windows PowerShell Note:** Because `"start"` uses inline `NODE_ENV=production` syntax for Linux/macOS/Render, run the production server on Windows PowerShell with:
> ```powershell
> $env:NODE_ENV="production"; npx tsx server.ts
> ```

---

## AI Tools Disclosure (STEM2Connect Hackathon Compliance)

In compliance with **STEM2Connect AI Hackathon** guidelines:
- **Development Environment:** Built with **Google AI Studio** for UI scaffolding, interactive Recharts visualization design, and statistical engine (`src/utils/statsEngine.ts`) logic assistance.
- **Live Research Synthesis:** Uses **Google Gemini (`gemini-3.5-flash-lite`**, with automatic fallback to **`gemini-3.8-flash`**) via the official `@google/genai` SDK (`server.ts`) to produce structured empirical syntheses, confounder checks, testable follow-up hypotheses, and streaming research Q&A.
- **Deterministic Verification:** All quantitative values ($n$, $\mu$, $\sigma$, Pearson $r$, $R^2$, OLS slopes, two-tailed $p$-values, Rigor Scorecards, and $|Z| > 2.0$ outliers) are computed deterministically in TypeScript prior to AI prompting, and reviewers can inspect the exact statistical context sent to the model.
