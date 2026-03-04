"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Textarea } from "@/components/ui/textarea"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Plus, SendHorizontal, Globe, Paperclip, X, Mic, Square } from "lucide-react"
import { cn } from "@/lib/utils"

export type ChatInputSendPayload = {
  text: string
  files: File[]
}

const ACCEPTED_CHAT_ATTACHMENTS = "image/*,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.yaml,.yml,.log,.html,.htm,.css,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.hpp,.rs,.go,.sql,.sh,.ps1"
const PREFERRED_RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
]

type SpeechRecognitionAlternativeLike = {
  transcript: string
}

type SpeechRecognitionResultLike = {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

type SpeechRecognitionEventLike = Event & {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionErrorEventLike = Event & {
  error?: string
}

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event) => void) | null
  onend: ((event: Event) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

type BrowserWindowWithSpeechRecognition = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
}

function resolveSpeechError(errorCode?: string): string {
  switch (errorCode) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission is blocked for this site."
    case "audio-capture":
      return "No microphone was detected."
    case "network":
      return "Speech recognition service is unavailable right now."
    case "no-speech":
      return "No speech was detected. Try speaking a bit louder."
    default:
      return "Unable to start voice input."
  }
}

function resolveTranscriptionError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return "Transcription failed. Please try again."
}

function chooseRecorderMimeType(recorderConstructor: typeof MediaRecorder): string | undefined {
  if (typeof recorderConstructor.isTypeSupported !== "function") {
    return undefined
  }
  return PREFERRED_RECORDER_MIME_TYPES.find((mimeType) => recorderConstructor.isTypeSupported(mimeType))
}

type ChatInputProps = {
  onSend: (payload: ChatInputSendPayload) => void
  isLoading?: boolean
  webSearch: boolean
  onWebSearchChange: (enabled: boolean) => void
  searchAvailable: boolean
}

