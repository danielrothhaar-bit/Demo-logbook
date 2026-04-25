import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Web Speech API hook with explicit handling for the API's quirks:
 *  - Chrome/Android: continuous mode often stops on silence — auto-restart while user wants to listen.
 *  - iOS Safari: continuous is unreliable; we use single-utterance mode and surface a "Tap again" hint.
 *  - Some errors (no-speech, aborted) are recoverable → restart silently.
 *  - Other errors (not-allowed, service-not-allowed, audio-capture) are surfaced as fatal.
 */
export function useSpeechRecognition({ lang = 'en-US' } = {}) {
  const SpeechRecognition =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)

  const isIOS = typeof navigator !== 'undefined' &&
    /iP(ad|hone|od)/.test(navigator.userAgent) &&
    !/CriOS|FxiOS/.test(navigator.userAgent)

  const supported = !!SpeechRecognition
  const recognitionRef = useRef(null)
  const wantListeningRef = useRef(false)
  const finalRef = useRef('')

  const [isListening, setIsListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [error, setError] = useState(null)
  const [needsTapAgain, setNeedsTapAgain] = useState(false)

  // Build/rebuild the recognition instance
  const buildInstance = useCallback(() => {
    if (!SpeechRecognition) return null
    const rec = new SpeechRecognition()
    rec.lang = lang
    rec.interimResults = true
    // iOS Safari handles continuous=true poorly — single utterance, restart on demand
    rec.continuous = !isIOS
    rec.maxAlternatives = 1

    rec.onresult = (event) => {
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript
        if (result.isFinal) {
          finalRef.current = (finalRef.current + ' ' + transcript).replace(/\s+/g, ' ').trim()
          setFinalTranscript(finalRef.current)
        } else {
          interimText += transcript
        }
      }
      setInterim(interimText)
    }

    rec.onerror = (event) => {
      // Recoverable errors → just let onend handle the restart
      const recoverable = ['no-speech', 'aborted', 'network']
      if (recoverable.includes(event.error)) {
        return
      }
      setError(event.error)
      wantListeningRef.current = false
      setIsListening(false)
    }

    rec.onend = () => {
      setInterim('')
      // Auto-restart if user still wants to listen and we're not on iOS
      if (wantListeningRef.current) {
        if (isIOS) {
          // iOS won't reliably auto-restart from onend — surface tap hint
          setNeedsTapAgain(true)
          setIsListening(false)
        } else {
          try {
            rec.start()
          } catch (e) {
            // Some browsers throw if start() is called too soon
            setTimeout(() => {
              if (wantListeningRef.current) {
                try { rec.start() } catch { /* give up silently */ }
              }
            }, 250)
          }
        }
      } else {
        setIsListening(false)
      }
    }

    rec.onstart = () => {
      setNeedsTapAgain(false)
      setIsListening(true)
    }

    return rec
  }, [SpeechRecognition, isIOS, lang])

  const start = useCallback(() => {
    if (!supported) {
      setError('not-supported')
      return
    }
    setError(null)
    finalRef.current = ''
    setFinalTranscript('')
    setInterim('')
    setNeedsTapAgain(false)
    wantListeningRef.current = true

    if (!recognitionRef.current) {
      recognitionRef.current = buildInstance()
    }
    try {
      recognitionRef.current.start()
    } catch (e) {
      // start() throws if already started — stop and retry
      try { recognitionRef.current.stop() } catch {}
      setTimeout(() => {
        try { recognitionRef.current.start() } catch (err) { setError(err?.message || 'start-failed') }
      }, 150)
    }
  }, [supported, buildInstance])

  // For iOS: continue an existing session (preserve previously captured text)
  const resume = useCallback(() => {
    if (!supported) return
    wantListeningRef.current = true
    if (!recognitionRef.current) recognitionRef.current = buildInstance()
    try {
      recognitionRef.current.start()
      setNeedsTapAgain(false)
    } catch {
      setTimeout(() => {
        try { recognitionRef.current.start() } catch (err) { setError(err?.message || 'resume-failed') }
      }, 150)
    }
  }, [supported, buildInstance])

  const stop = useCallback(() => {
    wantListeningRef.current = false
    setNeedsTapAgain(false)
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
    setIsListening(false)
  }, [])

  const reset = useCallback(() => {
    finalRef.current = ''
    setFinalTranscript('')
    setInterim('')
    setError(null)
    setNeedsTapAgain(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wantListeningRef.current = false
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch {}
      }
    }
  }, [])

  return {
    supported,
    isIOS,
    isListening,
    interim,
    finalTranscript,
    error,
    needsTapAgain,
    start,
    stop,
    resume,
    reset
  }
}
