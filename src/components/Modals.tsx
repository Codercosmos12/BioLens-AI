import React, { useRef, useState } from 'react';
import {
  Cpu,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';

const SAMPLE_CSV_CONTENT = [
  'Sample_ID,Substrate_Temp_C,Conductivity_S_m,Film_Thickness_nm,Defect_Density_cm2',
  'RUN-01,22.0,142.5,180,12.4',
  'RUN-02,28.5,149.2,182,11.8',
  'RUN-03,35.0,158.0,179,10.9',
  'RUN-04,42.0,166.4,181,10.2',
  'RUN-05,48.5,174.1,180,9.8',
  'RUN-06,55.0,183.6,183,9.1',
  'RUN-07,62.0,118.2,185,26.5',
  'RUN-08,68.5,199.4,179,8.4',
  'RUN-09,75.0,208.1,181,7.9',
  'RUN-10,82.0,217.5,180,7.5',
  'RUN-11,88.5,226.8,182,7.1',
  'RUN-12,95.0,235.4,181,6.8',
].join('\n');

interface CsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadCsv: (fileName: string, content: string) => void;
}

export const CsvUploadModal: React.FC<CsvUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadCsv,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Please upload a valid .csv spreadsheet file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        onUploadCsv(file.name, text);
        onClose();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Unable to parse CSV file.');
      }
    };
    reader.onerror = () => {
      setUploadError('Failed to read the selected CSV file.');
    };
    reader.readAsText(file);
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV_CONTENT], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_thin_film_conductivity.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-upload-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-[#1F2937] bg-[#111827] p-6 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1F2937] pb-4">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
            <h2 id="csv-upload-modal-title" className="font-display text-lg font-semibold">
              Upload Experiment CSV
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close CSV upload modal"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`cursor-pointer rounded-xl border border-dashed p-8 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
              isDragging
                ? 'border-emerald-400 bg-emerald-500/10'
                : 'border-[#1F2937] bg-[#090D16] hover:border-emerald-500/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Upload className="mx-auto mb-2.5 h-7 w-7 text-emerald-400" />
            <p className="text-sm font-medium text-slate-100">
              Drag &amp; drop a laboratory .csv file here
            </p>
            <p className="mt-1 text-xs text-slate-400">
              or click to browse local spreadsheets (parsed 100% in browser memory)
            </p>
          </div>

          {uploadError && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {uploadError}
            </p>
          )}

          <div className="flex flex-col gap-2 rounded-lg border border-[#1F2937] bg-[#090D16] p-3.5 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <span>Need a test spreadsheet with an embedded anomaly?</span>
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="inline-flex items-center gap-1.5 font-medium text-violet-300 transition-colors hover:text-violet-200 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Download Sample CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DisclosureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DisclosureModal: React.FC<DisclosureModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclosure-modal-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-[#1F2937] bg-[#111827] p-6 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1F2937] pb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 id="disclosure-modal-title" className="font-display text-lg font-semibold">
              AI Tools &amp; Scientific Integrity Disclosure
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close disclosure modal"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs leading-relaxed text-slate-300">
          <div className="rounded-lg border border-[#1F2937] bg-[#090D16] p-4">
            <h3 className="flex items-center gap-2 font-semibold text-emerald-300">
              <Cpu className="h-4 w-4" />
              STEM2Connect AI Hackathon — Scientific Research Track
            </h3>
            <p className="mt-1.5 text-slate-300">
              <strong>BioLens AI</strong> was built using <strong>Google AI Studio</strong> and
              integrates the <strong>Google GenAI SDK</strong> (
              <code className="font-mono text-violet-300">@google/genai</code>) targeting{' '}
              <code className="font-mono text-violet-300">gemini-3.5-flash-lite</code> with automatic
              fallback to <code className="font-mono text-violet-300">gemini-3.8-flash</code>.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-100">
              1. Deterministic Client-Side Statistical Engine
            </h3>
            <p className="mt-1 text-slate-400">
              All sample sizes (<em>n</em>), column means, sample standard deviations (<em>n</em> −
              1), Pearson correlation coefficients (<em>r</em>), ordinary least squares fits,
              two-tailed Student-<em>t</em> <em>p</em>-values, and Z-score anomaly flags (|Z| &gt;
              2.0) are computed mathematically inside the browser before any AI prompt is
              constructed.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-100">
              2. Grounded Server-Side AI Synthesis &amp; Context Transparency
            </h3>
            <p className="mt-1 text-slate-400">
              When Live Gemini AI is enabled, only the computed statistical summary JSON (visible in
              the <code className="font-mono text-violet-300">&lt;/&gt; View Statistical Context</code>{' '}
              drawer) and experiment metadata are sent to our backend{' '}
              <code className="font-mono text-violet-300">/api/research/*</code> endpoints, which
              invoke Gemini on the server using the attached{' '}
              <strong>Settings &gt; Secrets</strong> key. In Demo Intelligence Mode, insights are
              computed locally with zero network requests.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-100">3. Data Privacy</h3>
            <p className="mt-1 text-slate-400">
              Uploaded CSV spreadsheets are parsed locally in browser memory via{' '}
              <code className="font-mono text-slate-300">FileReader</code>; only aggregated
              descriptive statistics are transmitted when Live Gemini AI is invoked.
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end border-t border-[#1F2937] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
          >
            Acknowledge &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};
