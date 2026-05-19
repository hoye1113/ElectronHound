import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface ScreenshotItem {
  url: string;
  stepIndex: number;
  phase: string;
}

interface ScreenshotGalleryProps {
  screenshots: ScreenshotItem[];
}

export default function ScreenshotGallery({ screenshots }: ScreenshotGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleClose = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIndex !== null) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, handleClose]);

  if (screenshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-12">
        <p className="text-sm text-zinc-500">No screenshots available</p>
      </div>
    );
  }

  return (
    <>
      {/* Thumbnail grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {screenshots.map((screenshot, index) => (
          <button
            key={index}
            onClick={() => setSelectedIndex(index)}
            className="group relative aspect-video overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600"
            aria-label={`View screenshot from step ${screenshot.stepIndex + 1} (${screenshot.phase} phase)`}
          >
            <img
              src={screenshot.url}
              alt={`Step ${screenshot.stepIndex + 1} - ${screenshot.phase}`}
              className="size-full object-cover transition-opacity group-hover:opacity-80"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/80 to-transparent p-2">
              <span className="text-xs font-medium text-zinc-300">
                Step {screenshot.stepIndex + 1}
              </span>
              <span className="ml-1.5 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {screenshot.phase}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Overlay */}
      {selectedIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot viewer"
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleClose}
              className="absolute -right-3 -top-3 flex size-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 shadow-lg transition-colors hover:bg-zinc-700 hover:text-zinc-100"
              aria-label="Close screenshot viewer"
            >
              <X className="size-4" />
            </button>
            <img
              src={screenshots[selectedIndex].url}
              alt={`Full size screenshot - Step ${screenshots[selectedIndex].stepIndex + 1}`}
              className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain"
            />
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-sm font-medium text-zinc-300">
                Step {screenshots[selectedIndex].stepIndex + 1}
              </span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                {screenshots[selectedIndex].phase}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
