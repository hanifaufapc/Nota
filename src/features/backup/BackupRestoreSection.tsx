import { type ChangeEvent, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  HardDriveDownload,
  RotateCcw,
  Upload,
} from 'lucide-react';
import {
  type NotaBackupPayload,
  type NotaBackupPreview,
  parseAndValidateBackupJson,
  serializeBackupPayload,
  serializeTransactionsToCsv,
} from '../../data/backup/notaBackup';
import type { Category, Transaction } from '../../domain/transaction';
import { toLocalDateString } from '../../lib/date';
import { formatIDR, formatSignedIDR } from '../../lib/format';

export interface BackupRestoreSectionProps {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  onExportBackup: () => Promise<NotaBackupPayload>;
  onRestoreBackup: (rawJson: string) => Promise<NotaBackupPreview>;
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(new Error('Gagal membaca file cadangan dari perangkat.'));
    };
    reader.readAsText(file);
  });
}

function triggerBrowserDownload(
  filename: string,
  content: string,
  mimeType: string,
): void {
  if (
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof document === 'undefined'
  ) {
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

export function BackupRestoreSection({
  transactions,
  categories,
  onExportBackup,
  onRestoreBackup,
}: BackupRestoreSectionProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] =
    useState<NotaBackupPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleExportJson() {
    if (isExporting || isRestoring) {
      return;
    }
    setIsExporting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const payload = await onExportBackup();
      const jsonString = serializeBackupPayload(payload);
      const dateSuffix = toLocalDateString(new Date());
      const filename = `nota-cadangan-${dateSuffix}.json`;

      triggerBrowserDownload(
        filename,
        jsonString,
        'application/json;charset=utf-8',
      );
      setStatusMessage(
        `File cadangan JSON (${payload.transactions.length} transaksi) siap diunduh.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Gagal menyiapkan file cadangan JSON.',
      );
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportCsv() {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const csvString = serializeTransactionsToCsv(transactions, categories);
      const dateSuffix = toLocalDateString(new Date());
      const filename = `nota-transaksi-${dateSuffix}.csv`;

      triggerBrowserDownload(filename, csvString, 'text/csv;charset=utf-8');
      setStatusMessage(
        `File CSV (${transactions.length} transaksi) siap diunduh.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Gagal menyiapkan ekspor CSV transaksi.',
      );
    }
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setPendingPreview(null);
    setSelectedFileName(file.name);

    try {
      const rawText = await readFileAsText(file);
      const validation = parseAndValidateBackupJson(rawText);

      if (!validation.valid) {
        setErrorMessage(validation.errors[0]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      setPendingPreview(validation.preview);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Gagal membaca atau memvalidasi file cadangan.',
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleCancelPreview() {
    if (isRestoring) {
      return;
    }
    setPendingPreview(null);
    setSelectedFileName(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleConfirmRestore() {
    if (!pendingPreview || isRestoring) {
      return;
    }

    setIsRestoring(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const restored = await onRestoreBackup(pendingPreview.rawJson);
      setPendingPreview(null);
      setSelectedFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setStatusMessage(
        `Cadangan berhasil dipulihkan (${restored.summary.transactionCount} transaksi, ${restored.summary.categoryCount} kategori).`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Gagal memulihkan cadangan ke penyimpanan lokal perangkat.',
      );
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <section
      id="cadangan-pemulihan"
      aria-label="Cadangan dan pemulihan data lokal"
      className="rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-control border border-nota-border bg-nota-bg text-nota-ink">
            <HardDriveDownload className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-nota-ink">
              Cadangan & Pemulihan Data
            </h2>
          </div>
        </div>
      </div>

      {/* Export & Import Controls Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Export Actions */}
        <div className="lg:col-span-6 rounded-panel bg-nota-bg/70 p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-nota-ink">
              Simpan cadangan ke perangkat
            </h3>
            <p className="text-xs text-nota-muted leading-relaxed">
              Unduh seluruh pengaturan saldo awal, kategori, dan riwayat
              transaksi ke file JSON berversi untuk disimpan secara mandiri.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleExportJson()}
              disabled={isExporting || isRestoring}
              className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer disabled:opacity-55"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {isExporting ? 'Menyiapkan...' : 'Ekspor cadangan'}
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isExporting || isRestoring}
              className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-surface px-3.5 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer disabled:opacity-55"
            >
              <FileSpreadsheet
                className="h-4 w-4 text-nota-emerald"
                aria-hidden="true"
              />
              Ekspor CSV transaksi
            </button>
          </div>
        </div>

        {/* Right: Import & Restore Trigger */}
        <div className="lg:col-span-6 rounded-panel bg-nota-bg/70 p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-nota-ink">
              Pulihkan dari file cadangan (.json)
            </h3>
            <p className="text-xs text-nota-muted leading-relaxed">
              Pilih file cadangan JSON Nota untuk memeriksa ringkasan isinya
              sebelum mengganti data lokal di browser ini.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept=".json,application/json"
              aria-label="Pilih file cadangan (.json)"
              onChange={(e) => void handleFileSelect(e)}
              disabled={isRestoring}
              className="sr-only peer"
            />
            <label
              htmlFor={fileInputId}
              className={`inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-surface px-4 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-nota-emerald transition-colors cursor-pointer ${
                isRestoring ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <Upload
                className="h-4 w-4 text-nota-emerald"
                aria-hidden="true"
              />
              Pilih file cadangan (.json)
            </label>
            {selectedFileName && !pendingPreview && !errorMessage ? (
              <span className="text-xs text-nota-muted truncate max-w-[200px]">
                {selectedFileName}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Preview & Explicit Confirmation Region before Replacing Data */}
      {pendingPreview ? (
        <div
          role="region"
          aria-label="Pratinjau pemulihan cadangan"
          className="rounded-panel border border-nota-emerald/35 bg-nota-soft-green/45 p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-nota-ink">
                Pratinjau File Cadangan
                {selectedFileName ? `: ${selectedFileName}` : ''}
              </h3>
              <p className="text-xs text-nota-muted">
                Versi skema v{pendingPreview.summary.schemaVersion} · Diekspor
                pada {pendingPreview.summary.exportedAt}
              </p>
            </div>

            <span className="rounded-control bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-emerald border border-nota-emerald/25">
              Mode: Ganti seluruh data lokal
            </span>
          </div>

          {/* Summary Metrics of the Backup File */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-control bg-nota-surface p-3 border border-nota-border/70">
              <span className="block text-[11px] font-medium text-nota-muted">
                Saldo awal cadangan
              </span>
              <strong
                data-testid="backup-preview-opening-balance"
                className="mt-0.5 block text-sm font-semibold text-nota-ink tabular-nums"
              >
                {formatIDR(pendingPreview.summary.openingBalance)}
              </strong>
            </div>

            <div className="rounded-control bg-nota-surface p-3 border border-nota-border/70">
              <span className="block text-[11px] font-medium text-nota-muted">
                Saldo tercatat cadangan
              </span>
              <strong
                data-testid="backup-preview-current-balance"
                className="mt-0.5 block text-sm font-semibold text-nota-ink tabular-nums"
              >
                {pendingPreview.summary.currentBalance < 0
                  ? formatSignedIDR(pendingPreview.summary.currentBalance)
                  : formatIDR(pendingPreview.summary.currentBalance)}
              </strong>
            </div>

            <div className="rounded-control bg-nota-surface p-3 border border-nota-border/70">
              <span className="block text-[11px] font-medium text-nota-muted">
                Jumlah transaksi
              </span>
              <strong
                data-testid="backup-preview-tx-count"
                className="mt-0.5 block text-sm font-semibold text-nota-ink tabular-nums"
              >
                {pendingPreview.summary.transactionCount} transaksi
              </strong>
            </div>

            <div className="rounded-control bg-nota-surface p-3 border border-nota-border/70">
              <span className="block text-[11px] font-medium text-nota-muted">
                Jumlah kategori
              </span>
              <strong
                data-testid="backup-preview-category-count"
                className="mt-0.5 block text-sm font-semibold text-nota-ink tabular-nums"
              >
                {pendingPreview.summary.categoryCount} kategori
              </strong>
            </div>
          </div>

          {/* Explicit Replace Warning */}
          <div className="flex items-start gap-2.5 rounded-panel bg-nota-surface/90 p-3 border border-nota-border text-xs text-nota-ink">
            <AlertTriangle
              className="h-4 w-4 text-nota-expense shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="leading-relaxed">
              Pemulihan ini akan{' '}
              <strong className="font-semibold">
                mengganti seluruh data lokal saat ini
              </strong>{' '}
              di browser perangkat ini dengan data dari file cadangan. Pastikan
              Anda telah mengekspor cadangan data saat ini jika masih
              diperlukan.
            </p>
          </div>

          {/* Confirmation Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleCancelPreview}
              disabled={isRestoring}
              className="inline-flex items-center justify-center rounded-control border border-nota-border bg-nota-surface px-4 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-bg transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={() => void handleConfirmRestore()}
              disabled={isRestoring}
              className="inline-flex items-center justify-center gap-1.5 rounded-control bg-nota-emerald px-5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer disabled:opacity-55"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {isRestoring
                ? 'Memulihkan data...'
                : 'Ganti data & pulihkan cadangan'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Error Alert */}
      {errorMessage ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-panel border border-nota-expense/30 bg-nota-expense-soft px-4 py-3 text-xs sm:text-sm text-nota-expense"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {/* Status / Success Notice */}
      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-panel border border-nota-emerald/30 bg-nota-soft-green px-4 py-2.5 text-xs sm:text-sm font-medium text-nota-ink"
        >
          <CheckCircle2
            className="h-4 w-4 text-nota-emerald shrink-0"
            aria-hidden="true"
          />
          <span>{statusMessage}</span>
        </div>
      ) : null}

      {/* Honest Data-Safety & Privacy Footnote (PRD.md §11 & ARCHITECTURE.md §5, §6) */}
      <p className="text-xs text-nota-muted leading-relaxed">
        Data disimpan di database lokal browser perangkat ini (tidak otomatis
        terenkripsi) dan dapat hilang jika penyimpanan situs dibersihkan atau
        perangkat berganti. File cadangan JSON tidak pernah diunggah ke server
        dan memuat catatan keuangan sensitif—simpan di tempat yang aman.
      </p>
    </section>
  );
}

