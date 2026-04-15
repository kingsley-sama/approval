'use client';

import { useState, useRef } from 'react';
import { getSignedUploadUrl, registerUploadedFile } from '@/app/actions/storage';
import { Button } from '@/components/ui/button';
import { Plus, CheckCircle2, XCircle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { xhrUpload, validateFiles, type FileUploadState } from '@/lib/upload';

interface ImageUploaderProps {
  projectId: string;
  onUploadComplete?: () => void;
  trigger?: React.ReactNode;
}

const CONCURRENCY = 3;

export default function ImageUploader({ projectId, onUploadComplete, trigger }: ImageUploaderProps) {
  const [fileStates, setFileStates] = useState<FileUploadState[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patch = (id: string, update: Partial<FileUploadState>) =>
    setFileStates(prev => prev.map(f => f.id === id ? { ...f, ...update } : f));

  const uploadOne = async (file: File, state: FileUploadState): Promise<boolean> => {
    // 1. Get presigned URL from server (tiny request — no file data)
    patch(state.id, { status: 'uploading', progress: 0 });
    const urlResult = await getSignedUploadUrl(projectId, file.name);
    if (!urlResult.success || !urlResult.signedUrl || !urlResult.storagePath) {
      patch(state.id, { status: 'error', error: urlResult.error || 'Could not get upload URL' });
      return false;
    }

    // 2. Upload directly from browser → Supabase (real progress, no size limit)
    try {
      await xhrUpload(file, urlResult.signedUrl, (pct) =>
        patch(state.id, { progress: pct }),
      );
    } catch (err: any) {
      patch(state.id, { status: 'error', error: err.message });
      return false;
    }

    // 3. Register thread in the database
    patch(state.id, { status: 'registering', progress: 100 });
    const regResult = await registerUploadedFile(projectId, file.name, urlResult.storagePath);
    if (!regResult.success) {
      patch(state.id, { status: 'error', error: regResult.error || 'Failed to save image' });
      return false;
    }

    patch(state.id, { status: 'done', progress: 100 });
    return true;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const raw = Array.from(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';

    const { accepted: files, rejected } = validateFiles(raw);
    if (rejected.length > 0) {
      rejected.forEach(r => toast.error(`${r.file.name}: ${r.reason}`));
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

    // Run up to CONCURRENCY uploads in parallel, track results locally
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
      if (running.length >= CONCURRENCY) await Promise.race(running);
    }
    await Promise.allSettled(running);

    const succeeded = results.filter(Boolean).length;
    const failed = results.filter(r => !r).length;

    if (succeeded > 0) {
      toast.success(`${succeeded} image${succeeded > 1 ? 's' : ''} uploaded`);
      onUploadComplete?.();
    }
    if (failed > 0) toast.error(`${failed} upload${failed > 1 ? 's' : ''} failed`);
  };

  const clearDone = () => setFileStates(prev => prev.filter(f => f.status !== 'done'));
  const isActive = fileStates.some(f => f.status === 'pending' || f.status === 'uploading' || f.status === 'registering');

  const statusColor = (f: FileUploadState) => {
    if (f.status === 'done')       return 'bg-green-500';
    if (f.status === 'error')      return 'bg-red-400';
    if (f.status === 'registering') return 'bg-blue-400';
    if (f.status === 'uploading')  return 'bg-blue-500';
    return 'bg-gray-200';
  };

  const barWidth = (f: FileUploadState) => {
    if (f.status === 'done' || f.status === 'error') return 'w-full';
    if (f.status === 'registering') return 'w-full animate-pulse';
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
        accept="image/*"
      />

      {trigger ? (
        <div onClick={() => fileInputRef.current?.click()} className="inline-block cursor-pointer">
          {trigger}
        </div>
      ) : (
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={() => fileInputRef.current?.click()}
          title="Upload Images"
        >
          {isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
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
                    {(f.status === 'uploading' || f.status === 'registering') &&
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

                <div className="flex justify-between mt-1">
                  {f.status === 'uploading' && (
                    <span className="text-[10px] text-blue-500">{f.progress}%</span>
                  )}
                  {f.status === 'registering' && (
                    <span className="text-[10px] text-blue-400">Saving…</span>
                  )}
                  {f.status === 'error' && (
                    <span className="text-[10px] text-red-500 truncate">{f.error}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="px-4 py-2.5 border-t border-gray-100">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isActive}
              className="text-xs text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              + Add more images
            </button>
          </div>
        </div>
      )}
    </>
  );
}
