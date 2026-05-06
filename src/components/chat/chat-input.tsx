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
import { Plus, SendHorizontal, Globe, Paperclip, X, Mic, Square, FileText, ImageIcon, Brain } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  ACCEPTED_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENTS,
  formatBytes,
  isImageAttachment,
  isTextDocument,
  resolveAttachmentMediaType,
  validateChatAttachments,
} from "@/lib/chat-attachments"
import {
  THINKING_LEVEL_LABELS,
  THINKING_LEVELS,
  type ThinkingLevel,
} from "@/lib/thinking"

export type ChatInputSendPayload = {
  text: string
  files: File[]
}

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

function resolveSendError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return "Failed to send. Your draft was kept."
}

function getAttachmentKind(file: File): "image" | "text" | "file" {
  const mediaType = resolveAttachmentMediaType(file)
  if (isImageAttachment(mediaType)) return "image"
  if (isTextDocument(mediaType, file.name)) return "text"
  return "file"
}

function getAttachmentKindLabel(kind: "image" | "text" | "file"): string {
  if (kind === "image") return "Image"
  if (kind === "text") return "Text"
  return "File"
}

function chooseRecorderMimeType(recorderConstructor: typeof MediaRecorder): string | undefined {
  if (typeof recorderConstructor.isTypeSupported !== "function") {
    return undefined
  }
  return PREFERRED_RECORDER_MIME_TYPES.find((mimeType) => recorderConstructor.isTypeSupported(mimeType))
}

type ChatInputProps = {
  onSend: (payload: ChatInputSendPayload) => void | Promise<void>
  isLoading?: boolean
  webSearch: boolean
  onWebSearchChange: (enabled: boolean) => void
  searchAvailable: boolean
  thinkingLevel: ThinkingLevel
  onThinkingLevelChange: (level: ThinkingLevel) => void
}

