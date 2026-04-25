import React, { useEffect, useState } from 'react'

export default function ClickablePhoto({ src, alt = '', className = '' }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <img
        src={src}
        alt={alt}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className={`${className} cursor-zoom-in`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) }
        }}
      />
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-ink-950/95 flex items-center justify-center p-4 animate-fadeUp"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-ink-800/90 border border-ink-700 text-ink-100 active:bg-ink-700 flex items-center justify-center text-3xl leading-none"
          >
            ×
          </button>
        </div>
      )}
    </>
  )
}
