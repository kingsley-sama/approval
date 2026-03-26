/**
 * ProjectDuplicator Component
 * UI for duplicating projects/folders with configurable options
 */

'use client';

import React, { useState } from 'react';
import {
  duplicateProject,
  type DuplicateProjectInput,
  type DuplicationResult,
} from '@/app/actions/duplicate-project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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

interface ProjectDuplicatorProps {
  projectId: string;
  projectName: string;
  createdBy: string;
  onSuccess?: (newProjectId: string) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function ProjectDuplicator({
  projectId,
  projectName,
  createdBy,
  onSuccess,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
}: ProjectDuplicatorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newName, setNewName] = useState(`${projectName} (Copy)`);
  const [copyComments, setCopyComments] = useState(false);
  const [copyDrawings, setCopyDrawings] = useState(false);
  const [anonymizeCommenters, setAnonymizeCommenters] = useState(false);
  const [result, setResult] = useState<DuplicationResult | null>(null);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (isControlled) {
      controlledOnOpenChange?.(open);
    } else {
      setInternalIsOpen(open);
    }
  };

  const handleDuplicate = async () => {
    if (!newName.trim()) {
      setResult({
        success: false,
        error: 'Please enter a name for the duplicated project',
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    const input: DuplicateProjectInput = {
      sourceProjectId: projectId,
      newProjectName: newName.trim(),
      options: {
        copyComments,
        copyDrawings,
        anonymizeCommenters,
      },
      createdBy,
    };

    const duplicateResult = await duplicateProject(input);
    setResult(duplicateResult);
    setIsLoading(false);

    if (duplicateResult.success && duplicateResult.newProjectId) {
      onSuccess?.(duplicateResult.newProjectId);
      setTimeout(() => {
        setIsOpen(false);
        // Reset form
        setNewName(`${projectName} (Copy)`);
        setCopyComments(false);
        setCopyDrawings(false);
        setAnonymizeCommenters(false);
        setResult(null);
      }, 2000);
    }
  };

  const resetForm = () => {
    setNewName(`${projectName} (Copy)`);
    setCopyComments(false);
    setCopyDrawings(false);
    setAnonymizeCommenters(false);
    setResult(null);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) resetForm();
      }}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            📋 Duplicate
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate Project</DialogTitle>
          <DialogDescription>
            Create a copy of <strong>{projectName}</strong> with customizable options
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* New Project Name */}
          <div className="space-y-2">
            <Label htmlFor="new-name">New Project Name</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter project name"
              disabled={isLoading}
            />
          </div>

          {/* Duplication Options */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">What to copy:</Label>
            
            <div className="space-y-3 pl-2">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="copy-images"
                  checked={true}
                  disabled={true}
                />
                <div className="space-y-1">
                  <label
                    htmlFor="copy-images"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Images (Always included)
                  </label>
                  <p className="text-xs text-gray-500">
                    All images/threads will be duplicated
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="copy-comments"
                  checked={copyComments}
                  onCheckedChange={(checked) => {
                    const next = checked as boolean;
                    setCopyComments(next);
                    if (!next) {
                      setAnonymizeCommenters(false);
                    }
                  }}
                  disabled={isLoading}
                />
                <div className="space-y-1">
                  <label
                    htmlFor="copy-comments"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Comments
                  </label>
                  <p className="text-xs text-gray-500">
                    Include all comments and annotations
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="anonymize-commenters"
                  checked={anonymizeCommenters}
                  onCheckedChange={(checked) => setAnonymizeCommenters(checked as boolean)}
                  disabled={isLoading || !copyComments}
                />
                <div className="space-y-1">
                  <label
                    htmlFor="anonymize-commenters"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Make commenter names anonymous
                  </label>
                  <p className="text-xs text-gray-500">
                    If enabled, copied comment authors will be renamed to client
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="copy-drawings"
                  checked={copyDrawings}
                  onCheckedChange={(checked) => setCopyDrawings(checked as boolean)}
                  disabled={isLoading}
                />
                <div className="space-y-1">
                  <label
                    htmlFor="copy-drawings"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Drawings
                  </label>
                  <p className="text-xs text-gray-500">
                    Include all drawing markups
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Result Display */}
          {result && (
            <div
              className={`p-4 rounded border ${
                result.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              {result.success ? (
                <div className="text-sm text-green-800">
                  <p className="font-semibold mb-2">✅ Project duplicated successfully!</p>
                  {result.details && (
                    <ul className="space-y-1 text-xs">
                      <li>• Images copied: {result.details.threadsCopied}</li>
                      {result.details.commentsCopied !== undefined && (
                        <li>• Comments copied: {result.details.commentsCopied}</li>
                      )}
                      {result.details.drawingsCopied !== undefined && (
                        <li>• Drawings copied: {result.details.drawingsCopied}</li>
                      )}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-sm text-red-800">
                  ❌ Error: {result.error}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => setIsOpen(false)}
            variant="outline"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDuplicate}
            disabled={isLoading || !newName.trim()}
          >
            {isLoading ? 'Duplicating...' : 'Duplicate Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
