'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { Plus, CheckCircle2, XCircle, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { validateFiles, type FileUploadState } from '@/lib/upload';
import { uploadProjectFile, uploadConcurrencyFor } from '@/lib/upload-thread';
import { formatFileSize } from '@/lib/image-compression';
import { CompressionInfo } from '@/components/compression-info';

interface ImageUploaderProps {
  projectId: string;
  onUploadComplete?: () => void;
  trigger?: React.ReactNode;
}

export default function ImageUploader({ projectId, onUploadComplete, trigger }: ImageUploaderProps) {
  const { toast } = useToast();
  const [fileStates, setFileStates] = useState<FileUploadState[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patch = (id: string, update: Partial<FileUploadState>) =>
    setFileStates(prev => prev.map(f => f.id === id ? { ...f, ...update } : f));

  // Images upload as one thread; PDFs are rendered to one image per page and
  // registered in page order. Both live in lib/upload-thread.ts so the create
  // dialog behaves identically.
  const pdfFallbacks = useRef<string[]>([]);

  const uploadOne = async (rawFile: File, state: FileUploadState): Promise<boolean> => {
    const outcome = await uploadProjectFile(projectId, rawFile, (update) =>
      patch(state.id, update),
    );
    if (outcome.pdfFallbackReason) {
      pdfFallbacks.current.push(`${rawFile.name}: ${outcome.pdfFallbackReason}`);
    }
    return outcome.ok;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const raw = Array.from(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';

    const { accepted: files, rejected } = validateFiles(raw);
    if (rejected.length > 0) {
      // One grouped toast rather than one per file: rejecting a large drop
      // otherwise stacks a dozen toasts over the viewer.
      toast({
        title: rejected.length === 1 ? 'File not accepted' : `${rejected.length} files not accepted`,
        // ToastDescription renders a single text run, so list a few names
        // inline and summarise the rest rather than relying on line breaks.
        description: [
          ...rejected.slice(0, 3).map(r => `${r.file.name}: ${r.reason}`),
          ...(rejected.length > 3 ? [`and ${rejected.length - 3} more`] : []),
        ].join(' · '),
        variant: 'destructive',
      });
    }
    if (files.length === 0) return;

    const newStates: FileUploadState[] = files.map(f => ({
      id: crypto.randomUUID(),
      name: f.name,
      status: 'pending',
      progress: 0,
    }));

    setFileStates(prev => [...prev, ...newStates]);
    setShowPanel(true);

    pdfFallbacks.current = [];

    // Plain images upload in parallel; a batch containing a PDF runs one file
    // at a time so page order survives (threads sort by created_at).
    const concurrency = uploadConcurrencyFor(files);
    const queue = files.map((file, i) => ({ file, state: newStates[i] }));
    const running: Promise<boolean>[] = [];
    const results: boolean[] = [];

    for (const { file, state } of queue) {
      const p: Promise<boolean> = uploadOne(file, state).then(ok => {
        results.push(ok);
        running.splice(running.indexOf(p), 1);
        return ok;
      });
      running.push(p);
      if (running.length >= concurrency) await Promise.race(running);
    }
    await Promise.allSettled(running);

    const succeeded = results.filter(Boolean).length;
    const failed = results.filter(r => !r).length;

    if (succeeded > 0) {
      toast({
        title: `${succeeded} file${succeeded > 1 ? 's' : ''} uploaded`,
      });
      onUploadComplete?.();
    }
    if (pdfFallbacks.current.length > 0) {
      // The document is in the project and viewable, but not as pinnable pages
      // — worth saying, since that is the whole point of uploading it.
      toast({
        title: 'Added as a document, not pages',
        description: pdfFallbacks.current.slice(0, 2).join(' · '),
        variant: 'destructive',
      });
    }
    if (failed > 0) {
      toast({
        title: `${failed} upload${failed > 1 ? 's' : ''} failed`,
        description: 'Check the upload panel for details, then try again.',
        variant: 'destructive',
      });
    }
  };

  const clearDone = () => setFileStates(prev => prev.filter(f => f.status !== 'done'));
  const isActive = fileStates.some(
    f => f.status === 'pending' || f.status === 'converting' || f.status === 'uploading' || f.status === 'registering',
  );

  // Aggregate compression savings across all files in the panel.
  const totalSaved = fileStates.reduce(
    (sum, f) => sum + Math.max(0, (f.originalSize ?? 0) - (f.compressedSize ?? 0)),
    0,
  );

  const statusColor = (f: FileUploadState) => {
    if (f.status === 'done')       return 'bg-green-500';
    if (f.status === 'error')      return 'bg-red-400';
    if (f.status === 'converting') return 'bg-amber-400';
    if (f.status === 'registering') return 'bg-blue-400';
    if (f.status === 'uploading')  return 'bg-blue-500';
    return 'bg-gray-200';
  };

  const barWidth = (f: FileUploadState) => {
    if (f.status === 'done' || f.status === 'error') return 'w-full';
    if (f.status === 'registering' || f.status === 'converting') return 'w-full animate-pulse';
    if (f.status === 'uploading') return ``;
    return 'w-0';
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        multiple
        accept="image/*,application/pdf,video/mp4,video/webm,video/quicktime,video/ogg"
      />

      {trigger ? (
        <div onClick={() => fileInputRef.current?.click()} className="inline-block cursor-pointer">
          {trigger}
        </div>
      ) : (
        <IconTooltip label="Upload images, PDFs, or videos">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload files"
          >
            {isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </IconTooltip>
      )}

      {/* Upload progress panel */}
      {showPanel && fileStates.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-semibold text-gray-800">
              {isActive
                ? `Uploading… (${fileStates.filter(f => f.status === 'done').length}/${fileStates.length} done)`
                : `${fileStates.filter(f => f.status === 'done').length} of ${fileStates.length} uploaded`}
            </span>
            <div className="flex items-center gap-2">
              {!isActive && (
                <button onClick={clearDone} className="text-xs text-blue-600 hover:underline">
                  Clear
                </button>
              )}
              <button onClick={() => setShowPanel(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* File list */}
          <ul className="max-h-64 overflow-y-auto divide-y divide-gray-50">
            {fileStates.map(f => (
              <li key={f.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-700 truncate max-w-[200px]" title={f.name}>
                    {f.name}
                  </span>
                  <span className="shrink-0 ml-2">
                    {f.status === 'done'        && <CheckCircle2 size={14} className="text-green-500" />}
                    {f.status === 'error'       && <XCircle size={14} className="text-red-500" />}
                    {(f.status === 'uploading' || f.status === 'registering' || f.status === 'converting') &&
                      <Loader2 size={14} className="animate-spin text-blue-500" />}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  {f.status === 'uploading' ? (
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-150"
                      style={{ width: `${f.progress}%` }}
                    />
                  ) : (
                    <div className={`h-full rounded-full transition-all duration-300 ${barWidth(f)} ${statusColor(f)}`} />
                  )}
                </div>

                <div className="flex justify-between items-center gap-2 mt-1">
                  <CompressionInfo
                    originalSize={f.originalSize}
                    compressedSize={f.compressedSize}
                    didCompress={f.didCompress}
                    className="truncate"
                  />
                  {f.status === 'converting' && (
                    <span className="text-[10px] text-amber-600 shrink-0">
                      {f.pageProgress?.total
                        ? `Reading page ${f.pageProgress.done} of ${f.pageProgress.total}`
                        : 'Reading pages…'}
                    </span>
                  )}
                  {f.status === 'uploading' && (
                    <span className="text-[10px] text-blue-500 shrink-0">
                      {f.pageProgress
                        ? `Page ${f.pageProgress.done} of ${f.pageProgress.total}`
                        : `${f.progress}%`}
                    </span>
                  )}
                  {f.status === 'registering' && (
                    <span className="text-[10px] text-blue-400 shrink-0">Saving…</span>
                  )}
                  {f.status === 'done' && f.pageProgress && (
                    <span className="text-[10px] text-green-600 shrink-0">
                      {f.pageProgress.total} page{f.pageProgress.total === 1 ? '' : 's'}
                    </span>
                  )}
                  {f.status === 'error' && (
                    <span className="text-[10px] text-red-500 truncate">{f.error}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isActive}
              className="text-xs text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              + Add more files
            </button>
            {totalSaved > 0 && (
              <span className="text-[10px] text-green-600 font-medium shrink-0">
                Saved {formatFileSize(totalSaved)}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
