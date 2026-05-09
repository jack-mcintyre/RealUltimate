/**
 * Regenerates assets/flyer/qr-download.svg after URL changes.
 * Run: npm run flyer:qr  (from web/)
 */
const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')

const URL = 'https://download.realultimate.me/realultimate.apk'
const out = path.join(__dirname, '../../assets/flyer/qr-download.svg')

QRCode.toString(
  URL,
  {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f172a', light: '#ffffff' }
  },
  (err, svg) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, svg)
    console.log('Wrote', out)
  }
)
