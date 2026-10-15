// Проверка картинки подписи/печати для бонуса за профиль — только сервер
// (sharp). Вынесено из profileBonusServer.ts, чтобы проверять тестом тот же
// самый конвейер, что работает в проде, на настоящих PNG.

import sharp from 'sharp'
import { assessInkCoverage, MIN_SIGNATURE_FILE_BYTES, MIN_SIGNATURE_SIDE_PX, type ImageCheck } from './profileBonus'

export async function checkSignatureImageBuffer(buffer: Buffer): Promise<ImageCheck> {
  if (buffer.length < MIN_SIGNATURE_FILE_BYTES) return 'blank'
  try {
    const meta = await sharp(buffer).metadata()
    if (!meta.width || !meta.height) return 'invalid'
    if (meta.width < MIN_SIGNATURE_SIDE_PX || meta.height < MIN_SIGNATURE_SIDE_PX) return 'blank'
    const gray = await sharp(buffer)
      .flatten({ background: '#ffffff' })
      .greyscale()
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer()
    return assessInkCoverage(gray)
  } catch {
    return 'invalid'
  }
}
