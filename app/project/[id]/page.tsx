'use client';
import React, { useState } from 'react';
import ImageViewer from '@/components/annotation/image-viewer';
import CommentsSidebar from '@/components/annotation/comments-sidebar';
import ThumbnailsSidebar from '@/components/annotation/thumbnails-sidebar';
import CommentModal from '@/components/annotation/comment-modal';

interface Pin {
  id: number;
  x: number;
  y: number;
  comment: string;
  author: string;
  timestamp: string;
  isNew?: boolean;
  resolved?: boolean;
}

interface ImageData {
  id: number;
  name: string;
  url: string;
  pins: Pin[];
}

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    name?: string;
  }>;
}

export default function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { id: projectId } = React.use(params);
  const { name } = React.use(searchParams);
  const projectName = name ? decodeURIComponent(name) : `Project ${projectId}`;

  // In production, fetch project data based on projectId from your database
  const images: ImageData[] = [
    {
      id: 1,
      name: '01. Building Exterior.jpg',
      url: '/building-exterior-view.jpg',
      pins: [],
    },
    {
      id: 2,
      name: '02. Modern House.jpg',
      url: '/modern-house-exterior.jpg',
      pins: [],
    },
    {
      id: 3,
      name: '03. Living Room.jpg',
      url: '/living-room-interior.jpg',
      pins: [],
    },
    {
      id: 4,
      name: '04. Office Space.jpg',
      url: '/interior-office-space.jpg',
      pins: [],
    },
  ];

  const [currentImageId, setCurrentImageId] = useState(1);
  const [imagesState, setImagesState] = useState(images);
  const [showModal, setShowModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [selectedPin, setSelectedPin] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredPin, setHoveredPin] = useState<number | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const currentImage = imagesState.find(img => img.id === currentImageId);
  const pins = currentImage?.pins || [];

  const handleImageClick = (x: number, y: number) => {
    const newPin: Pin = {
      id: Math.max(...pins.map(p => p.id), 0) + 1,
      x,
      y,
      comment: '',
      author: '',
      timestamp: new Date().toLocaleDateString(),
    };
    
    setImagesState(imagesState.map(img =>
      img.id === currentImageId
        ? { ...img, pins: [...img.pins, newPin] }
        : img
    ));
    
    setModalPosition({ x, y });
    setSelectedPin(newPin.id);
    setShowModal(true);
  };

  const handleAddComment = (text: string) => {
    setImagesState(imagesState.map(img =>
      img.id === currentImageId
        ? {
            ...img,
            pins: img.pins.map(pin =>
              pin.id === selectedPin
                ? {
                    ...pin,
                    comment: text,
                    author: 'Kingsley Francis',
                    isNew: true,
                  }
                : pin
            ),
          }
        : img
    ));
    setShowModal(false);
  };

  const handleSwitchImage = (imageId: number) => {
    const index = imagesState.findIndex(img => img.id === imageId);
    if (index !== -1) {
      setCurrentImageIndex(index);
    }
    setCurrentImageId(imageId);
    setSelectedPin(null);
    setShowModal(false);
  };

  const handleResolveComment = (pinId: number) => {
    setImagesState(imagesState.map(img =>
      img.id === currentImageId
        ? {
            ...img,
            pins: img.pins.map(pin =>
              pin.id === pinId
                ? { ...pin, resolved: !pin.resolved }
                : pin
            ),
          }
        : img
    ));
  };

  const handleNavigateImages = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentImageIndex > 0) {
      handleSwitchImage(images[currentImageIndex - 1].id);
      setCurrentImageIndex(currentImageIndex - 1);
    } else if (direction === 'next' && currentImageIndex < images.length - 1) {
      handleSwitchImage(images[currentImageIndex + 1].id);
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };

  return (
    <div className={`h-screen bg-background text-foreground flex flex-col ${isFullscreen ? 'fixed inset-0' : ''}`}>
      {!isFullscreen && (
        <div className="border-b border-border bg-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-lg font-semibold">{projectName}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{pins.filter(p => p.comment && !p.resolved).length} Active</span>
              <span>{pins.filter(p => p.resolved).length} Resolved</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700">
              Comment
            </button>
            <button className="px-4 py-2 border border-border rounded-md text-sm hover:bg-muted">
              Browse
            </button>
            <button className="px-4 py-2 border border-border rounded-md text-sm hover:bg-muted">
              Share
            </button>
          </div>
        </div>
      )}

      <div className={`flex-1 flex overflow-hidden ${isFullscreen ? 'bg-black' : ''}`}>
        {!isFullscreen && (
          <CommentsSidebar 
            pins={pins} 
            selectedPin={selectedPin} 
            setSelectedPin={setSelectedPin} 
            onResolve={handleResolveComment}
            images={imagesState}
            currentImageId={currentImageId}
            allImages={imagesState}
          />
        )}

        <ImageViewer
          pins={pins}
          selectedPin={selectedPin}
          onPinClick={(x, y, pinId) => {
            if (pinId) {
              setSelectedPin(pinId);
              const pin = pins.find(p => p.id === pinId);
              if (pin) {
                setModalPosition({ x: pin.x, y: pin.y });
                setShowModal(true);
              }
            } else {
              handleImageClick(x, y);
            }
          }}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          hoveredPin={hoveredPin}
          onPinHover={setHoveredPin}
          currentImageIndex={currentImageIndex}
          totalImages={imagesState.length}
          onNavigate={handleNavigateImages}
          currentImageUrl={currentImage?.url || '/building-exterior-view.jpg'}
        />

        {!isFullscreen && (
          <ThumbnailsSidebar
            images={imagesState}
            currentImageId={currentImageId}
            onSelectImage={handleSwitchImage}
          />
        )}
      </div>

      {showModal && selectedPin && (
        <CommentModal
          position={modalPosition}
          onClose={() => setShowModal(false)}
          onSubmit={handleAddComment}
          pin={pins.find(p => p.id === selectedPin)}
          isFullscreen={isFullscreen}
        />
      )}
    </div>
  );
}
