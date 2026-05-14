'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import CommentsSidebar from '@/components/annotation/comments-sidebar';
import ThumbnailsSidebar from '@/components/annotation/thumbnails-sidebar';
import ShareLinkManager from '@/components/share-link-manager';
import type { Shape } from '@/types/drawing';
import type { AttachmentRecord } from '@/app/actions/storage';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Share,
  Image as ImageIcon,
  Search,
  Filter,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react";
export interface ProjectPin {
	id: string;
	number: number;
	x: number;
	y: number;
	content: string;
	author: string;
	timestamp: string;
	status: 'active' | 'resolved';
	isPending?: boolean;
	drawingData?: Shape | Shape[];
	attachments?: (AttachmentRecord & { signedUrl: string })[];
	replyCount?: number;
}

export interface ProjectImageData {
	id: string;
	name: string;
	url: string;
	pins: ProjectPin[];
}

interface ProjectRouteLayoutProps {
	children: React.ReactNode;
}

interface ProjectTopNavProps {
	isFullscreen: boolean;
	projectName: string;
	projectId: string;
	pins: ProjectPin[];
	pendingCount: number;
	isSyncing: boolean;
	currentUser?: string;
	sidebarsCollapsed?: boolean;
	onToggleSidebars?: () => void;
}

function getInitials(name?: string): string {
	if (!name) return '?';
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface ProjectShellProps {
	isFullscreen: boolean;
	images: ProjectImageData[];
	currentImageId: string;
	selectedPinId: string | null;
	onSelectPin: (pinId: string) => void;
	onResolveComment: (pinId: string) => void;
	projectId: string;
	onSelectImage: (imageId: string) => void;
	onUploadComplete: () => Promise<void>;
	onCommentTabChange?: (tab: 'active' | 'resolved') => void;
	onEditComment?: (commentId: string, newText: string) => Promise<{ success: boolean; error?: string }>;
	currentUser?: string;
	userRole?: string;
	sidebarsCollapsed?: boolean;
	children: React.ReactNode;
}

export default function ProjectRouteLayout({ children }: ProjectRouteLayoutProps) {
	return children;
}

export function ProjectTopNav({
	isFullscreen,
	projectName,
	projectId,
	pins,
	pendingCount,
	isSyncing,
	currentUser,
	sidebarsCollapsed,
	onToggleSidebars,
}: ProjectTopNavProps) {
	const router = useRouter();
	const userInitials = getInitials(currentUser);
	const userLabel = currentUser?.trim() || 'You';

	if (isFullscreen) {
		return null;
	}

	return (
		<header className="h-14 flex items-center justify-between px-4 border-b border-border/50 bg-background shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center overflow-hidden">
              <Image
                src="/logo.png"
                alt="Company logo"
                width={32}
                height={32}
                className="object-contain h-full w-full"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              — ExposéProfi
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${sidebarsCollapsed ? 'text-accent bg-accent/10' : 'text-muted-foreground'} hover:text-foreground`}
            onClick={onToggleSidebars}
            title={sidebarsCollapsed ? 'Show sidebars' : 'Hide sidebars for a fuller view'}
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Center: project name */}
        <span className="text-sm font-medium text-foreground truncate max-w-xs">{projectName}</span>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center -space-x-2 mr-2">
            <div
              className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold ring-2 ring-background"
              title="ExposéProfi"
            >
              EX
            </div>
            <div
              className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold ring-2 ring-background"
              title={userLabel}
            >
              {userInitials}
            </div>
          </div>
		  	<ShareLinkManager
					resourceType="project"
				resourceId={projectId}
				createdBy="user"
				resourceName={projectName}
			/>
        </div>
      </header>
	);
}

export function ProjectShell({
	isFullscreen,
	images,
	currentImageId,
	selectedPinId,
	onSelectPin,
	onResolveComment,
	projectId,
	onSelectImage,
	onUploadComplete,
	onCommentTabChange,
	onEditComment,
	currentUser,
	userRole,
	sidebarsCollapsed,
	children,
}: ProjectShellProps) {
	const showSidebars = !isFullscreen && !sidebarsCollapsed;
	return (
		<div className={`flex-1 flex overflow-hidden ${isFullscreen ? 'bg-black' : ''}`}>
			{showSidebars && (
				<CommentsSidebar
					allImages={images}
					currentImageId={currentImageId}
					selectedPinId={selectedPinId}
					onSelectPin={onSelectPin}
					onResolve={onResolveComment}
					onTabChange={onCommentTabChange}
					onEditComment={onEditComment}
					currentUser={currentUser}
					userRole={userRole}
					projectId={projectId}
				/>
			)}

			{children}

			{showSidebars && (
				<ThumbnailsSidebar
					images={images}
					currentImageId={currentImageId}
					onSelectImage={onSelectImage}
					projectId={projectId}
					onUploadComplete={onUploadComplete}
				/>
			)}
		</div>
	);
}
