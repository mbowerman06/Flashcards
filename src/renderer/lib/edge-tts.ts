/**
 * Edge TTS client — renderer side. Talks to main process via IPC.
 */

export interface EdgeVoice {
  Name: string
  ShortName: string
  Gender: string
  Locale: string
  FriendlyName: string
}

export interface WordBoundary {
  text: string
  offset: number
  duration: number
}

let voiceCache: EdgeVoice[] | null = null

export async function getEdgeVoices(): Promise<EdgeVoice[]> {
  if (voiceCache) return voiceCache
  const voices = await window.electronAPI.ttsGetVoices()
  if (voices && voices.length > 0) {
    voiceCache = voices
    return voices
  }
  throw new Error('No neural voices available')
}
