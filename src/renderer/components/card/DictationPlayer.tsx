import { useState, useEffect, useRef, useCallback } from 'react'
import { getEdgeVoices, type EdgeVoice } from '../../lib/edge-tts'

interface Props {
  text: string
  onHighlightWord: (wordIndex: number | null) => void
  onClose: () => void
}

type PlayState = 'idle' | 'playing' | 'paused' | 'loading'
type VoiceMode = 'neural' | 'system'

const FEATURED_VOICES = [
  'en-US-AriaNeural', 'en-US-JennyNeural', 'en-US-GuyNeural',
  'en-US-ChristopherNeural', 'en-US-EmmaNeural',
  'en-GB-SoniaNeural', 'en-GB-RyanNeural',
  'en-AU-NatashaNeural', 'en-AU-WilliamNeural',
]

/* ─── Grouping helpers (function-word attachment + merge rounds) ─── */

const ATTACH_FORWARD = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'by', 'or', 'and', 'but',
  'for', 'nor', 'so', 'yet', 'if', 'as', 'my', 'our', 'his', 'her', 'its',
  'your', 'their', 'this', 'that', 'with', 'from', 'into', 'than',
  'i', "i'm", "i'd", "i'll", "i've",
  "don't", "won't", "can't", "didn't", "isn't", "wasn't", "aren't",
  "couldn't", "shouldn't", "wouldn't", "hasn't", "haven't",
])

function endsPhrase(word: string): boolean {
  return /[.,;:!?\-\u2014)}\]"'\u201D]$/.test(word)
}

function parseWords(text: string): { word: string; startsNewLine: boolean }[] {
  const result: { word: string; startsNewLine: boolean }[] = []
  const lines = text.split(/\n+/)
  for (let li = 0; li < lines.length; li++) {
    const words = lines[li].split(/\s+/).filter(w => w.length > 0)
    for (let wi = 0; wi < words.length; wi++) {
      result.push({ word: words[wi], startsNewLine: li > 0 && wi === 0 })
    }
  }
  return result
}

function isBreakBefore(parsed: { word: string; startsNewLine: boolean }[], i: number): boolean {
  if (i <= 0) return false
  return parsed[i].startsNewLine || endsPhrase(parsed[i - 1].word)
}

type Unit = { wordIndices: number[] }

