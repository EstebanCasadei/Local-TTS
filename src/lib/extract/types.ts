// Shared types for document extraction.
// Full implementation in issue #7 (TXT), #8 (PDF), #9 (EPUB).

export interface Chapter {
  index: number
  title: string
  text: string
}

export interface RawDocument {
  title: string
  author?: string | null
  chapters: Chapter[]
}

export interface ExtractedDocument {
  title: string
  author?: string | null
  format: 'txt' | 'pdf' | 'epub'
  chapters: Chapter[]
}

export const ErrorCode = {
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  EMPTY_DOCUMENT: 'EMPTY_DOCUMENT',
  PARSE_ERROR: 'PARSE_ERROR',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export class ExtractionError extends Error {
  code: ErrorCode
  constructor(code: ErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'ExtractionError'
  }
}
