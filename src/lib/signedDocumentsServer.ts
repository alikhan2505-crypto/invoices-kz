// Серверная половина src/lib/signedDocuments.ts: скачать объект или выдать
// короткую подписанную ссылку на него. Только для маршрутов со служебной
// ролью — права (владелец / public_token) проверяет вызывающий маршрут.
import type { SupabaseClient } from '@supabase/supabase-js'
import { SIGNED_DOCUMENTS_BUCKET, SIGNED_URL_TTL_SECONDS, contractFilePath, signedDocumentPath } from './signedDocuments'

/** Путь объекта из значения колонки; хост ссылки сверяется с нашим проектом. */
export function resolveSignedDocumentPath(value: string | null | undefined): string | null {
  return signedDocumentPath(value, process.env.NEXT_PUBLIC_SUPABASE_URL)
}

/** Путь файла договора, только из папки его владельца — см. contractFilePath. */
export function resolveContractFilePath(
  value: string | null | undefined,
  ownerId: string | null | undefined,
): string | null {
  return contractFilePath(value, ownerId, process.env.NEXT_PUBLIC_SUPABASE_URL)
}

/** Байты объекта или null, если путь не наш или файла нет. */
export async function downloadSignedDocument(
  admin: SupabaseClient,
  value: string | null | undefined,
): Promise<Uint8Array | null> {
  const path = resolveSignedDocumentPath(value)
  if (!path) return null
  const { data, error } = await admin.storage.from(SIGNED_DOCUMENTS_BUCKET).download(path)
  if (error || !data) {
    console.error('signed-documents download failed:', error?.message || 'no data')
    return null
  }
  return new Uint8Array(await data.arrayBuffer())
}

/** Короткая подписанная ссылка на объект или null. */
export async function signedDocumentUrl(
  admin: SupabaseClient,
  value: string | null | undefined,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const path = resolveSignedDocumentPath(value)
  if (!path) return null
  const { data, error } = await admin.storage.from(SIGNED_DOCUMENTS_BUCKET).createSignedUrl(path, expiresIn)
  if (error || !data?.signedUrl) {
    console.error('signed-documents signed url failed:', error?.message || 'no url')
    return null
  }
  return data.signedUrl
}
