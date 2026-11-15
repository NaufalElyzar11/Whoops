import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeBoxProps {
  url: string;
  size?: number;
  caption?: string;
}

export function QrCodeBox({ url, size = 168, caption }: QrCodeBoxProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, {
      width: size * 2,
      margin: 2,
      color: {
        dark: '#3A231E',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error('QR generation failed:', err);
      });
    return () => {
      active = false;
    };
  }, [url, size]);

  return (
    <div className="inline-flex flex-col items-center bg-white border-2 border-[#3A231E] rounded-2xl p-3">
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt="Kode QR Unduh Foto"
          style={{ width: size, height: size }}
          className="block rounded-lg"
        />
      ) : (
        <div
          style={{ width: size, height: size }}
          className="flex items-center justify-center bg-[#EFE2CE] rounded-lg text-xs text-[#61433B]"
        >
          Membuat QR...
        </div>
      )}
      {caption && (
        <div className="mt-2 font-display font-bold text-xs text-[#6D1D3A] text-center">
          {caption}
        </div>
      )}
    </div>
  );
}
