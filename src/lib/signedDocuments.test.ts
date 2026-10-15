import { describe, it, expect } from 'vitest'
import { contractFilePath, signedDocumentPath } from './signedDocuments'

const SUPA = 'https://abcd.supabase.co'

describe('signedDocumentPath', () => {
  it('путь возвращается как есть', () => {
    expect(signedDocumentPath('contracts/u1/1700-file.pdf')).toBe('contracts/u1/1700-file.pdf')
    expect(signedDocumentPath('inv-1/1700-snapshot.pdf')).toBe('inv-1/1700-snapshot.pdf')
  })
  it('старая публичная ссылка → путь', () => {
    expect(signedDocumentPath(`${SUPA}/storage/v1/object/public/signed-documents/contracts/u1/a.pdf`, SUPA))
      .toBe('contracts/u1/a.pdf')
  })
  it('подписанная ссылка → путь, без токена', () => {
    expect(signedDocumentPath(`${SUPA}/storage/v1/object/sign/signed-documents/inv-1/1-snapshot.pdf?token=abc`, SUPA))
      .toBe('inv-1/1-snapshot.pdf')
  })
  it('раскодирует сегменты', () => {
    expect(signedDocumentPath(`${SUPA}/storage/v1/object/sign/signed-documents/a/%D0%B4.pdf?token=x`, SUPA)).toBe('a/д.pdf')
  })
  it('чужой хост, чужой бакет, не Storage — null', () => {
    expect(signedDocumentPath('https://evil.example/storage/v1/object/public/signed-documents/a.pdf', SUPA)).toBeNull()
    expect(signedDocumentPath(`${SUPA}/storage/v1/object/public/logos/a.png`, SUPA)).toBeNull()
    expect(signedDocumentPath(`${SUPA}/rest/v1/invoices`, SUPA)).toBeNull()
    expect(signedDocumentPath('file:///etc/passwd')).toBeNull()
    expect(signedDocumentPath('javascript:alert(1)')).toBeNull()
  })
  it('обход каталогов и мусор — null', () => {
    expect(signedDocumentPath('../secret.pdf')).toBeNull()
    expect(signedDocumentPath('a/../../b.pdf')).toBeNull()
    expect(signedDocumentPath('/abs/path.pdf')).toBeNull()
    expect(signedDocumentPath('a//b.pdf')).toBeNull()
    expect(signedDocumentPath('a\\b.pdf')).toBeNull()
    // URL сам сворачивает %2E%2E; выйти так из бакета нельзя — проверка
    // имени бакета идёт уже по нормализованному пути.
    expect(signedDocumentPath(`${SUPA}/storage/v1/object/public/signed-documents/%2E%2E/logos/x.png`, SUPA)).toBeNull()
    expect(signedDocumentPath('')).toBeNull()
    expect(signedDocumentPath(null)).toBeNull()
    expect(signedDocumentPath(undefined)).toBeNull()
  })
})

describe('contractFilePath', () => {
  it('свой путь и своя старая ссылка проходят', () => {
    expect(contractFilePath('contracts/u1/1-a.pdf', 'u1')).toBe('contracts/u1/1-a.pdf')
    expect(contractFilePath(`${SUPA}/storage/v1/object/public/signed-documents/contracts/u1/a.pdf`, 'u1', SUPA))
      .toBe('contracts/u1/a.pdf')
  })
  it('чужая папка, снимок счёта и префикс-ловушка — null', () => {
    expect(contractFilePath('contracts/u2/1-a.pdf', 'u1')).toBeNull()
    expect(contractFilePath('inv-1/1-snapshot.pdf', 'u1')).toBeNull()
    expect(contractFilePath('contracts/u10/1-a.pdf', 'u1')).toBeNull()
    expect(contractFilePath('contracts/u1/../u2/a.pdf', 'u1')).toBeNull()
  })
  it('без владельца или файла — null', () => {
    expect(contractFilePath('contracts/u1/a.pdf', null)).toBeNull()
    expect(contractFilePath(null, 'u1')).toBeNull()
  })
})
