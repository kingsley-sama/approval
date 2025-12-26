"use client"

import { useRef, useState, useEffect } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

interface Pin {
  id: number
  x: number
  y: number
  comment: string
  author: string
  timestamp: string
  isNew?: boolean
}

interface ImageViewerProps {
  pins: Pin[]
  selectedPin: number | null
  onPinClick: (x: number, y: number, pinId?: number) => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  hoveredPin: number | null
  onPinHover: (pinId: number | null) => void
}

export default function ImageViewer({
  pins,
  selectedPin,
  onPinClick,
  isFullscreen,
  onToggleFullscreen,
  hoveredPin,
  onPinHover,
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const img = imageRef.current
    if (img && img.complete) {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
    }

    const handleLoad = () => {
      if (img) {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
      }
    }

    if (img) {
      img.addEventListener('load', handleLoad)
      return () => img.removeEventListener('load', handleLoad)
    }
  }, [])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !containerRef.current) return

    const target = e.target as HTMLElement
    if (target.closest('[data-pin]')) return

    const img = imageRef.current
    const imgRect = img.getBoundingClientRect()
    const clickX = e.clientX - imgRect.left
    const clickY = e.clientY - imgRect.top

    const x = (clickX / imgRect.width) * 100
    const y = (clickY / imgRect.height) * 100

    onPinClick(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)))
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 relative overflow-auto transition-colors ${
        isFullscreen ? 'bg-black' : 'bg-gray-100'
      }`}
    >
      <div className={isFullscreen ? 'w-screen h-screen flex items-center justify-center' : 'inline-flex items-center justify-center min-w-full min-h-full'}>
        <div className="relative" style={isFullscreen && imageDimensions.width ? {
          width: '100vw',
          aspectRatio: `${imageDimensions.width} / ${imageDimensions.height}`
        } : {}}>
          <img
            ref={imageRef}
            src="https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1600&q=80&auto=format&fit=crop"
            alt="Annotation image"
            className={isFullscreen ? 'w-full h-full object-cover block' : 'block max-w-none'}
            crossOrigin="anonymous"
            onClick={handleClick}
            style={{ cursor: 'url(/sample_cursors/cursor.svg), auto' }}
          />

          {pins.map((pin) => (
            <div
              key={pin.id}
              data-pin={pin.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
              style={{
                left: `${pin.x}%`,
                top: `${pin.y}%`,
              }}
              onMouseEnter={() => onPinHover(pin.id)}
              onMouseLeave={() => onPinHover(null)}
              onClick={(e) => {
                e.stopPropagation()
                onPinClick(pin.x, pin.y, pin.id)
              }}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-semibold transition-all ${
                  selectedPin === pin.id
                    ? 'bg-blue-700 ring-2 ring-blue-300 scale-110 shadow-lg'
                    : hoveredPin === pin.id
                    ? 'bg-blue-700 scale-110 shadow-lg'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}>
                {pin.id}
              </div>

              {hoveredPin === pin.id && pin.comment && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none z-10">
                  {pin.comment}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onToggleFullscreen}
        className={`fixed top-4 right-4 p-2 rounded-lg transition-colors z-10 ${
          isFullscreen
            ? 'bg-white/10 hover:bg-white/20 text-white'
            : 'bg-white hover:bg-gray-100 text-gray-700'
        }`}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
      </button>
    </div>
  )
}
