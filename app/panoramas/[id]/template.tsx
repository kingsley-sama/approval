'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import ShareLinkManager from '@/components/share-link-manager';
import PanoramaCommentsSidebar, { type PanoramaSidebarImage } from '@/components/panorama/panorama-comments-sidebar';
import PanoramaThumbnailsSidebar, { type PanoramaImageItem } from '@/components/panorama/panorama-thumbnails-sidebar';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { ArrowLeft, PanelsTopLeft, Download } from 'lucide-react';

// `template.tsx` is a reserved Next.js route convention: Next renders this
// file's DEFAULT export as a wrapper around the page. We only use this module
// for the named TopNav/Shell helpers below, so the default is a pass-through
// (mirrors app/projects/[id]/template.tsx).
export default function PanoramaRouteTemplate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export interface PanoramaPin {
  id: string;
  number: number;
  pitch: number;
  yaw: number;
  content: string;
  author: string;
  timestamp: string;
  status: 'active' | 'resolved';
  replyCount?: number;
  isPending?: boolean;
}

export interface PanoramaImageData {
  id: string;
  name: string;
  url: string;
  pins: PanoramaPin[];
}

export function PanoramaTopNav({
  isFullscreen,
  projectName,
  projectId,
  sidebarsCollapsed,
  onToggleSidebars,
  currentImageUrl,
  currentImageName,
  onDownload,
  isDownloading,
}: {
  isFullscreen: boolean;
  projectName: string;
  projectId: string;
  sidebarsCollapsed: boolean;
  onToggleSidebars: () => void;
  currentImageUrl?: string;
  currentImageName?: string;
  onDownload?: () => Promise<void>;
  isDownloading?: boolean;
}) {
  const router = useRouter();
  if (isFullscreen) return null;

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-border/50 bg-background shrink-0 z-10">
      <div className="flex items-center gap-3">
        <IconTooltip label="Back to panoramas">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/panoramas')}
            aria-label="Back to panoramas"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <div className="w-8 h-8 flex items-center justify-center overflow-hidden">
          <Image src="/logo.png" alt="Company logo" width={32} height={32} className="object-contain h-full w-full" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          — ExposéProfi
        </div>
        <IconTooltip label={sidebarsCollapsed ? 'Show panels' : 'Hide panels'}>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${sidebarsCollapsed ? 'text-accent bg-accent/10' : 'text-muted-foreground'} hover:text-foreground`}
            onClick={onToggleSidebars}
            aria-label={sidebarsCollapsed ? 'Show panels' : 'Hide panels'}
          >
            <PanelsTopLeft className="h-4 w-4" />
          </Button>
        </IconTooltip>
      </div>

      <span className="text-sm font-medium text-foreground truncate max-w-xs">{projectName}</span>

      <div className="flex items-center gap-2">
        {currentImageUrl && onDownload && (
          <IconTooltip label="Download panorama image">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={onDownload}
              disabled={isDownloading}
              aria-label="Download panorama"
            >
              <Download className={`h-4 w-4 ${isDownloading ? 'animate-pulse' : ''}`} />
            </Button>
          </IconTooltip>
        )}
        <ShareLinkManager
          resourceType="panorama_project"
          resourceId={projectId}
          createdBy="user"
          resourceName={projectName}
        />
      </div>
    </header>
  );
}

export function PanoramaShell({
  isFullscreen,
  sidebarsCollapsed,
  commentImages,
  thumbnailImages,
  currentImageId,
  selectedPinId,
  onSelectPin,
  onResolve,
  onTabChange,
  onSelectImage,
  projectId,
  onUploadComplete,
  canUpload,
  currentUser,
  userRole,
  onEditComment,
  onDeleteComment,
  currentImageUrl,
  currentImageName,
  onDownload,
  isDownloading,
  children,
}: {
  isFullscreen: boolean;
  sidebarsCollapsed: boolean;
  commentImages: PanoramaSidebarImage[];
  thumbnailImages: PanoramaImageItem[];
  currentImageId: string;
  selectedPinId: string | null;
  onSelectPin: (id: string) => void;
  onResolve: (id: string) => void;
  onTabChange: (tab: 'active' | 'resolved') => void;
  onSelectImage: (id: string) => void;
  projectId: string;
  onUploadComplete: () => void | Promise<void>;
  canUpload: boolean;
  currentUser: string;
  userRole: string;
  onEditComment: (id: string, text: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteComment: (id: string) => void;
  currentImageUrl?: string;
  currentImageName?: string;
  onDownload?: () => Promise<void>;
  isDownloading?: boolean;
  children: React.ReactNode;
}) {
  const showSidebars = !isFullscreen && !sidebarsCollapsed;
  return (
    <div className={`flex-1 flex overflow-hidden ${isFullscreen ? 'bg-black' : ''}`}>
      {showSidebars && (
        <PanoramaCommentsSidebar
          images={commentImages}
          currentImageId={currentImageId}
          selectedPinId={selectedPinId}
          onSelectPin={onSelectPin}
          onResolve={onResolve}
          onTabChange={onTabChange}
          currentUser={currentUser}
          userRole={userRole}
          projectId={projectId}
          onEditComment={onEditComment}
          onDeleteComment={onDeleteComment}
        />
      )}

      {children}

      {showSidebars && (
        <PanoramaThumbnailsSidebar
          images={thumbnailImages}
          currentImageId={currentImageId}
          onSelectImage={onSelectImage}
          projectId={projectId}
          onUploadComplete={onUploadComplete}
          canUpload={canUpload}
        />
      )}
    </div>
  );
}
