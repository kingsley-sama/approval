/**
 * ShareLinkManager Component
 * UI for creating, viewing, and managing share links
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  createShareLink,
  getShareLinksForResource,
  revokeShareLink,
  type SharePermission,
  type ShareResourceType,
  type ShareLink,
} from '@/app/actions/share-links';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface ShareLinkManagerProps {
  resourceType: ShareResourceType;
  resourceId: string;
  createdBy: string;
  resourceName?: string;
}

export default function ShareLinkManager({
  resourceType,
  resourceId,
  createdBy,
  resourceName = 'this resource',
}: ShareLinkManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form state
  const [permission, setPermission] = useState<SharePermission>('view');
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(30);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadShareLinks();
    }
  }, [isOpen]);

  const loadShareLinks = async () => {
    setIsLoading(true);
    const result = await getShareLinksForResource(resourceType, resourceId);
    if (result.success && result.shareLinks) {
      setShareLinks(result.shareLinks);
    }
    setIsLoading(false);
  };

  const handleCreateLink = async () => {
    setError('');
    setGeneratedUrl('');
    setIsLoading(true);

    const result = await createShareLink({
      resourceType,
      resourceId,
      permissions: permission,
      createdBy,
      expiresInDays,
    });

    if (result.success && result.url) {
      setGeneratedUrl(result.url);
      await loadShareLinks();
    } else {
      setError(result.error || 'Failed to create share link');
    }

    setIsLoading(false);
  };

  const handleRevokeLink = async (shareId: string) => {
    if (!confirm('Are you sure you want to revoke this share link?')) return;

    setIsLoading(true);
    const result = await revokeShareLink(shareId);
    
    if (result.success) {
      await loadShareLinks();
    } else {
      setError(result.error || 'Failed to revoke link');
    }
    
    setIsLoading(false);
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const getPermissionLabel = (perm: SharePermission) => {
    switch (perm) {
      case 'view': return 'View Only';
      case 'comment': return 'View & Comment';
      case 'draw_and_comment': return 'Full Access (Draw & Comment)';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          🔗 Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share: {resourceName}</DialogTitle>
          <DialogDescription>
            Create secure links for clients to access this {resourceType}
          </DialogDescription>
        </DialogHeader>

        {/* Create New Link */}
        <div className="space-y-4 py-4 border-b">
          <h3 className="font-semibold">Create New Share Link</h3>
          
          <div className="grid gap-4">
            <div>
              <Label htmlFor="permission">Permission Level</Label>
              <Select
                value={permission}
                onValueChange={(val) => setPermission(val as SharePermission)}
              >
                <SelectTrigger id="permission">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View Only</SelectItem>
                  <SelectItem value="comment">View & Comment</SelectItem>
                  <SelectItem value="draw_and_comment">Full Access (Draw & Comment)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="expires">Expires In (days)</Label>
              <Input
                id="expires"
                type="number"
                min={1}
                max={365}
                value={expiresInDays || ''}
                onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Never expires (leave empty)"
              />
            </div>

            <Button onClick={handleCreateLink} disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Generate Share Link'}
            </Button>

            {generatedUrl && (
              <div className="p-4 bg-green-50 border border-green-200 rounded">
                <p className="text-sm font-medium text-green-800 mb-2">
                  Link created successfully!
                </p>
                <div className="flex gap-2">
                  <Input value={generatedUrl} readOnly className="flex-1" />
                  <Button
                    onClick={() => copyToClipboard(generatedUrl)}
                    variant="outline"
                    size="sm"
                  >
                    Copy
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        </div>

        {/* Existing Links */}
        <div className="space-y-4 py-4">
          <h3 className="font-semibold">Existing Share Links</h3>
          
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : shareLinks.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No share links created yet</p>
          ) : (
            <div className="space-y-3">
              {shareLinks.map((link) => (
                <div
                  key={link.id}
                  className={`p-3 border rounded ${link.isActive ? 'bg-white' : 'bg-gray-50'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-sm font-medium">
                        {getPermissionLabel(link.permissions)}
                      </span>
                      {!link.isActive && (
                        <span className="ml-2 text-xs text-red-600">(Revoked)</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {link.isActive && (
                        <>
                          <Button
                            onClick={() => copyToClipboard(
                              `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/share/${link.token}`
                            )}
                            variant="ghost"
                            size="sm"
                          >
                            Copy
                          </Button>
                          <Button
                            onClick={() => handleRevokeLink(link.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                          >
                            Revoke
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>Created: {new Date(link.createdAt).toLocaleString()}</p>
                    {link.expiresAt && (
                      <p>Expires: {new Date(link.expiresAt).toLocaleString()}</p>
                    )}
                    <p>Accessed: {link.accessCount} times</p>
                    {link.lastAccessedAt && (
                      <p>Last access: {new Date(link.lastAccessedAt).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => setIsOpen(false)} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
