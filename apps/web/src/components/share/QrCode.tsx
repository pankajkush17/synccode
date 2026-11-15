'use client'

import { QRCodeSVG } from 'qrcode.react'

/** Always dark-on-white, whatever the theme: phone cameras need the contrast. */
export function QrCode({ value, label }: { value: string; label: string }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-white p-3">
      <QRCodeSVG
        value={value}
        size={148}
        marginSize={0}
        level="M"
        fgColor="#14152b"
        bgColor="#ffffff"
        title={label}
      />
    </div>
  )
}
