import { ImageResponse } from 'next/og'

export const alt = 'SyncCode: write code together, in the same file, at the same moment'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const LINES = [
  { text: 'Write code together,', color: '#8b7bff' },
  { text: 'in the same file,', color: '#ff7a90' },
  { text: 'at the same moment.', color: '#2fd3b8' },
]

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: '#0f1020',
        color: '#eceefb',
        fontSize: 84,
        fontWeight: 700,
        letterSpacing: -3,
        lineHeight: 1.2,
      }}
    >
      {LINES.map((line) => (
        <div key={line.text} style={{ display: 'flex', alignItems: 'center' }}>
          {line.text}
          <div
            style={{
              width: 8,
              height: 84,
              marginLeft: 10,
              borderRadius: 4,
              background: line.color,
            }}
          />
        </div>
      ))}
      <div
        style={{ marginTop: 48, fontSize: 32, fontWeight: 500, letterSpacing: 0, color: '#9a9fc4' }}
      >
        SyncCode
      </div>
    </div>,
    size,
  )
}
