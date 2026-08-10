import { describe, it, expect } from 'vitest'
import { chunkText, splitSentences, MAX_CHUNK_CHARS } from './chunker'

describe('chunkText', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(chunkText('   \n\n  ')).toEqual([])
  })

  it('splits a single sentence into one chunk', () => {
    expect(chunkText('Hola mundo.')).toEqual(['Hola mundo.'])
  })

  it('splits multiple sentences', () => {
    const result = chunkText('Primera oración. Segunda oración.')
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('Primera oración.')
    expect(result[1]).toBe('Segunda oración.')
  })
})

describe('splitSentences', () => {
  it('handles Spanish text', () => {
    const result = splitSentences('¿Cómo estás? Muy bien.')
    expect(result).toHaveLength(2)
  })
})

describe('MAX_CHUNK_CHARS', () => {
  it('is 220', () => {
    expect(MAX_CHUNK_CHARS).toBe(220)
  })
})
