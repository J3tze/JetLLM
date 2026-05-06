export const ACCEPTED_CHAT_ATTACHMENTS = "image/*,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.yaml,.yml,.log,.html,.htm,.css,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.hpp,.rs,.go,.sql,.sh,.ps1"

export const MAX_CHAT_ATTACHMENTS = 5
export const MAX_TEXT_ATTACHMENT_BYTES = 1_000_000
export const MAX_IMAGE_ATTACHMENT_BYTES = 5_000_000
export const MAX_TOTAL_ATTACHMENT_BYTES = 8_000_000
export const MAX_TEXT_ATTACHMENT_CHARS = 80_000
export const MAX_TOTAL_TEXT_ATTACHMENT_CHARS = 120_000
export const MAX_CHAT_ATTACHMENT_DATA_URL_CHARS = 12_000_000

const TEXT_MEDIA_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/sql",
  "application/x-sh",
  "application/x-httpd-php",
  "application/x-yaml",
  "application/yaml",
])

const TEXT_FILE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "xml",
  "yaml",
  "yml",
  "log",
  "html",
  "htm",
  "css",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "rs",
  "go",
  "sql",
  "sh",
  "ps1",
])

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  xml: "application/xml",
  yaml: "application/x-yaml",
  yml: "application/x-yaml",
  log: "text/plain",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  ts: "text/plain",
  tsx: "text/plain",
  jsx: "text/plain",
  py: "text/plain",
  java: "text/plain",
  c: "text/plain",
  cpp: "text/plain",
  h: "text/plain",
  hpp: "text/plain",
  rs: "text/plain",
  go: "text/plain",
  sql: "application/sql",
  sh: "application/x-sh",
  ps1: "text/plain",
}

export type ChatAttachmentLike = {
  name: string
  size: number
  type?: string
}

export type ChatAttachmentValidation = {
  valid: boolean
  error?: string
}

export function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".")
  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : ""
}

export function resolveAttachmentMediaType(file: { name: string; type?: string }): string {
  if (file.type) return file.type
  const extension = getFileExtension(file.name)
  return EXTENSION_MEDIA_TYPES[extension] ?? "application/octet-stream"
}

export function isTextDocument(mediaType: string, filename?: string): boolean {
  const normalizedMediaType = mediaType.toLowerCase()
  if (normalizedMediaType.startsWith("text/")) {
    return true
  }
  if (TEXT_MEDIA_TYPES.has(normalizedMediaType)) {
    return true
  }
  if (!filename) {
    return false
  }
  return TEXT_FILE_EXTENSIONS.has(getFileExtension(filename))
}

export function isImageAttachment(mediaType: string): boolean {
  return mediaType.toLowerCase().startsWith("image/")
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kilobytes = bytes / 1024
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`
  const megabytes = kilobytes / 1024
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`
}

export function validateChatAttachments(files: ChatAttachmentLike[]): ChatAttachmentValidation {
  if (files.length > MAX_CHAT_ATTACHMENTS) {
    return {
      valid: false,
      error: `Attach up to ${MAX_CHAT_ATTACHMENTS} files at a time.`,
    }
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return {
      valid: false,
      error: `Attachments can total up to ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)} per message.`,
    }
  }

  for (const file of files) {
    const mediaType = resolveAttachmentMediaType(file)
    const isText = isTextDocument(mediaType, file.name)
    const isImage = isImageAttachment(mediaType)

    if (!isText && !isImage) {
      return {
        valid: false,
        error: `${file.name} is not a supported chat attachment. Use images or text/code files.`,
      }
    }

    const maxBytes = isText ? MAX_TEXT_ATTACHMENT_BYTES : MAX_IMAGE_ATTACHMENT_BYTES
    if (file.size > maxBytes) {
      return {
        valid: false,
        error: `${file.name} is ${formatBytes(file.size)}. ${isText ? "Text" : "Image"} attachments can be up to ${formatBytes(maxBytes)}.`,
      }
    }
  }

  return { valid: true }
}
