/**
 * PanoramaDuplicator Component
 * UI for duplicating panorama projects with configurable options
 */

'use client';

import React, { useState } from 'react';
import {
  duplicatePanoramaProject,
  type DuplicatePanoramaInput,
  type DuplicationResult,
} from '@/app/actions/duplicate-panorama';
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

interface PanoramaDuplicatorProps {
  projectId: string;
  projectName: string;
  createdBy: string;
  onSuccess?: (newProjectId: string) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function PanoramaDuplicator({
  projectId,
  projectName,
  createdBy,
  onSuccess,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
}: PanoramaDuplicatorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newName, setNewName] = useState(`${projectName} (Copy)`);
  const [copyComments, setCopyComments] = useState(false);
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
        error: 'Please enter a name for the duplicated panorama',
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    const input: DuplicatePanoramaInput = {
      sourceProjectId: projectId,
      newProjectName: newName.trim(),
      options: {
        copyComments,
        anonymizeCommenters,
      },
      createdBy,
    };

    const duplicateResult = await duplicatePanoramaProject(input);
    setResult(duplicateResult);
    setIsLoading(false);

    if (duplicateResult.success && duplicateResult.newProjectId) {
      onSuccess?.(duplicateResult.newProjectId);
      setTimeout(() => {
        setIsOpen(false);
        // Reset form
        setNewName(`${projectName} (Copy)`);
        setCopyComments(false);
        setAnonymizeCommenters(false);
        setResult(null);
      }, 2000);
    }
  };

  const resetForm = () => {
    setNewName(`${projectName} (Copy)`);
    setCopyComments(false);
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
          <DialogTitle>Duplicate Panorama</DialogTitle>
          <DialogDescription>
            Create a copy of <strong>{projectName}</strong> with customizable options
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* New Project Name */}
          <div className="space-y-2">
            <Label htmlFor="new-name">New Panorama Name</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter panorama name"
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
                    Panorama Images (Always included)
                  </label>
                  <p className="text-xs text-gray-500">
                    All panorama images will be duplicated
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
                    Include all hotspot comments and annotations
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
                    If enabled, copied comment authors will be renamed to Client
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
                  <p className="font-semibold mb-2">✅ Panorama duplicated successfully!</p>
                  {result.details && (
                    <ul className="space-y-1 text-xs">
                      <li>• Images copied: {result.details.imagesCopied}</li>
                      {result.details.commentsCopied !== undefined && (
                        <li>• Comments copied: {result.details.commentsCopied}</li>
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
            {isLoading ? 'Duplicating...' : 'Duplicate Panorama'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
