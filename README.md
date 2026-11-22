# BioLens AI — Interactive STEM Lab & Research Copilot

**BioLens AI** is an interactive scientific workbench built for the **STEM2Connect AI Hackathon (Scientific Research Track)** that pairs deterministic in-browser statistics and Z-score anomaly detection with grounded research synthesis across clean energy, genomics, environmental science, and custom CSV datasets. Researchers can screen sensor outliers live, audit experimental reproducibility (`0–100`), visualize OLS regressions, and export publication-ready Markdown lab briefs in one click.

- **Live Demo:** [https://biolens-ai.vercel.app](https://biolens-ai.vercel.app)

---

## Core Scientific Problems Solved

- **Automated Z-Score Sensor Outlier Detection (`|Z| > 2.0`) & Live Exclusion Toggle:**
  - Automatically computes sample size ($n$), means, standard deviations ($\sigma$), medians, Pearson correlation ($r$), $R^2$, OLS regression, and two-tailed Student-$t$ $p$-values while flagging anomalies exceeding $|Z| > 2.0$.
  - Includes a live **"Exclude Flagged Outliers (`|Z| > 2.0`)"** toggle that dynamically recalculates $n$, Primary Mean, Pearson $r$, Recharts visualizations, data tables, and live delta badges ($\Delta|r|$ and $\Delta\text{Mean}$).

- **Multi-Variable Confounding Bias & Reproducibility Auditing (`0–100` Rigor Scorecard):**
  - Features an **Experiment Rigor & Reproducibility Scorecard (`0–100`)** scoring sample power ($n \ge 25$), outlier contamination ($< 10\%$), and statistical significance ($p < 0.05$), paired with targeted methodological recommendations and a `</> View Statistical Context` JSON inspector.

- **Grounded AI Research Co-Scientist & 1-Click Publication Export:**
  - Synthesizes empirical findings, confounding bias checks, and 3 testable follow-up hypotheses via **`gemini-3.5-flash-lite`** (with **`gemini-3.8-flash`** fallback in Live Gemini AI Mode) or zero-key **Demo Intelligence Mode**, alongside interactive dataset-grounded Q&A, **Export Lab Report (`.md`)**, filtered **CSV** export, and 3× **PNG** chart export.

---

## Tech Stack

- **Frontend & Deterministic Workbench:** React 19, TypeScript, Vite, Tailwind CSS, Recharts, Lucide React (100% client-side statistical computation, outlier screening, charting, CSV/Markdown export, and zero-key Demo Intelligence Mode—deployable as a pure static bundle).
- **Optional AI Proxy Backend:** Express (`server.ts`) with the official `@google/genai` TypeScript SDK (`gemini-3.5-flash-lite` primary, `gemini-3.8-flash` fallback with `ThinkingLevel.LOW`) for server-authenticated Live Gemini AI Mode.

---

## Running Locally (For Code Reviewers & Judges)

No API key is required to evaluate the full application—**Demo Intelligence Mode** runs 100% out of the box on both local dev servers and static hosting.

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd <repository-folder>
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

> **Optional Live Gemini AI Setup:** To enable Live Gemini AI Mode (`gemini-3.5-flash-lite` with `gemini-3.8-flash` fallback), add `GEMINI_API_KEY="your_key_here"` to `.env`, restart `npm run dev`, and select **Live Gemini AI Mode** inside the in-app **Settings** modal.

---

## AI Tools Disclosure (STEM2Connect Hackathon Compliance)

In full compliance with **STEM2Connect AI Hackathon** transparency guidelines:
- **Development & Architecture:** Built with **Google AI Studio** for UI scaffolding, interactive Recharts visualization design, and assistance implementing the client-side statistical engine (`src/utils/statsEngine.ts`).
- **Live Research Synthesis:** Uses **Google Gemini (`gemini-3.5-flash-lite`**, with automatic fallback to **`gemini-3.8-flash`** using `ThinkingLevel.LOW`) via the `@google/genai` SDK (`server.ts`) to generate structured empirical summaries, confounding variable audits, testable hypotheses, and conversational Q&A.
- **Deterministic Grounding:** Every quantitative figure ($n$, $\mu$, $\sigma$, Pearson $r$, $R^2$, $p$-values, Rigor Scores, and $|Z| > 2.0$ outliers) is calculated deterministically in TypeScript prior to AI prompting, and reviewers can inspect the exact statistical JSON context injected into every prompt.
