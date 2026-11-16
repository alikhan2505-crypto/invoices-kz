// Отметка «на этом устройстве уже пользовались Face ID / Touch ID» (решение основателя D6, 16.11.2026).
// Страница входа показывает вход по Face ID первой кнопкой только тем, у кого на этом устройстве он уже был;
// новичку с рекламы кнопка без ключа ничего не даст и выглядит как регистрация, поэтому для него она внизу.
// Хранится только в браузере этого устройства: не секрет, не доступ, просто подсказка порядка кнопок.

const KEY = 'ikz_passkey_device'

export function markPasskeyDevice(): void {
  try { localStorage.setItem(KEY, '1') } catch { /* приватный режим: порядок кнопок останется «для новичка» */ }
}

export function hasPasskeyDevice(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
