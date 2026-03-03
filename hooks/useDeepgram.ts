'use client'

import { useCallback, useRef, useState } from 'react'
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'

type DeepgramConnection = ReturnType<ReturnType<typeof createClient>['listen']['live']>

export function useDeepgram(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [liveText, setLiveText] = useState('')
  const connectionRef = useRef<DeepgramConnection | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const start = useCallback(async () => {
    if (isListening) return

    // Fetch a short-lived token from our server
    const tokenRes = await fetch('/api/deepgram-token')
    const { key } = await tokenRes.json()

    const deepgram = createClient(key)
    const conn = deepgram.listen.live({
      model: 'nova-3',
      language: 'en',
      smart_format: true,
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
    })

    conn.on(LiveTranscriptionEvents.Open, async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream

        // Use AudioContext to downsample to 16kHz PCM
        const audioCtx = new AudioContext({ sampleRate: 16000 })
        const source = audioCtx.createMediaStreamSource(stream)
        await audioCtx.audioWorklet.addModule(
          URL.createObjectURL(
            new Blob(
              [
                `registerProcessor('pcm-processor', class extends AudioWorkletProcessor {
                  process(inputs) {
                    const ch = inputs[0][0]
                    if (ch) {
                      const pcm = new Int16Array(ch.length)
                      for (let i = 0; i < ch.length; i++) {
                        pcm[i] = Math.max(-32768, Math.min(32767, ch[i] * 32768))
                      }
                      this.port.postMessage(pcm.buffer, [pcm.buffer])
                    }
                    return true
                  }
                })`,
              ],
              { type: 'application/javascript' },
            ),
          ),
        )

        const worklet = new AudioWorkletNode(audioCtx, 'pcm-processor')
        worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          if (conn.getReadyState() === 1) {
            conn.send(e.data)
          }
        }
        source.connect(worklet)
        setIsListening(true)
      } catch (err) {
        console.error('[Deepgram] mic access failed:', err)
        conn.finish()
      }
    })

    conn.on(LiveTranscriptionEvents.Transcript, (data) => {
      const alt = data.channel?.alternatives?.[0]
      if (!alt) return
      const transcript = alt.transcript ?? ''

      if (data.is_final && transcript.trim()) {
        setLiveText('')
        onTranscript(transcript.trim())
      } else if (transcript.trim()) {
        setLiveText(transcript)
      }
    })

    conn.on(LiveTranscriptionEvents.Close, () => {
      setIsListening(false)
      setLiveText('')
    })

    conn.on(LiveTranscriptionEvents.Error, (err) => {
      console.error('[Deepgram] error:', err)
      stop()
    })

    connectionRef.current = conn
  }, [isListening, onTranscript])

  const stop = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    connectionRef.current?.finish()
    connectionRef.current = null
    setIsListening(false)
    setLiveText('')
  }, [])

  return { isListening, liveText, start, stop }
}