export function ChatInput({
  onSend,
  isLoading,
  webSearch,
  onWebSearchChange,
  searchAvailable,
  thinkingLevel,
  onThinkingLevelChange,
}: ChatInputProps) {
  const [value, setValue] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [toolsOpen, setToolsOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isSendingRef = useRef(false)
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
  const isBusy = isLoading || isTranscribing || isSending
  const sendTitle = !hasInput
    ? "Enter a message or attach a file"
    : isSending
      ? "Preparing message..."
      : isLoading
        ? "Waiting for response"
        : isTranscribing
          ? "Transcribing audio"
          : "Send message"
  const statusMessage = speechError ?? attachmentError ?? sendError
  const statusTone = statusMessage
    ? "error"
    : isRecording || (webSearch && !isTranscribing && !isSending)
      ? "primary"
      : "muted"
  const statusText = statusMessage
    ?? (isRecording
      ? "Listening..."
      : isTranscribing
        ? "Transcribing audio..."
        : isSending
          ? files.length > 0
            ? "Preparing attachments and saving your message..."
            : "Saving your message..."
          : webSearch
            ? "Web search enabled"
            : "")
  const statusIcon = !statusMessage && isRecording
    ? "mic"
    : !statusMessage && webSearch && !isTranscribing && !isSending
      ? "globe"
      : null
  const thinkingEnabled = thinkingLevel !== "off"
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

  const handleSend = useCallback(async () => {
    const trimmed = value.trim()
    if ((!trimmed && files.length === 0) || isBusy || isSendingRef.current) return

    setSpeechError(null)
    setAttachmentError(null)
    setSendError(null)
    acceptSpeechResultsRef.current = false
    acceptTranscriptionResultsRef.current = false
    recognitionRef.current?.stop()

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== "inactive") {
      recorder.stop()
    }

    recordingModeRef.current = null
    setIsRecording(false)

    isSendingRef.current = true
    setIsSending(true)
    try {
      await onSend({ text: trimmed, files })
      setValue("")
      setFiles([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
      }
    } catch (error) {
      setSendError(resolveSendError(error))
    } finally {
      isSendingRef.current = false
      setIsSending(false)
    }
  }, [value, files, isBusy, onSend])

  const handleMicClick = () => {
    if (isBusy) {
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
    const seen = new Set(files.map(file => `${file.name}-${file.size}-${file.lastModified}`))
    const next = [...files]

    for (const file of selectedFiles) {
      const key = `${file.name}-${file.size}-${file.lastModified}`
      if (!seen.has(key)) {
        seen.add(key)
        next.push(file)
      }
    }

    const validation = validateChatAttachments(next)
    if (!validation.valid) {
      setAttachmentError(validation.error ?? "One or more attachments are not supported.")
      event.target.value = ""
      return
    }

    setAttachmentError(null)
    setSendError(null)
    setFiles(next)

    event.target.value = ""
  }

  const handleRemoveFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index))
    setAttachmentError(null)
  }

  const handleClearFiles = () => {
    setFiles([])
    setAttachmentError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleUploadClick = () => {
    if (isBusy) return
    fileInputRef.current?.click()
    setToolsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
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
          disabled={isBusy}
        />

        {files.length > 0 ? (
          <div className="mb-2 overflow-hidden rounded-[1.1rem] border border-border/50 bg-background/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/65">
            <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/90">
                  <Paperclip className="h-3.5 w-3.5 text-primary" />
                  Attachments
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {files.length}/{MAX_CHAT_ATTACHMENTS}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  Text/code files are included as safe context; images stay available for vision models.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleClearFiles}
                disabled={isBusy}
              >
                Clear all
              </button>
            </div>
            <div className="flex max-h-36 gap-2 overflow-x-auto p-2 scrollbar-none sm:grid sm:grid-cols-2 sm:overflow-y-auto sm:overflow-x-hidden">
              {files.map((file, index) => {
                const kind = getAttachmentKind(file)
                return (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="group flex min-w-[230px] items-center gap-2 rounded-xl border border-border/45 bg-black/[0.12] px-2.5 py-2 text-xs text-foreground/90 transition-colors hover:border-primary/30 sm:min-w-0"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {kind === "image" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{file.name}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <span>{getAttachmentKindLabel(kind)}</span>
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                        <span>{formatBytes(file.size)}</span>
                        {isBusy ? (
                          <>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            <span>Locked</span>
                          </>
                        ) : null}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => handleRemoveFile(index)}
                      disabled={isBusy}
                      aria-label={`Remove ${file.name}`}
                      title={`Remove ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
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
                disabled={isBusy}
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
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleUploadClick}
                  disabled={isBusy}
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  Upload Files
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
                  onClick={handleMicClick}
                  disabled={isBusy}
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
                <div className="space-y-2 rounded-md px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">Thinking</Label>
                    </div>
                    <span className={cn("text-xs", thinkingEnabled ? "text-primary" : "text-muted-foreground")}>{THINKING_LEVEL_LABELS[thinkingLevel]}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {THINKING_LEVELS.map(level => (
                      <button
                        key={level}
                        type="button"
                        className={cn(
                          "rounded-full border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          thinkingLevel === level
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border/50 bg-background/40 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                        )}
                        onClick={() => onThinkingLevelChange(level)}
                        disabled={isBusy}
                        aria-pressed={thinkingLevel === level}
                      >
                        {THINKING_LEVEL_LABELS[level]}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] leading-4 text-muted-foreground/70">
                    Applied only when the selected direct provider/model supports reasoning.
                  </p>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <button
            type="button"
            onClick={handleUploadClick}
            disabled={isBusy}
            className={cn(iconButtonClass, "hidden sm:flex")}
            aria-label="Attach files"
            title="Attach files"
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
            disabled={isSending}
            rows={1}
            className="min-h-[48px] max-h-[180px] min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm leading-6 focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <button
            type="button"
            onClick={handleMicClick}
            disabled={isBusy}
            className={cn(
              iconButtonClass,
              "hidden sm:flex",
              isRecording
                ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                : isBusy
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
            onClick={() => void handleSend()}
            disabled={!hasInput || isBusy}
            className={cn(iconButtonClass, "text-muted-foreground/80 disabled:text-muted-foreground/80 disabled:opacity-100")}
            aria-label={sendTitle}
            title={sendTitle}
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>

        <div className="ml-1 mt-1.5 min-h-4">
          {statusText ? (
            <div className="flex items-center gap-1.5">
              {statusIcon === "mic" ? <Mic className="h-3 w-3 text-primary" /> : null}
              {statusIcon === "globe" ? <Globe className="h-3 w-3 text-primary" /> : null}
              <span
                className={cn(
                  "text-[11px]",
                  statusTone === "error"
                    ? "text-destructive/90"
                    : statusTone === "primary"
                      ? "text-primary"
                      : "text-muted-foreground"
                )}
              >
                {statusText}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
