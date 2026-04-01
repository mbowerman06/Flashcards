/**
 * Microsoft Edge TTS — main process implementation.
 * Synthesizes full text with word boundary metadata for natural prosody.
 */
import WebSocket from 'ws'
import https from 'https'
import crypto from 'crypto'

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const CHROMIUM_VERSION = '143.0.3650.75'
const VOICE_LIST_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`
const SYNTH_BASE = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const CHROME_MAJOR = CHROMIUM_VERSION.split('.')[0]
const UA = process.platform === 'darwin'
  ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROME_MAJOR}.0.0.0`
  : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROME_MAJOR}.0.0.0`
const WIN_EPOCH = 11644473600

export interface EdgeVoice {
  Name: string
  ShortName: string
  Gender: string
  Locale: string
  FriendlyName: string
}

export interface WordBoundary {
  text: string
  offset: number   // seconds into the audio
  duration: number  // seconds
}

export interface SynthResult {
  audio: Buffer
  words: WordBoundary[]
}

let voiceCache: EdgeVoice[] | null = null
let clockSkew = 0
const muid = crypto.randomBytes(16).toString('hex').toUpperCase()

function generateSecMsGec(): string {
  let ticks = Math.floor(Date.now() / 1000) + clockSkew + WIN_EPOCH
  ticks -= ticks % 300
  ticks *= 1e7
  return crypto.createHash('sha256').update(`${ticks}${TRUSTED_CLIENT_TOKEN}`, 'ascii').digest('hex').toUpperCase()
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': UA } }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => res.statusCode! < 300 ? resolve(data) : reject(new Error(`HTTP ${res.statusCode}`)))
    }).on('error', reject).setTimeout(10000, function() { this.destroy(); reject(new Error('Timeout')) })
  })
}

export async function getVoices(): Promise<EdgeVoice[]> {
  if (voiceCache) return voiceCache
  voiceCache = JSON.parse(await httpsGet(VOICE_LIST_URL))
  return voiceCache!
}

function escapeXml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function randomHex(n: number): string { return crypto.randomBytes(n).toString('hex') }

/** Synthesize full text with word boundary metadata.
 *  rate: SSML prosody rate string, e.g. '+0%', '-50%', '+30%', 'slow', 'x-slow' */
export async function synthesize(text: string, voice: string = 'en-US-AriaNeural', rate: string = '+0%'): Promise<SynthResult> {
  try {
    return await doSynthesize(text, voice, rate)
  } catch (err: any) {
    if (err?.statusCode === 403 && err?.serverDate) {
      clockSkew = Math.floor(new Date(err.serverDate).getTime() / 1000) - Math.floor(Date.now() / 1000)
      return doSynthesize(text, voice, rate)
    }
    throw err
  }
}

function doSynthesize(text: string, voice: string, rate: string): Promise<SynthResult> {
  return new Promise((resolve, reject) => {
    const connId = randomHex(16)
    const gec = generateSecMsGec()
    const url = `${SYNTH_BASE}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connId}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-${CHROMIUM_VERSION}`

    const ws = new WebSocket(url, {
      headers: {
        'Pragma': 'no-cache', 'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': UA,
        'Cookie': `muid=${muid};`
      }
    })

    const audioChunks: Buffer[] = []
    const words: WordBoundary[] = []
    let resolved = false

    ws.on('open', () => {
      // Enable word boundary metadata
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
              }
            }
          }
        })
      )

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'>` +
        `<prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody>` +
        `</voice></speak>`
      ws.send(`X-RequestId:${randomHex(16)}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`)
    })

    ws.on('message', (data: Buffer | string, isBinary: boolean) => {
      if (isBinary && Buffer.isBuffer(data)) {
        const headerLen = data.readUInt16BE(0)
        const audio = data.subarray(2 + headerLen)
        if (audio.length > 0) audioChunks.push(audio)
      } else {
        const msg = data.toString()
        if (msg.includes('Path:audio.metadata')) {
          // Parse word boundary metadata
          try {
            const jsonStart = msg.indexOf('{')
            if (jsonStart >= 0) {
              const meta = JSON.parse(msg.substring(jsonStart))
              for (const item of meta.Metadata || []) {
                if (item.Type === 'WordBoundary' && item.Data?.text?.Text) {
                  words.push({
                    text: item.Data.text.Text,
                    offset: item.Data.Offset / 1e7,   // 100ns units → seconds
                    duration: item.Data.Duration / 1e7
                  })
                }
              }
            }
          } catch { /* ignore parse errors */ }
        }
        if (msg.includes('Path:turn.end')) {
          resolved = true
          ws.close()
          resolve({ audio: Buffer.concat(audioChunks), words })
        }
      }
    })

    ws.on('error', (err) => { if (!resolved) reject(new Error(`Edge TTS error: ${err.message}`)) })
    ws.on('close', () => { if (!resolved) reject(new Error('Edge TTS closed')) })
    ws.on('unexpected-response', (_req, res) => {
      let body = ''
      res.on('data', (c: Buffer) => { body += c })
      res.on('end', () => {
        if (!resolved) {
          const err: any = new Error(`Edge TTS HTTP ${res.statusCode}`)
          err.statusCode = res.statusCode
          err.serverDate = res.headers['date']
          reject(err)
        }
      })
    })

    setTimeout(() => { if (!resolved) { ws.close(); reject(new Error('Edge TTS timeout')) } }, 30000)
  })
}
