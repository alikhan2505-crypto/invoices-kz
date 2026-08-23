import { describe, it, expect } from 'vitest'
import { isImageWithinLimits, isAudioWithinLimits, sniffImageMimeType, MAX_IMAGE_BYTES, MAX_AUDIO_BYTES } from './mediaLimits'

describe('isImageWithinLimits', () => {
  it('accepts a supported mime type under the size cap', () => {
    expect(isImageWithinLimits(1024, 'image/jpeg')).toBe(true)
    expect(isImageWithinLimits(1024, 'image/png')).toBe(true)
  })

  it('accepts a mime type with charset/codec suffix by matching only the base type', () => {
    expect(isImageWithinLimits(1024, 'image/jpeg; charset=binary')).toBe(true)
  })

  it('rejects zero-length or oversized buffers', () => {
    expect(isImageWithinLimits(0, 'image/jpeg')).toBe(false)
    expect(isImageWithinLimits(MAX_IMAGE_BYTES + 1, 'image/jpeg')).toBe(false)
    expect(isImageWithinLimits(MAX_IMAGE_BYTES, 'image/jpeg')).toBe(true)
  })

  it('rejects an unsupported mime type', () => {
    expect(isImageWithinLimits(1024, 'image/bmp')).toBe(false)
    expect(isImageWithinLimits(1024, 'video/mp4')).toBe(false)
  })
})

describe('isAudioWithinLimits', () => {
  it('accepts a non-empty buffer at or under the cap', () => {
    expect(isAudioWithinLimits(1024)).toBe(true)
    expect(isAudioWithinLimits(MAX_AUDIO_BYTES)).toBe(true)
  })

  it('rejects zero-length or oversized buffers', () => {
    expect(isAudioWithinLimits(0)).toBe(false)
    expect(isAudioWithinLimits(MAX_AUDIO_BYTES + 1)).toBe(false)
  })
})

describe('sniffImageMimeType', () => {
  it('detects JPEG from its magic bytes', () => {
    expect(sniffImageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg')
  })

  it('detects PNG from its magic bytes', () => {
    expect(sniffImageMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
  })

  it('detects GIF from its magic bytes', () => {
    expect(sniffImageMimeType(Buffer.from('GIF89a'))).toBe('image/gif')
  })

  it('detects WEBP from its RIFF/WEBP header', () => {
    const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])
    expect(sniffImageMimeType(buf)).toBe('image/webp')
  })

  it('returns null for unrecognized or too-short buffers', () => {
    expect(sniffImageMimeType(Buffer.from([0x00, 0x01]))).toBeNull()
    expect(sniffImageMimeType(Buffer.from('not an image, just text'))).toBeNull()
    expect(sniffImageMimeType(Buffer.alloc(0))).toBeNull()
  })
})