export function ChatInput({ onSend, isLoading, webSearch, onWebSearchChange, searchAvailable }: ChatInputProps) {
  const [value, setValue] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [toolsOpen, setToolsOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingModeRef = useRef<"speech-api" | "media-recorder" | null>(null)
  const speechBaseTextRef = useRef("")
  const speechFinalTextRef = useRef("")
  const acceptSpeechResultsRef = useRef(false)
  const acceptTranscriptionResultsRef = useRef(false)

  const hasInput = value.trim().length > 0 || files.length > 0
  const iconButtonClass = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"

  const buildSpeechText = useCallback((baseText: string, spokenText: string) => {
    const trimmedBase = baseText.trim()
    const trimmedSpoken = spokenText.trim()
    if (!trimmedBase) return trimmedSpoken
    if (!trimmedSpoken) return trimmedBase
    return `${trimmedBase} ${trimmedSpoken}`
  }, [])

  const stopMediaStream = useCallback(() => {
    const stream = mediaStreamRef.current
    if (!stream) {
      return
    }
    stream.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null
  }, [])

  const ensureRecognition = useCallback(() => {
    if (recognitionRef.current) {
      return recognitionRef.current
    }

    const browserWindow = window as BrowserWindowWithSpeechRecognition
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition
    if (!Recognition) {
      return null
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || "en-US"

    recognition.onresult = (event) => {
      if (!acceptSpeechResultsRef.current) {
        return
      }

      let interimText = ""
      let finalText = speechFinalTextRef.current
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const transcript = result[0]?.transcript ?? ""
        if (result.isFinal) {
          finalText += `${transcript} `
        } else {
          interimText += transcript
        }
      }
      speechFinalTextRef.current = finalText
      setValue(buildSpeechText(speechBaseTextRef.current, `${finalText}${interimText}`))
    }

    recognition.onerror = (event) => {
      const errorEvent = event as SpeechRecognitionErrorEventLike
      setSpeechError(resolveSpeechError(errorEvent.error))
      setIsRecording(false)
      recordingModeRef.current = null
    }

    recognition.onend = () => {
      setIsRecording(false)
      recordingModeRef.current = null
    }

    recognitionRef.current = recognition
    return recognition
  }, [buildSpeechText])

  const transcribeAudioBlob = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size === 0) {
      setSpeechError("No audio was captured. Try recording again.")
      return
    }

    setIsTranscribing(true)
    try {
      const extension = audioBlob.type.includes("ogg")
        ? "ogg"
        : audioBlob.type.includes("mp4")
          ? "mp4"
          : "webm"
      const formData = new FormData()
      formData.append("audio", audioBlob, `recording.${extension}`)
      const response = await fetch("/api/speech/transcribe", {
        method: "POST",
        body: formData,
      })

      const payload = await response.json().catch(() => null) as { text?: unknown; error?: unknown } | null
      if (!response.ok) {
        const message = typeof payload?.error === "string" ? payload.error : "Transcription failed. Configure Groq or OpenAI in Settings."
        throw new Error(message)
      }

      const transcript = typeof payload?.text === "string" ? payload.text.trim() : ""
      if (!transcript) {
        setSpeechError("No speech detected in the recording.")
        return
      }

      if (!acceptTranscriptionResultsRef.current) {
        return
      }

      setValue(buildSpeechText(speechBaseTextRef.current, transcript))
    } catch (error) {
      setSpeechError(resolveTranscriptionError(error))
    } finally {
      setIsTranscribing(false)
    }
  }, [buildSpeechText])

  const startMediaRecorder = useCallback(async () => {
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setSpeechError("Microphone access requires HTTPS.")
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined") {
      setSpeechError("Speech-to-text is not supported in this browser.")
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setSpeechError("Microphone permission was denied.")
      return
    }

    const recorderConstructor = window.MediaRecorder
    const mimeType = chooseRecorderMimeType(recorderConstructor)
    let recorder: MediaRecorder

    try {
      recorder = mimeType
        ? new recorderConstructor(stream, { mimeType })
        : new recorderConstructor(stream)
    } catch {
      stream.getTracks().forEach(track => track.stop())
      setSpeechError("Unable to start recording with this browser.")
      return
    }

    speechBaseTextRef.current = value
    speechFinalTextRef.current = ""
    acceptSpeechResultsRef.current = false
    acceptTranscriptionResultsRef.current = true
    recordedChunksRef.current = []
    mediaStreamRef.current = stream
    mediaRecorderRef.current = recorder
    recordingModeRef.current = "media-recorder"

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data)
      }
    }

    recorder.onerror = () => {
      setSpeechError("Recording failed. Please try again.")
      setIsRecording(false)
      recordingModeRef.current = null
      mediaRecorderRef.current = null
      recordedChunksRef.current = []
      stopMediaStream()
    }

    recorder.onstop = () => {
      const shouldTranscribe = acceptTranscriptionResultsRef.current
      const chunks = recordedChunksRef.current
      recordedChunksRef.current = []

      setIsRecording(false)
      recordingModeRef.current = null
      mediaRecorderRef.current = null
      stopMediaStream()

      if (!shouldTranscribe) {
        return
      }

      const blobType = recorder.mimeType || "audio/webm"
      const audioBlob = new Blob(chunks, { type: blobType })
      void transcribeAudioBlob(audioBlob)
    }

    recorder.start()
    setIsRecording(true)
  }, [stopMediaStream, transcribeAudioBlob, value])

  useEffect(() => {
    return () => {
      acceptSpeechResultsRef.current = false
      acceptTranscriptionResultsRef.current = false

      const recognition = recognitionRef.current
      if (recognition) {
        recognition.onresult = null
        recognition.onerror = null
        recognition.onend = null
        recognition.abort()
      }
      recognitionRef.current = null

      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== "inactive") {
        recorder.stop()
      }
      mediaRecorderRef.current = null
      stopMediaStream()
    }
  }, [stopMediaStream])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if ((!trimmed && files.length === 0) || isLoading || isTranscribing) return

    setSpeechError(null)
    acceptSpeechResultsRef.current = false
    acceptTranscriptionResultsRef.current = false
    recognitionRef.current?.stop()

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== "inactive") {
      recorder.stop()
    }

    recordingModeRef.current = null
    setIsRecording(false)
    onSend({ text: trimmed, files })
    setValue("")
    setFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, files, isLoading, isTranscribing, onSend])

  const handleMicClick = () => {
    if (isLoading || isTranscribing) {
      return
    }

    setSpeechError(null)

    if (isRecording) {
      if (recordingModeRef.current === "media-recorder") {
        const recorder = mediaRecorderRef.current
        if (recorder && recorder.state !== "inactive") {
          recorder.stop()
        } else {
          setIsRecording(false)
          recordingModeRef.current = null
        }
        return
      }

      acceptSpeechResultsRef.current = false
      recognitionRef.current?.stop()
      setIsRecording(false)
      recordingModeRef.current = null
      return
    }

    const recognition = ensureRecognition()
    if (recognition) {
      speechBaseTextRef.current = value
      speechFinalTextRef.current = ""
      acceptSpeechResultsRef.current = true
      acceptTranscriptionResultsRef.current = false
      recordingModeRef.current = "speech-api"

      try {
        recognition.start()
        setIsRecording(true)
      } catch {
        setSpeechError("Unable to start recording. Check microphone permissions for this site.")
        setIsRecording(false)
        recordingModeRef.current = null
      }
      return
    }

    void startMediaRecorder()
  }

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = event.target.files
    if (!incoming || incoming.length === 0) return

    const selectedFiles = Array.from(incoming)
    setFiles((current) => {
      const seen = new Set(current.map(file => `${file.name}-${file.size}-${file.lastModified}`))
      const next = [...current]

      for (const file of selectedFiles) {
        const key = `${file.name}-${file.size}-${file.lastModified}`
        if (!seen.has(key)) {
          seen.add(key)
          next.push(file)
        }
      }

      return next
    })

    event.target.value = ""
  }

  const handleRemoveFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
    setToolsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget
    target.style.height = "auto"
    target.style.height = `${target.scrollHeight}px`
  }

  return (
    <div className="sticky bottom-0 z-20 shrink-0 px-2 pb-3 pt-2 safe-area-bottom bg-gradient-to-t from-background via-background/95 to-transparent backdrop-blur-sm sm:px-4 sm:pb-4">
      <div className="mx-auto w-full max-w-4xl">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept={ACCEPTED_CHAT_ATTACHMENTS}
          onChange={handleFilesSelected}
        />

        {files.length > 0 ? (
          <div className="mb-2 rounded-xl border border-border/50 bg-background/65 p-2">
            <div className="flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <span
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs text-foreground/90"
                >
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span className="max-w-[180px] truncate">{file.name}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => handleRemoveFile(index)}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-end gap-2 rounded-[1.35rem] border border-border/50 bg-background/80 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/65">
          <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  iconButtonClass,
                  toolsOpen && "bg-foreground/5 text-foreground"
                )}
                aria-label="Open tools"
              >
                <Plus className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 p-3">
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Tools</p>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={handleUploadClick}
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  Upload Files
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground sm:hidden"
                  onClick={handleMicClick}
                  disabled={isLoading || isTranscribing}
                  aria-label={isRecording ? "Stop voice input" : "Start voice input"}
                >
                  {isRecording ? <Square className="h-4 w-4 text-primary" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
                  {isRecording ? "Stop Listening" : "Speech to Text"}
                </button>
                {searchAvailable ? (
                  <div className="flex items-center justify-between rounded-md px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="web-search" className="cursor-pointer text-sm">Web Search</Label>
                    </div>
                    <Switch
                      id="web-search"
                      checked={webSearch}
                      onCheckedChange={onWebSearchChange}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Configure a Tavily API key in Settings &gt; Providers to enable web search.
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>

            <button
              type="button"
              onClick={handleUploadClick}
              disabled={isLoading}
              className={cn(iconButtonClass, "hidden sm:flex")}
              aria-label="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <Textarea
              ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="Type a message..."
              rows={1}
              className="min-h-[48px] max-h-[180px] min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm leading-6 focus-visible:ring-0 focus-visible:ring-offset-0"
            />

            <button
              type="button"
              onClick={handleMicClick}
              disabled={isLoading || isTranscribing}
              className={cn(
                iconButtonClass,
                "hidden sm:flex",
                isRecording
                  ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                  : isLoading || isTranscribing
                    ? "text-muted-foreground/40 hover:bg-transparent hover:text-muted-foreground/40"
                    : undefined
              )}
              aria-label={isRecording ? "Stop voice input" : "Start voice input"}
              title={isTranscribing ? "Transcribing..." : (isRecording ? "Stop recording" : "Start recording")}
            >
              {isRecording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={!hasInput || isLoading || isTranscribing}
              className={cn(iconButtonClass, "text-muted-foreground/80 disabled:text-muted-foreground/80 disabled:opacity-100")}
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </div>

        {isRecording && (
          <div className="ml-1 mt-1.5 flex items-center gap-1.5">
            <Mic className="h-3 w-3 text-primary" />
            <span className="text-[11px] text-primary">Listening...</span>
          </div>
        )}

        {isTranscribing && (
          <div className="ml-1 mt-1.5 flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Transcribing...</span>
          </div>
        )}

        {speechError && (
          <div className="ml-1 mt-1.5 flex items-center gap-1.5">
            <span className="text-[11px] text-destructive/90">{speechError}</span>
          </div>
        )}

        {webSearch && (
          <div className="ml-1 mt-1.5 flex items-center gap-1.5">
            <Globe className="h-3 w-3 text-primary" />
            <span className="text-[11px] text-primary">Web search enabled</span>
          </div>
        )}
      </div>
    </div>
  )
}