function buildChunks(
  words: string[],
  parsed: { word: string; startsNewLine: boolean }[],
  wpm: number
): { text: string; wordIndices: number[] }[] {

  // Word-by-word at slow speeds
  if (wpm <= 60) {
    return words.map((w, i) => ({ text: w, wordIndices: [i] }))
  }

  // Sentence mode at high speeds
  if (wpm >= 150) {
    const chunks: { text: string; wordIndices: number[] }[] = []
    let current: { words: string[]; indices: number[] } = { words: [], indices: [] }
    for (let i = 0; i < words.length; i++) {
      if (isBreakBefore(parsed, i) && current.words.length > 0) {
        chunks.push({ text: current.words.join(' '), wordIndices: current.indices })
        current = { words: [], indices: [] }
      }
      current.words.push(words[i])
      current.indices.push(i)
      if (/[.!?]$/.test(words[i])) {
        chunks.push({ text: current.words.join(' '), wordIndices: current.indices })
        current = { words: [], indices: [] }
      }
    }
    if (current.words.length > 0) {
      chunks.push({ text: current.words.join(' '), wordIndices: current.indices })
    }
    return chunks
  }

  // Mid-range: atomic units with merge rounds
  const phrases: number[][] = []
  let currentPhrase: number[] = []
  for (let i = 0; i < words.length; i++) {
    if (isBreakBefore(parsed, i) && currentPhrase.length > 0) {
      phrases.push(currentPhrase); currentPhrase = []
    }
    currentPhrase.push(i)
    if (endsPhrase(words[i])) {
      phrases.push(currentPhrase); currentPhrase = []
    }
  }
  if (currentPhrase.length > 0) phrases.push(currentPhrase)

  const allUnits: { units: Unit[]; phraseBreakAfter: boolean }[] = []

  for (const phrase of phrases) {
    const units: Unit[] = []
    let i = 0
    while (i < phrase.length) {
      const idx = phrase[i]
      const wordLower = words[idx].toLowerCase().replace(/[^a-z']/g, '')
      if (ATTACH_FORWARD.has(wordLower) && i + 1 < phrase.length) {
        const unit: number[] = [idx]
        let j = i + 1
        while (j < phrase.length) {
          unit.push(phrase[j])
          const jLower = words[phrase[j]].toLowerCase().replace(/[^a-z']/g, '')
          if (!ATTACH_FORWARD.has(jLower)) { j++; break }
          j++
        }
        units.push({ wordIndices: unit })
        i = j
      } else {
        units.push({ wordIndices: [idx] })
        i++
      }
    }
    allUnits.push({ units, phraseBreakAfter: true })
  }

  const mergeRounds = Math.max(0, Math.round((wpm - 85) / 18))
  const chunks: { text: string; wordIndices: number[] }[] = []

  for (const { units } of allUnits) {
    let current = units.map(u => ({ ...u }))
    for (let round = 0; round < mergeRounds && current.length > 1; round++) {
      const merged: Unit[] = []
      let i = 0
      while (i < current.length) {
        if (i + 1 < current.length) {
          merged.push({ wordIndices: [...current[i].wordIndices, ...current[i + 1].wordIndices] })
          i += 2
        } else {
          if (merged.length > 0) merged[merged.length - 1].wordIndices.push(...current[i].wordIndices)
          else merged.push(current[i])
          i++
        }
      }
      current = merged
    }
    for (const unit of current) {
      chunks.push({ text: unit.wordIndices.map(i => words[i]).join(' '), wordIndices: unit.wordIndices })
    }
  }

  return chunks
}

/* ─── Timeline types ─── */

interface CachedChunk {
  audioBuffer: AudioBuffer
  duration: number
  wordIndices: number[]
}

/** Precomputed timeline position for each chunk */
interface ChunkTiming {
  timelineStart: number    // when this chunk starts in virtual timeline
  audioDuration: number    // how long the audio plays
  pause: number            // silence after audio
  timelineEnd: number      // timelineStart + audioDuration + pause
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/* ─── Component ─── */

export default function DictationPlayer({ text, onHighlightWord, onClose }: Props) {
  const [wpm, setWpm] = useState(40)
  const [playState, setPlayState] = useState<PlayState>('idle')
  const [currentWordIdx, setCurrentWordIdx] = useState(-1)
  const [volume, setVolume] = useState(1)
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('neural')
  const [loadProgress, setLoadProgress] = useState('')
  const [position, setPosition] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)

  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedSystemVoice, setSelectedSystemVoice] = useState('')
  const [neuralVoices, setNeuralVoices] = useState<EdgeVoice[]>([])
  const [selectedNeuralVoice, setSelectedNeuralVoice] = useState('en-US-AriaNeural')
  const [neuralVoicesError, setNeuralVoicesError] = useState(false)

  const chunksRef = useRef<CachedChunk[]>([])
  const timingsRef = useRef<ChunkTiming[]>([])
  const playGenRef = useRef(0)  // generation counter to invalidate stale onended callbacks
  const audioCtxRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animRef = useRef(0)
  const segStartCtxTimeRef = useRef(0)
  const timelineRef = useRef<HTMLDivElement>(null)

  const wordsRef = useRef<string[]>([])
  const parsedWordsRef = useRef<{ word: string; startsNewLine: boolean }[]>([])
  const playStateRef = useRef<PlayState>('idle')
  const currentWordIdxRef = useRef(-1)
  const currentChunkIdxRef = useRef(0)
  const wpmRef = useRef(wpm)
  const volumeRef = useRef(volume)

  useEffect(() => { wpmRef.current = wpm }, [wpm])
  useEffect(() => { volumeRef.current = volume }, [volume])
  useEffect(() => { if (gainNodeRef.current) gainNodeRef.current.gain.value = volume }, [volume])

  useEffect(() => {
    const parsed = parseWords(text)
    parsedWordsRef.current = parsed
    wordsRef.current = parsed.map(p => p.word)
  }, [text])

  const totalWords = wordsRef.current.length

  // Load system voices
  useEffect(() => {
    const load = () => {
      const v = speechSynthesis.getVoices()
      if (v.length > 0) {
        setSystemVoices(v)
        const eng = v.find(voice => voice.lang.startsWith('en') && voice.default)
          || v.find(voice => voice.lang.startsWith('en')) || v[0]
        if (eng && !selectedSystemVoice) setSelectedSystemVoice(eng.voiceURI)
      }
    }
    load(); speechSynthesis.onvoiceschanged = load
    return () => { speechSynthesis.onvoiceschanged = null }
  }, [])

  // Load neural voices
  useEffect(() => {
    getEdgeVoices().then(v => { setNeuralVoices(v); setNeuralVoicesError(false) })
      .catch(() => { setNeuralVoicesError(true); setVoiceMode('system') })
  }, [])

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
      gainNodeRef.current = audioCtxRef.current.createGain()
      gainNodeRef.current.gain.value = volumeRef.current
      gainNodeRef.current.connect(audioCtxRef.current.destination)
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
    return audioCtxRef.current
  }, [])

  useEffect(() => {
    return () => {
      speechSynthesis.cancel()
      try { sourceRef.current?.stop() } catch {}
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      cancelAnimationFrame(animRef.current)
      audioCtxRef.current?.close()
      onHighlightWord(null)
    }
  }, [])

  // ========== Compute timeline timings from cached chunks ==========

  const computeTimings = useCallback((chunks: CachedChunk[], currentWpm: number): { timings: ChunkTiming[], total: number } => {
    let timelinePos = 0
    const timings: ChunkTiming[] = chunks.map((chunk, i) => {
      const audioDuration = chunk.duration

      let pause: number
      if (currentWpm >= 150) {
        pause = 0.02 // 20ms — TTS handles prosodic pauses
      } else {
        const chunkText = chunk.wordIndices.map(wi => wordsRef.current[wi]).join(' ')
        const standardWords = chunkText.length / 5
        const targetMs = (standardWords / currentWpm) * 60 * 1000
        const actualMs = audioDuration * 1000
        pause = Math.max(0.02, (targetMs - actualMs) / 1000)
      }

      // No pause after the last chunk
      if (i === chunks.length - 1) pause = 0

      const timing: ChunkTiming = {
        timelineStart: timelinePos,
        audioDuration,
        pause,
        timelineEnd: timelinePos + audioDuration + pause
      }
      timelinePos += audioDuration + pause
      return timing
    })

    return { timings, total: timelinePos }
  }, [])

  // ========== NEURAL: synthesize chunks and cache ==========

  // Cache key: voice + text + chunk grouping fingerprint
  const chunkCacheKeyRef = useRef('')

  /** Build a cache key from the chunk texts so we know if grouping changed */
  const makeChunkCacheKey = (voice: string, grouped: { text: string }[]): string =>
    `${voice}|${grouped.map(g => g.text).join('||')}`

  const ensureChunks = useCallback(async (voice: string): Promise<boolean> => {
    const words = wordsRef.current
    if (words.length === 0) return false

    const grouped = buildChunks(words, parsedWordsRef.current, wpmRef.current)
    const cacheKey = makeChunkCacheKey(voice, grouped)

    // If chunks are already synthesized for this exact grouping + voice, just recompute timings
    if (cacheKey === chunkCacheKeyRef.current && chunksRef.current.length > 0) {
      const { timings, total } = computeTimings(chunksRef.current, wpmRef.current)
      timingsRef.current = timings
      setTotalDuration(total)
      return true
    }

    // Need to synthesize
    setPlayState('loading'); playStateRef.current = 'loading'
    setLoadProgress(`Generating... 0/${grouped.length}`)

    const ctx = getAudioCtx()
    const CONCURRENCY = 4
    let done = 0

    const results: (CachedChunk | null)[] = new Array(grouped.length).fill(null)
    const queue = grouped.map((g, i) => ({ ...g, idx: i }))

    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const item = queue.shift()!
        try {
          const result = await window.electronAPI.ttsSynthesize(item.text, voice)
          if (result) {
            const raw = typeof result === 'string' ? result : (result as any).audio || ''
            const binary = atob(raw)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0))
            results[item.idx] = {
              audioBuffer: decoded,
              duration: decoded.duration,
              wordIndices: item.wordIndices
            }
          }
        } catch { /* skip */ }
        done++
        setLoadProgress(`Generating... ${done}/${grouped.length}`)
      }
    })

    await Promise.all(workers)
    setLoadProgress('')

    const chunks: CachedChunk[] = []
    for (const r of results) { if (r) chunks.push(r) }

    chunksRef.current = chunks
    chunkCacheKeyRef.current = cacheKey

    const { timings, total } = computeTimings(chunks, wpmRef.current)
    timingsRef.current = timings
    setTotalDuration(total)

    return chunks.length > 0
  }, [getAudioCtx, computeTimings])

  // ========== NEURAL: play chunk by chunk ==========

  const playChunk = useCallback((chunkIdx: number) => {
    if (playStateRef.current !== 'playing') return
    const chunks = chunksRef.current
    const timings = timingsRef.current
    if (chunkIdx >= chunks.length) {
      setPlayState('idle'); playStateRef.current = 'idle'
      setCurrentWordIdx(-1); currentWordIdxRef.current = -1
      setPosition(totalDuration)
      onHighlightWord(null)
      cancelAnimationFrame(animRef.current)
      return
    }

    const chunk = chunks[chunkIdx]
    const timing = timings[chunkIdx]
    currentChunkIdxRef.current = chunkIdx

    // Highlight the first word
    const firstWord = chunk.wordIndices[0]
    setCurrentWordIdx(firstWord)
    currentWordIdxRef.current = firstWord
    onHighlightWord(firstWord)
    setPosition(timing.timelineStart)

    const ctx = getAudioCtx()
    try { sourceRef.current?.stop() } catch {}
    const gen = ++playGenRef.current  // new generation for this playback
    const source = ctx.createBufferSource()
    source.buffer = chunk.audioBuffer
    source.connect(gainNodeRef.current!)
    source.start()
    sourceRef.current = source
    segStartCtxTimeRef.current = ctx.currentTime

    // Advance word highlights within multi-word chunks
    if (chunk.wordIndices.length > 1) {
      const wordCount = chunk.wordIndices.length
      const perWordMs = (chunk.duration * 1000) / wordCount
      for (let w = 1; w < wordCount; w++) {
        const wordIdx = chunk.wordIndices[w]
        setTimeout(() => {
          if (gen !== playGenRef.current) return  // stale
          if (playStateRef.current === 'playing' && currentChunkIdxRef.current === chunkIdx) {
            setCurrentWordIdx(wordIdx)
            currentWordIdxRef.current = wordIdx
            onHighlightWord(wordIdx)
          }
        }, perWordMs * w)
      }
    }

    source.onended = () => {
      if (gen !== playGenRef.current) return  // stale — we were stopped/skipped
      if (playStateRef.current !== 'playing') return
      const pauseMs = timing.pause * 1000
      if (pauseMs > 5) {
        timeoutRef.current = setTimeout(() => playChunk(chunkIdx + 1), pauseMs)
      } else {
        playChunk(chunkIdx + 1)
      }
    }
  }, [onHighlightWord, getAudioCtx, totalDuration])

  // Animation loop for smooth position tracking
  const tick = useCallback(() => {
    if (playStateRef.current !== 'playing') return
    const timings = timingsRef.current
    const ctx = audioCtxRef.current
    if (!timings.length || !ctx) return

    const chunkIdx = currentChunkIdxRef.current
    const timing = timings[chunkIdx]
    if (timing) {
      const elapsed = ctx.currentTime - segStartCtxTimeRef.current
      const pos = timing.timelineStart + elapsed
      setPosition(Math.min(pos, timingsRef.current[timingsRef.current.length - 1]?.timelineEnd || 0))
    }

    animRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (playState === 'playing') {
      animRef.current = requestAnimationFrame(tick)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [playState, tick])

  // ========== SYSTEM VOICE ==========

  const speakSystemWord = useCallback((wordIdx: number) => {
    if (playStateRef.current !== 'playing') return
    const words = wordsRef.current
    if (wordIdx >= words.length) {
      setPlayState('idle'); playStateRef.current = 'idle'
      setCurrentWordIdx(-1); currentWordIdxRef.current = -1
      onHighlightWord(null); return
    }
    setCurrentWordIdx(wordIdx); currentWordIdxRef.current = wordIdx
    onHighlightWord(wordIdx)
    const utterance = new SpeechSynthesisUtterance(words[wordIdx])
    utterance.rate = 1.0; utterance.volume = volumeRef.current
    const voice = speechSynthesis.getVoices().find(v => v.voiceURI === selectedSystemVoice)
    if (voice) utterance.voice = voice
    const startTime = Date.now()
    utterance.onend = () => {
      if (playStateRef.current !== 'playing') return
      const actualMs = Date.now() - startTime
      const standardWords = words[wordIdx].length / 5
      const targetMs = (standardWords / wpmRef.current) * 60 * 1000
      const pause = Math.max(50, targetMs - actualMs)
      timeoutRef.current = setTimeout(() => speakSystemWord(wordIdx + 1), pause)
    }
    utterance.onerror = () => {
      if (playStateRef.current === 'playing')
        timeoutRef.current = setTimeout(() => speakSystemWord(wordIdx + 1), 200)
    }
    speechSynthesis.speak(utterance)
  }, [onHighlightWord, selectedSystemVoice])

  // ========== TRANSPORT ==========

  const stopSource = useCallback(() => {
    playGenRef.current++  // invalidate any pending onended callbacks
    try { sourceRef.current?.stop() } catch {}
    sourceRef.current = null
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    cancelAnimationFrame(animRef.current)
  }, [])

  const play = useCallback(async () => {
    stopSource(); speechSynthesis.cancel()

    if (voiceMode === 'neural') {
      // Remember which chunk we want to resume from BEFORE regenerating
      const targetChunk = currentChunkIdxRef.current
      const targetWord = currentWordIdxRef.current

      // Ensure chunks are synthesized (uses cache if grouping unchanged)
      const ok = await ensureChunks(selectedNeuralVoice)
      if (!ok) { setPlayState('idle'); playStateRef.current = 'idle'; return }

      // Find the right chunk to start from
      let startChunk = 0
      if (targetWord >= 0 && chunksRef.current.length > 0) {
        const found = chunksRef.current.findIndex(c => c.wordIndices.includes(targetWord))
        if (found >= 0) startChunk = found
        else if (targetChunk > 0 && targetChunk < chunksRef.current.length) startChunk = targetChunk
      }

      setPlayState('playing'); playStateRef.current = 'playing'
      playChunk(startChunk)
    } else {
      if (wordsRef.current.length === 0) return
      const startIdx = currentWordIdxRef.current >= 0 ? currentWordIdxRef.current : 0
      setPlayState('playing'); playStateRef.current = 'playing'
      speakSystemWord(startIdx)
    }
  }, [voiceMode, selectedNeuralVoice, ensureChunks, speakSystemWord, stopSource, playChunk])

  const pause = useCallback(() => {
    stopSource(); speechSynthesis.cancel()
    setPlayState('paused'); playStateRef.current = 'paused'
  }, [stopSource])

  const stop = useCallback(() => {
    stopSource(); speechSynthesis.cancel()
    setPlayState('idle'); playStateRef.current = 'idle'
    setCurrentWordIdx(-1); currentWordIdxRef.current = -1
    currentChunkIdxRef.current = 0
    setPosition(0)
    onHighlightWord(null)
  }, [onHighlightWord, stopSource])

  const skip = useCallback((delta: number) => {
    if (voiceMode === 'neural') {
      const newChunk = Math.max(0, Math.min(chunksRef.current.length - 1, currentChunkIdxRef.current + delta))
      if (playStateRef.current === 'playing') {
        stopSource()
        setPlayState('playing'); playStateRef.current = 'playing'
        playChunk(newChunk)
      } else {
        const chunk = chunksRef.current[newChunk]
        if (chunk) {
          currentChunkIdxRef.current = newChunk
          setCurrentWordIdx(chunk.wordIndices[0])
          currentWordIdxRef.current = chunk.wordIndices[0]
          setPosition(timingsRef.current[newChunk]?.timelineStart || 0)
          onHighlightWord(chunk.wordIndices[0])
        }
      }
    } else {
      const max = wordsRef.current.length - 1
      const cur = currentWordIdxRef.current < 0 ? 0 : currentWordIdxRef.current
      const newIdx = Math.max(0, Math.min(max, cur + delta))
      setCurrentWordIdx(newIdx); currentWordIdxRef.current = newIdx
      if (playStateRef.current === 'playing') {
        stopSource(); speechSynthesis.cancel(); speakSystemWord(newIdx)
      } else { onHighlightWord(newIdx) }
    }
  }, [voiceMode, playChunk, speakSystemWord, onHighlightWord, stopSource])

  // ========== SEEK ==========

  const seekTo = useCallback((timelinePos: number) => {
    const timings = timingsRef.current
    if (!timings.length) return

    const clamped = Math.max(0, Math.min(timelinePos, timings[timings.length - 1]?.timelineEnd || 0))

    // Find chunk at this position
    let chunkIdx = timings.length - 1
    for (let i = 0; i < timings.length; i++) {
      if (timings[i].timelineEnd > clamped) { chunkIdx = i; break }
    }

    setPosition(clamped)

    if (playStateRef.current === 'playing') {
      stopSource()
      setPlayState('playing'); playStateRef.current = 'playing'
      playChunk(chunkIdx)
    } else {
      const chunk = chunksRef.current[chunkIdx]
      if (chunk) {
        currentChunkIdxRef.current = chunkIdx
        setCurrentWordIdx(chunk.wordIndices[0])
        currentWordIdxRef.current = chunk.wordIndices[0]
        onHighlightWord(chunk.wordIndices[0])
      }
    }
  }, [playChunk, stopSource, onHighlightWord])

  // ========== TIMELINE INTERACTION ==========

  const getTimelinePosition = useCallback((e: MouseEvent | React.MouseEvent) => {
    const el = timelineRef.current
    const timings = timingsRef.current
    if (!el || !timings.length) return null
    const rect = el.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return pct * (timings[timings.length - 1]?.timelineEnd || 0)
  }, [])

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    if (!timingsRef.current.length) return
    e.preventDefault()

    const wasPlaying = playStateRef.current === 'playing'
    if (wasPlaying) { stopSource(); setPlayState('paused'); playStateRef.current = 'paused' }

    const doPreview = (ev: MouseEvent | React.MouseEvent) => {
      const pos = getTimelinePosition(ev)
      if (pos === null) return
      setPosition(pos)
      // Update highlight
      const timings = timingsRef.current
      let chunkIdx = timings.length - 1
      for (let i = 0; i < timings.length; i++) {
        if (timings[i].timelineEnd > pos) { chunkIdx = i; break }
      }
      const chunk = chunksRef.current[chunkIdx]
      if (chunk) {
        currentChunkIdxRef.current = chunkIdx
        setCurrentWordIdx(chunk.wordIndices[0])
        currentWordIdxRef.current = chunk.wordIndices[0]
        onHighlightWord(chunk.wordIndices[0])
      }
    }

    doPreview(e)

    const onMove = (ev: MouseEvent) => doPreview(ev)
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const pos = getTimelinePosition(ev)
      if (pos !== null && wasPlaying) seekTo(pos)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [stopSource, getTimelinePosition, seekTo, onHighlightWord])

  // Voice change clears cache
  const handleNeuralVoiceChange = useCallback((v: string) => {
    setSelectedNeuralVoice(v); chunksRef.current = []; timingsRef.current = []; chunkCacheKeyRef.current = ''
  }, [])

  // ========== RENDER ==========

  const progress = totalDuration > 0 ? (position / totalDuration) * 100 : 0
  const currentWord = wordsRef.current[currentWordIdx] || ''
  const isLoading = playState === 'loading'
  const wpmPresets = [20, 40, 60, 80, 100, 150]

  const getSpeedLabel = (): string => {
    if (wpm >= 150) return 'Continuous'
    if (wpm >= 120) return 'Fluent'
    if (wpm >= 80) return 'Phrased'
    if (wpm >= 50) return 'Slow'
    return 'Word-by-word'
  }

  const sortedNeuralVoices = [...neuralVoices].sort((a, b) => {
    const aF = FEATURED_VOICES.indexOf(a.ShortName), bF = FEATURED_VOICES.indexOf(b.ShortName)
    if (aF !== -1 && bF !== -1) return aF - bF
    if (aF !== -1) return -1; if (bF !== -1) return 1
    return a.Locale.localeCompare(b.Locale)
  })
  const englishNeuralVoices = sortedNeuralVoices.filter(v => v.Locale.startsWith('en'))
  const otherNeuralVoices = sortedNeuralVoices.filter(v => !v.Locale.startsWith('en'))

  return (
    <div className="flex flex-col gap-2 px-3 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-b border-gray-200 dark:border-gray-700 shrink-0">
      {/* Row 1: Transport + word display */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={stop} disabled={isLoading} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-40" title="Stop">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="1" /></svg>
          </button>
          <button onClick={() => skip(-1)} disabled={isLoading} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-40" title="Previous">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><path d="M3 3h2v10H3V3zm3 5l7 5V3L6 8z" /></svg>
          </button>
          {playState === 'playing' ? (
            <button onClick={pause} className="p-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white" title="Pause">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M4 2h3v12H4V2zm5 0h3v12H9V2z" /></svg>
            </button>
          ) : isLoading ? (
            <button disabled className="p-1.5 rounded-full bg-indigo-400 text-white">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" />
              </svg>
            </button>
          ) : (
            <button onClick={play} className="p-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white" title="Play">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M4 2l10 6-10 6V2z" /></svg>
            </button>
          )}
          <button onClick={() => skip(1)} disabled={isLoading} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-40" title="Next">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><path d="M11 3h2v10h-2V3zm-1 5L3 13V3l7 5z" /></svg>
          </button>
        </div>
        <div className="flex-1 text-center">
          {isLoading ? (
            <span className="text-[10px] text-indigo-500 dark:text-indigo-400">{loadProgress}</span>
          ) : (
            <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">
              {currentWordIdx >= 0 ? currentWord : 'Ready'}
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 tabular-nums">{currentWordIdx >= 0 ? currentWordIdx + 1 : 0}/{totalWords}</span>
        <button onClick={() => { stop(); onClose() }} title="Close"
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>

      {/* Row 2: Timeline with scrubbing and time display */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums w-8 text-right select-none">
          {formatTime(position)}
        </span>
        <div
          ref={timelineRef}
          className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer relative group"
          onMouseDown={handleTimelineMouseDown}
        >
          <div
            className="h-full bg-indigo-500 rounded-full pointer-events-none"
            style={{ width: `${Math.min(100, progress)}%`, transition: 'none' }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full shadow-sm pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${Math.min(100, progress)}% - 6px)` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums w-8 select-none">
          {formatTime(totalDuration)}
        </span>
      </div>

      {/* Row 3: WPM + voice controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium w-8">WPM</span>
          <input type="range" min="10" max="200" step="5" value={wpm}
            onChange={e => setWpm(Number(e.target.value))} className="w-20 h-1 accent-indigo-600" />
          <span className="text-[10px] text-gray-600 dark:text-gray-300 font-mono w-6 text-right">{wpm}</span>
        </div>
        <div className="flex gap-0.5">
          {wpmPresets.map(p => (
            <button key={p} onClick={() => setWpm(p)}
              className={`px-1.5 py-0.5 text-[9px] rounded ${wpm === p ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
              {p}
            </button>
          ))}
        </div>
        <span className="text-[9px] text-gray-400 dark:text-gray-500 italic">
          {getSpeedLabel()}
        </span>
        <span className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
        <div className="flex rounded overflow-hidden border border-gray-300 dark:border-gray-600">
          <button onClick={() => setVoiceMode('neural')} disabled={neuralVoicesError}
            className={`px-2 py-0.5 text-[9px] font-medium ${voiceMode === 'neural' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'} ${neuralVoicesError ? 'opacity-40' : ''}`}>
            Neural
          </button>
          <button onClick={() => setVoiceMode('system')}
            className={`px-2 py-0.5 text-[9px] font-medium ${voiceMode === 'system' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            System
          </button>
        </div>
        {voiceMode === 'neural' ? (
          <select value={selectedNeuralVoice} onChange={e => handleNeuralVoiceChange(e.target.value)}
            className="text-[10px] px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 max-w-[200px]">
            <optgroup label="English">
              {englishNeuralVoices.map(v => (
                <option key={v.ShortName} value={v.ShortName}>
                  {FEATURED_VOICES.includes(v.ShortName) ? '\u2605 ' : ''}{v.FriendlyName || v.ShortName}
                </option>
              ))}
            </optgroup>
            <optgroup label="Other Languages">
              {otherNeuralVoices.map(v => (
                <option key={v.ShortName} value={v.ShortName}>{v.FriendlyName || v.ShortName}</option>
              ))}
            </optgroup>
          </select>
        ) : (
          <select value={selectedSystemVoice} onChange={e => setSelectedSystemVoice(e.target.value)}
            className="text-[10px] px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 max-w-[200px]">
            {systemVoices.map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 16 16">
            <path d="M8 2L4 6H1v4h3l4 4V2z" fill="currentColor" />
            <path d="M10.5 5.5a3.5 3.5 0 010 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input type="range" min="0" max="1" step="0.1" value={volume}
            onChange={e => setVolume(Number(e.target.value))} className="w-12 h-1 accent-indigo-600" />
        </div>
      </div>
    </div>
  )
}
