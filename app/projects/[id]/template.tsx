'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import CommentsSidebar from '@/components/annotation/comments-sidebar';
import ThumbnailsSidebar from '@/components/annotation/thumbnails-sidebar';
import ShareLinkManager from '@/components/share-link-manager';
import type { Shape } from '@/types/drawing';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Share,
  Settings,
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
	drawingData?: Shape;
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
}: ProjectTopNavProps) {
	const router = useRouter();

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
          <div className="w-8 h-8 rounded-lg flex items-center justify-center">
						<Image
							src="/logo.png"
							alt="Company logo"
							width={20}
							height={20}
							className="object-contain"
						/>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Center: project name */}
        <span className="text-sm font-medium text-foreground truncate max-w-xs">{projectName}</span>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center -space-x-2 mr-2">
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold ring-2 ring-background">
              EX
            </div>
            <div className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold ring-2 ring-background">
              SK
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
	children,
}: ProjectShellProps) {
	return (
		<div className={`flex-1 flex overflow-hidden ${isFullscreen ? 'bg-black' : ''}`}>
			{!isFullscreen && (
				<CommentsSidebar
					allImages={images}
					currentImageId={currentImageId}
					selectedPinId={selectedPinId}
					onSelectPin={onSelectPin}
					onResolve={onResolveComment}
				/>
			)}

			{children}

			{!isFullscreen && (
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
