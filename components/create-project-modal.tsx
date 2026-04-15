'use client';

import { useState, useRef, useEffect } from 'react';
import { createProject } from '@/app/actions/projects';
import { updateProjectImage } from '@/app/actions/update-project';
import { getSignedUploadUrl, registerUploadedFile } from '@/app/actions/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { FolderPlus, Upload, X, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { xhrUpload, validateFiles, type FileUploadState } from '@/lib/upload';

interface CreateProjectModalProps {
  onProjectCreated: () => void;
  trigger?: React.ReactNode;
}

const CONCURRENCY = 3;

export default function CreateProjectModal({ onProjectCreated, trigger }: CreateProjectModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploadStates, setUploadStates] = useState<FileUploadState[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const addFiles = (incoming: File[]) => {
    const { accepted, rejected } = validateFiles(incoming);
    if (rejected.length > 0) {
      setError(rejected.map(r => `${r.file.name}: ${r.reason}`).join('\n'));
    } else {
      setError('');
    }
    if (accepted.length > 0) {
      setSelectedFiles(prev => [...prev, ...accepted]);
      setPreviewUrls(prev => [...prev, ...accepted.map(f => URL.createObjectURL(f))]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    addFiles(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleRemoveFile = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearFiles = () => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setSelectedFiles([]);
    setPreviewUrls([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetForm = () => {
    setProjectName('');
    setDescription('');
    handleClearFiles();
    setUploadStates([]);
    setIsUploading(false);
    setError('');
  };

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }
    if (selectedFiles.length === 0) {
      setError('At least one image is required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // 1. Create project
      const result = await createProject({
        name: projectName,
        description: description.trim() || undefined
      });

      if (!result.success || !result.project) {
        throw new Error(result.error || 'Failed to create project');
      }

      const projectId = result.project.id;

      // 2. Upload images if any were selected
      if (selectedFiles.length > 0) {
        setIsUploading(true);

        const initialStates: FileUploadState[] = selectedFiles.map(f => ({
          id: crypto.randomUUID(),
          name: f.name,
          status: 'pending' as const,
          progress: 0,
        }));
        setUploadStates(initialStates);

        const patch = (id: string, update: Partial<FileUploadState>) =>
          setUploadStates(prev => prev.map(s => s.id === id ? { ...s, ...update } : s));

        const uploadOne = async (file: File, state: FileUploadState): Promise<string | null> => {
          patch(state.id, { status: 'uploading', progress: 0 });

          const urlResult = await getSignedUploadUrl(projectId, file.name);
          if (!urlResult.success || !urlResult.signedUrl || !urlResult.storagePath) {
            patch(state.id, { status: 'error', error: urlResult.error || 'Could not get upload URL' });
            return null;
          }

          try {
            await xhrUpload(file, urlResult.signedUrl, (pct) => patch(state.id, { progress: pct }));
          } catch (err: any) {
            patch(state.id, { status: 'error', error: err.message });
            return null;
          }

          patch(state.id, { status: 'registering', progress: 100 });
          const regResult = await registerUploadedFile(projectId, file.name, urlResult.storagePath);
          if (!regResult.success || !regResult.publicUrl) {
            patch(state.id, { status: 'error', error: regResult.error || 'Failed to save image' });
            return null;
          }

          patch(state.id, { status: 'done', progress: 100 });
          return regResult.publicUrl;
        };

        // Concurrent upload (max 3 parallel)
        const queue = selectedFiles.map((file, i) => ({ file, state: initialStates[i] }));
        const running: Promise<string | null>[] = [];
        let firstPublicUrl: string | null = null;

        for (const { file, state } of queue) {
          const p: Promise<string | null> = uploadOne(file, state).then(url => {
            if (url && !firstPublicUrl) firstPublicUrl = url;
            running.splice(running.indexOf(p), 1);
            return url;
          });
          running.push(p);
          if (running.length >= CONCURRENCY) await Promise.race(running);
        }
        await Promise.allSettled(running);

        // 3. Set thumbnail to first successfully uploaded image
        if (firstPublicUrl) {
          await updateProjectImage(projectId, firstPublicUrl);
        }

        setIsUploading(false);
      }

      // 4. Close and reset
      setIsOpen(false);
      resetForm();
      onProjectCreated();
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const doneCount = uploadStates.filter(s => s.status === 'done').length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isUploading) {
        setIsOpen(open);
        if (!open) resetForm();
      }
    }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button className="flex items-center gap-1 px-2 py-1 bg-primary  text-primary-foreground rounded-lg hover:bg-accent/20 hover:text-accent/80 transition-colors">
            <FolderPlus size={20} />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Create a new project to start annotating.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Add comments (Optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Type here"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label>Project Images <span className="text-destructive">*</span></Label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-4 min-h-[150px] transition-colors ${
                dragOver
                  ? 'border-primary bg-primary/10'
                  : selectedFiles.length > 0 || isUploading
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {isUploading ? (
                /* Upload progress list */
                <ul className="space-y-2 w-full max-h-[200px] overflow-y-auto">
                  {uploadStates.map(f => (
                    <li key={f.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-700 truncate max-w-[300px]" title={f.name}>
                          {f.name}
                        </span>
                        <span className="shrink-0 ml-2">
                          {f.status === 'done' && <CheckCircle2 size={14} className="text-green-500" />}
                          {f.status === 'error' && <XCircle size={14} className="text-red-500" />}
                          {(f.status === 'uploading' || f.status === 'registering' || f.status === 'pending') &&
                            <Loader2 size={14} className="animate-spin text-blue-500" />}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        {f.status === 'uploading' ? (
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-150"
                            style={{ width: `${f.progress}%` }}
                          />
                        ) : f.status === 'done' ? (
                          <div className="h-full w-full rounded-full bg-green-500" />
                        ) : f.status === 'error' ? (
                          <div className="h-full w-full rounded-full bg-red-400" />
                        ) : f.status === 'registering' ? (
                          <div className="h-full w-full rounded-full bg-blue-400 animate-pulse" />
                        ) : null}
                      </div>
                      {f.status === 'error' && f.error && (
                        <span className="text-[10px] text-red-500 truncate block mt-0.5">{f.error}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : selectedFiles.length > 0 ? (
                /* Thumbnail grid + add more */
                <div>
                  <div className="grid grid-cols-4 gap-2 w-full">
                    {previewUrls.map((url, i) => (
                      <div key={i} className="relative aspect-square">
                        <img
                          src={url}
                          alt={selectedFiles[i]?.name}
                          className="w-full h-full object-cover rounded"
                        />
                        <button
                          onClick={() => handleRemoveFile(i)}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-sm"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <div
                      className="aspect-square border-2 border-dashed rounded flex items-center justify-center cursor-pointer hover:bg-gray-50 border-gray-300"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    {selectedFiles.length} image{selectedFiles.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
              ) : (
                /* Empty state */
                <div
                  className="text-center cursor-pointer w-full h-full flex flex-col items-center justify-center"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 font-medium">Click or drag images to upload</p>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP, GIF, SVG — up to 20 MB each</p>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                multiple
                accept="image/*"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-line">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isUploading
              ? `Uploading... (${doneCount}/${uploadStates.length})`
              : isLoading
                ? 'Creating...'
                : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
