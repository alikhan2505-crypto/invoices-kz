declare module 'sigex-qr-signing-client' {
  export class QRSigningError extends Error {
    details?: string
    canceledByUser?: boolean
  }

  export class QRSigningClientCMS {
    constructor(description: string, attach?: boolean, baseUrl?: string)
    addDataToSign(
      names: string[],
      data: string | ArrayBuffer | Blob | File,
      meta?: { name: string; value: string }[],
      isPDF?: boolean
    ): Promise<void>
    registerQRSinging(): Promise<string>
    getQR(): string | null
    getEGovMobileLaunchLink(): string | null
    getEGovBusinessLaunchLink(): string | null
    getSignatures(
      dataSentCallback?: () => void,
      debugErrorsCallback?: (err: unknown) => void
    ): Promise<string[]>
  }
}
