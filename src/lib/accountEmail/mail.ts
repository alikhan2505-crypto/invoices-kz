// Письмо с кодом для привязки почты к аккаунту. Русский и английский; казахский ждёт вычитки основателем.

export function buildClaimEmail(code: string): { subject: string; html: string } {
  const digits = code.replace(/\D/g, '')
  return {
    subject: `Код ${digits} для привязки почты · invoices.kz`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1C2056;">
  <h2 style="margin:0 0 12px;font-size:20px;">Код для привязки почты</h2>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Введите этот код на странице invoices.kz, чтобы привязать почту к вашему аккаунту. Код действует 15 минут.</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:.3em;font-family:Menlo,Consolas,monospace;margin:0 0 16px;">${digits}</div>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#6b7280;">Если вы ничего не вводили, просто проигнорируйте письмо: без кода ничего не изменится.</p>
  <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">Enter this code on invoices.kz to link your email to your account. It is valid for 15 minutes. If you did not request it, ignore this message.</p>
</div>`,
  }
}
