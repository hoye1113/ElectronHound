import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
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
  const { t } = useTranslation();
  const [selectedScreenshot, setSelectedScreenshot] = useState<ScreenshotItem | null>(null);

  if (screenshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-12">
        <p className="text-sm text-zinc-500">{t('screenshotGallery.empty')}</p>
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
            onClick={() => setSelectedScreenshot(screenshot)}
            className="group relative aspect-video overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600"
            aria-label={t('screenshotGallery.viewScreenshot', { step: screenshot.stepIndex + 1, phase: screenshot.phase })}
          >
            <img
              src={screenshot.url}
              alt={`Step ${screenshot.stepIndex + 1} - ${screenshot.phase}`}
              className="size-full object-cover transition-opacity group-hover:opacity-80"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/80 to-transparent p-2">
              <span className="text-xs font-medium text-zinc-300">
                {t('common.stepPrefix')} {screenshot.stepIndex + 1}
              </span>
              <span className="ml-1.5 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {screenshot.phase}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Radix Dialog for large preview */}
      <Dialog.Root open={selectedScreenshot !== null} onOpenChange={(open) => !open && setSelectedScreenshot(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] max-w-[90vw] flex-col items-center -translate-x-1/2 -translate-y-1/2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">{t('screenshotGallery.previewTitle')}</Dialog.Title>

            <Dialog.Close className="absolute -right-3 -top-3 z-10 flex size-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 shadow-lg transition-colors hover:bg-zinc-700 hover:text-zinc-100" aria-label={t('screenshotGallery.closeViewer')}>
              <X className="size-4" />
            </Dialog.Close>

            <div className="relative rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
              {selectedScreenshot && (
                <>
                  <img
                    src={selectedScreenshot.url}
                    alt={`Full size screenshot - Step ${selectedScreenshot.stepIndex + 1}`}
                    className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain"
                  />
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm font-medium text-zinc-300">
                      {t('common.stepPrefix')} {selectedScreenshot.stepIndex + 1}
                    </span>
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                      {selectedScreenshot.phase}
                    </span>
                  </div>
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
