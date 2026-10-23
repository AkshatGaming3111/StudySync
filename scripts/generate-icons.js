const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table & calculator
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPng(width, height, r, g, b, a = 255) {
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    rawData[rowStart] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pixelStart = rowStart + 1 + x * 4;

      const cx = width / 2;
      const cy = height / 2;
      const dx = (x - cx) / (width / 2);
      const dy = (y - cy) / (height / 2);
      const distSq = dx * dx + dy * dy;

      if (distSq <= 0.85) {
        const t = (x + y) / (width + height);
        const pr = Math.round(79 + t * 40);
        const pg = Math.round(70 + t * 90);
        const pb = Math.round(229 + t * 25);
        rawData[pixelStart] = pr;
        rawData[pixelStart + 1] = pg;
        rawData[pixelStart + 2] = pb;
        rawData[pixelStart + 3] = 255;
      } else if (distSq <= 1.0) {
        rawData[pixelStart] = 99;
        rawData[pixelStart + 1] = 102;
        rawData[pixelStart + 2] = 241;
        rawData[pixelStart + 3] = Math.round((1.0 - distSq) / 0.15 * 255);
      } else {
        rawData[pixelStart] = 0;
        rawData[pixelStart + 1] = 0;
        rawData[pixelStart + 2] = 0;
        rawData[pixelStart + 3] = 0;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = createChunk('IHDR', ihdrData);

  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunkBuf = Buffer.alloc(8 + length + 4);
  chunkBuf.writeUInt32BE(length, 0);
  chunkBuf.write(type, 4, 4, 'ascii');
  data.copy(chunkBuf, 8);

  const crcTarget = chunkBuf.slice(4, 8 + length);
  const crc = crc32(crcTarget);
  chunkBuf.writeUInt32BE(crc, 8 + length);

  return chunkBuf;
}

const iconsDir = path.join(__dirname, '..', 'extension', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const png = createPng(size, size, 99, 102, 241);
  const filePath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated: ${filePath} (${png.length} bytes)`);
});
