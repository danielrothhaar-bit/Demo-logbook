import React from 'react'

export default function MicButton({ sr, label, size = 'md' }) {
  if (!sr.supported) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          disabled
          className="w-28 h-28 rounded-full bg-ink-800 border border-ink-700 text-ink-500 flex items-center justify-center"
        >
          <MicIcon size={48} />
        </button>
        <div className="text-xs text-ink-400 text-center max-w-[18rem]">
          Voice input not supported in this browser. Try Chrome or Safari, or type below.
        </div>
      </div>
    )
  }

  const status = sr.error
    ? sr.error === 'not-allowed' ? 'Mic permission denied — enable in browser settings.'
                                 : `Voice error: ${sr.error}`
    : sr.needsTapAgain ? 'Tap mic to keep listening (iOS limitation)'
    : sr.isListening   ? (label?.listening || 'Listening… tap to save')
    :                    (label?.idle || 'Tap to record voice note')

  const dim = size === 'lg' ? 'w-32 h-32' : 'w-28 h-28'
  const iconSize = size === 'lg' ? 56 : 48

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <button
        onClick={sr.onTap}
        className={`relative ${dim} rounded-full flex items-center justify-center transition-transform active:scale-95 border-2
          ${sr.isListening
            ? 'bg-accent-500 border-accent-400 text-ink-50 animate-pulseRing'
            : sr.needsTapAgain
              ? 'bg-rose-400 border-rose-300 text-ink-950'
              : 'bg-ink-800 border-ink-600 text-ink-100 active:bg-ink-700'}`}
        aria-label={sr.isListening ? 'Stop recording' : 'Start voice note'}
      >
        <MicIcon size={iconSize} />
      </button>
      <div className={`text-sm text-center min-h-[1.25rem] ${sr.error ? 'text-rose-300' : 'text-ink-300'}`}>
        {status}
      </div>
    </div>
  )
}

function MicIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  )
}
