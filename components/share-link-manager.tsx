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
import { Share, Check, Copy } from 'lucide-react';
import { useConfirm } from '@/components/confirm-dialog';

interface ShareLinkManagerProps {
  resourceType: ShareResourceType;
  resourceId: string;
  createdBy: string;
  resourceName?: string;
  trigger?: React.ReactNode;
}

export default function ShareLinkManager({
  resourceType,
  resourceId,
  createdBy,
  resourceName = 'this resource',
  trigger,
}: ShareLinkManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const confirm = useConfirm();
  
  // Form state
  const [permission, setPermission] = useState<SharePermission>('view');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [embedCode, setEmbedCode] = useState('');
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
    });

    if (result.success && result.url) {
      setGeneratedUrl(result.url);
      await loadShareLinks();
    } else {
      setError(result.error || 'Failed to create share link');
    }

    setIsLoading(false);
  };

  const handleCreateEmbedLink = async () => {
    setError('');
    setEmbedUrl('');
    setEmbedCode('');
    setIsLoading(true);

    const result = await createShareLink({
      resourceType,
      resourceId,
      permissions: 'view',
      createdBy,
    });

    if (result.success && result.url) {
      const embedTarget = result.url.replace('/share/', '/panoramas/embed/');
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const iframeCode = `<iframe src="${origin ? `${origin}${embedTarget.replace(origin, '')}` : embedTarget}" title="Panorama viewer" width="100%" height="600" style="border:0; border-radius:12px;"></iframe>`;
      setEmbedUrl(embedTarget);
      setEmbedCode(iframeCode);
      await loadShareLinks();
    } else {
      setError(result.error || 'Failed to create embed link');
    }

    setIsLoading(false);
  };

  const handleRevokeLink = async (shareId: string) => {
    const confirmed = await confirm({
      title: 'Revoke this share link?',
      description: 'Anyone using this link will lose access immediately. This cannot be undone.',
      confirmText: 'Revoke',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!confirmed) return;

    setIsLoading(true);
    const result = await revokeShareLink(shareId);
    
    if (result.success) {
      await loadShareLinks();
    } else {
      setError(result.error || 'Failed to revoke link');
    }
    
    setIsLoading(false);
  };

  const copyToClipboard = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers blocking clipboard API
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(prev => (prev === key ? null : prev));
    }, 1800);
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
        {trigger ?? (
          <Button
            size="sm"
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-8 px-4 text-xs font-semibold"
          >
            <Share className="h-3.5 w-3.5" />
            Share
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Share: {resourceName}</DialogTitle>
          <DialogDescription>
            Create secure links for clients to access this {resourceType}
          </DialogDescription>
        </DialogHeader>

        {resourceType === 'panorama_project' && (
          <div className="space-y-4 py-4 border-b">
            <div className="space-y-1">
              <h3 className="font-semibold">Public embed viewer</h3>
              <p className="text-sm text-muted-foreground">
                Generate a read-only panorama viewer for client websites. No comments, no protected access.
              </p>
            </div>

            <Button onClick={handleCreateEmbedLink} disabled={isLoading}>
              {isLoading ? 'Generating...' : 'Generate embed link'}
            </Button>

            {embedUrl && (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Embed URL</Label>
                  <div className="flex gap-2">
                    <Input value={embedUrl} readOnly className="flex-1" />
                    <Button onClick={() => copyToClipboard(embedUrl, 'embed-url')} variant="outline" size="sm" aria-live="polite">
                      {copiedKey === 'embed-url' ? <><Check className="h-3.5 w-3.5 mr-1" />Copied</> : <><Copy className="h-3.5 w-3.5 mr-1" />Copy</>}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Iframe embed code</Label>
                  <textarea readOnly value={embedCode} className="min-h-24 w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-mono text-gray-700" />
                  <Button onClick={() => copyToClipboard(embedCode, 'embed-code')} variant="outline" size="sm" aria-live="polite">
                    {copiedKey === 'embed-code' ? <><Check className="h-3.5 w-3.5 mr-1" />Copied</> : <><Copy className="h-3.5 w-3.5 mr-1" />Copy embed</>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

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
                    onClick={() => copyToClipboard(generatedUrl, 'generated')}
                    variant="outline"
                    size="sm"
                    aria-live="polite"
                  >
                    {copiedKey === 'generated' ? (
                      <><Check className="h-3.5 w-3.5 mr-1" />Copied</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5 mr-1" />Copy</>
                    )}
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
                              `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${link.token}`,
                              link.id,
                            )}
                            variant="ghost"
                            size="sm"
                            aria-live="polite"
                          >
                            {copiedKey === link.id ? (
                              <><Check className="h-3.5 w-3.5 mr-1" />Copied</>
                            ) : (
                              <><Copy className="h-3.5 w-3.5 mr-1" />Copy</>
                            )}
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
