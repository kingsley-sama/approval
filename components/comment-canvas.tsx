"use client"

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface Comment {
  id: number
  x: number // percent (0-100)
  y: number // percent (0-100)
  text: string
  author: string
  color: string
  timestamp: Date
  resolved?: boolean
}

interface CommentCanvasProps {
  imageSrc: string
  tool: string
  color: string
  onSaveComment?: (comment: Comment) => void
  onAddComment?: (comment: Comment) => void
  comments?: Comment[]
  currentUser?: string
  selectedCommentId?: number | null
  onSelectComment?: (id: number | null) => void
}

const CommentCanvas = forwardRef<any, CommentCanvasProps>(
  (
    {
      imageSrc,
      tool,
      color,
      onSaveComment,
      onAddComment,
      comments = [],
      currentUser,
      selectedCommentId,
      onSelectComment,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const imageRef = useRef<HTMLImageElement>(null)
    const [imageLoaded, setImageLoaded] = useState(false)
    const [showCommentInput, setShowCommentInput] = useState(false)
    const [commentPosition, setCommentPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const [commentText, setCommentText] = useState("")

    useImperativeHandle(ref, () => ({
      focus: () => {
        // example imperative handle
      },
    }))

    useEffect(() => {
      const img = imageRef.current
      if (img && img.complete) setImageLoaded(true)

      const handleLoad = () => setImageLoaded(true)
      if (img) {
        img.addEventListener("load", handleLoad)
        return () => img.removeEventListener("load", handleLoad)
      }
    }, [imageSrc])

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!imageRef.current) return

      const target = e.target as HTMLElement
      if (target.closest("[data-pin]")) return

      const img = imageRef.current
      const rect = img.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      const x = (clickX / rect.width) * 100
      const y = (clickY / rect.height) * 100

      setCommentPosition({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) })
      setCommentText("")
      setShowCommentInput(true)
    }

    const handleSaveComment = () => {
      if (!commentText.trim()) return

      const newComment: Comment = {
        id: Date.now(),
        x: commentPosition.x,
        y: commentPosition.y,
        text: commentText,
        author: currentUser || "Anonymous",
        color: color,
        timestamp: new Date(),
        resolved: false,
      }

      const saveHandler = onAddComment || onSaveComment
      saveHandler?.(newComment)
      setShowCommentInput(false)
      setCommentText("")
    }

    const handlePinClick = (commentId: number, e: React.MouseEvent) => {
      e.stopPropagation()
      onSelectComment?.(selectedCommentId === commentId ? null : commentId)
    }

    return (
      <div ref={containerRef} className="relative w-full bg-linear-to-br from-slate-900 to-slate-800">
        <div className="relative" onClick={handleClick}>
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Annotation image"
            className="block max-w-none w-full h-auto"
            crossOrigin="anonymous"
            style={{ cursor: "url(/cursor.svg), auto" }}
          />

          {comments.map((c) => (
            <div
              key={c.id}
              data-pin={c.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
              style={{ left: `${c.x}%`, top: `${c.y}%` }}
              onClick={(e) => handlePinClick(c.id, e as any)}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-semibold transition-all ${
                  selectedCommentId === c.id ? "bg-blue-700 ring-2 ring-blue-300 scale-110 shadow-lg" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {c.id % 100}
              </div>
            </div>
          ))}

          {showCommentInput && (
            <div
              className="absolute z-20"
              style={{ left: `${commentPosition.x}%`, top: `${commentPosition.y}%`, transform: "translate(12px, 12px)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="p-3 w-64">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write a comment..."
                      className="w-full resize-none text-sm p-2 border rounded"
                      rows={4}
                    />
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <Button onClick={handleSaveComment} disabled={!commentText.trim()} className="flex-1">
                    Post
                  </Button>
                  <Button variant="ghost" onClick={() => setShowCommentInput(false)}>
                    <X />
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground mt-2">Press Esc to cancel • Cmd/Ctrl+Enter to save</p>
              </Card>
            </div>
          )}
        </div>
      </div>
    )
  }
)

CommentCanvas.displayName = "CommentCanvas"

export default CommentCanvas
