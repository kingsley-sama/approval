import { ArrowDown } from 'lucide-react';
import { formatFileSize } from '@/lib/image-compression';

interface CompressionInfoProps {
  originalSize?: number;
  compressedSize?: number;
  didCompress?: boolean;
  className?: string;
}

/**
 * Renders what compression did to an uploaded image: the original → compressed
 * size and percent saved when it helped, or a quiet "no compression needed"
 * note otherwise. Returns nothing until sizes are known.
 */
export function CompressionInfo({
  originalSize,
  compressedSize,
  didCompress,
  className,
}: CompressionInfoProps) {
  if (originalSize == null || compressedSize == null) return null;

  if (didCompress) {
    const saved = originalSize - compressedSize;
    const pct = originalSize > 0 ? Math.round((saved / originalSize) * 100) : 0;
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-green-600 ${className ?? ''}`}>
        <ArrowDown size={10} className="shrink-0" />
        <span>
          {formatFileSize(originalSize)} → {formatFileSize(compressedSize)}
          {pct > 0 && <span className="font-semibold"> ({pct}% smaller)</span>}
        </span>
      </span>
    );
  }

  return (
    <span className={`text-[10px] text-gray-400 ${className ?? ''}`}>
      {formatFileSize(originalSize)} · no compression needed
    </span>
  );
}
