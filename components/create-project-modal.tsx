'use client';

import { useState, useRef } from 'react';
import { createProject } from '@/app/actions/projects';
import { updateProjectImage } from '@/app/actions/update-project';
import { getSignedUploadUrl, registerUploadedFile } from '@/app/actions/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { FolderPlus, Upload, X } from 'lucide-react';

interface CreateProjectModalProps {
  onProjectCreated: () => void;
}

export default function CreateProjectModal({ onProjectCreated }: CreateProjectModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // 1. Create Project
      const result = await createProject({ 
        name: projectName,
        description: description.trim() || undefined
      });
      
      if (!result.success || !result.project) {
        throw new Error(result.error || 'Failed to create project');
      }

      const projectId = result.project.id;

      // 2. Upload Image if selected
      if (selectedFile) {
        // Step A: get presigned URL from server (no file data sent)
        const urlResult = await getSignedUploadUrl(selectedFile.name);
        if (!urlResult.success || !urlResult.signedUrl || !urlResult.storagePath) {
          throw new Error(urlResult.error || 'Failed to get upload URL');
        }

        // Step B: upload directly from browser → Supabase
        const putRes = await fetch(urlResult.signedUrl, {
          method: 'PUT',
          body: selectedFile,
          headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
        });
        if (!putRes.ok) {
          throw new Error(`Upload failed (${putRes.status})`);
        }

        // Step C: register thread + update thumbnail
        const regResult = await registerUploadedFile(projectId, selectedFile.name, urlResult.storagePath);
        if (!regResult.success || !regResult.publicUrl) {
          throw new Error(regResult.error || 'Failed to save image');
        }

        // 4. Update Project Thumbnail
        await updateProjectImage(projectId, regResult.publicUrl);
      }

      setIsOpen(false);
      setProjectName('');
      setDescription('');
      handleRemoveFile();
      onProjectCreated();
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
          <FolderPlus size={20} />
          New Project
        </button>
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
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Add comments (Optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Type here"
            />
          </div>

          <div className="space-y-2">
            <Label>Project Image (Optional)</Label>
            <div 
              className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center min-h-[150px] transition-colors ${
                previewUrl ? 'border-primary/50 bg-primary/5' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {previewUrl ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img 
                    src={previewUrl} 
                    alt="Preview" 
                    className="max-h-[200px] object-contain rounded" 
                  />
                  <button
                    onClick={handleRemoveFile}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-sm"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div 
                  className="text-center cursor-pointer w-full h-full flex flex-col items-center justify-center"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 font-medium">Click to upload image</p>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 10MB</p>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
