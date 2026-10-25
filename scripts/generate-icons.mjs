// Gera os ícones PNG da app (sem dependências): fundo azul com uma cápsula.
// Uso: npm run icons
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BLUE = [29, 78, 216];
const WHITE = [255, 255, 255];
const LIGHT = [191, 219, 254];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Desenha o ícone em coordenadas normalizadas (0..1). `pad` encolhe a cápsula (ícone "maskable"). */
function icon(size, { rounded, pad }) {
  return png(size, (px, py) => {
    const x = px / size;
    const y = py / size;
    // fundo (quadrado com cantos arredondados ou cheio)
    if (rounded) {
      const r = 0.22;
      const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
      const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
      if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
    }
    // cápsula rodada 45°
    const s = pad;
    const u = ((x - 0.5) + (y - 0.5)) / Math.SQRT2 / s;
    const v = ((x - 0.5) - (y - 0.5)) / Math.SQRT2 / s;
    const half = 0.26;
    const rad = 0.12;
    const cu = Math.max(Math.abs(u) - half, 0);
    const inside = cu * cu + v * v <= rad * rad;
    if (inside) {
      if (Math.abs(u) < 0.008 / s) return [...BLUE, 255];
      return [...(u < 0 ? WHITE : LIGHT), 255];
    }
    return [...BLUE, 255];
  });
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192, { rounded: true, pad: 1 }));
writeFileSync("public/icons/icon-512.png", icon(512, { rounded: true, pad: 1 }));
writeFileSync("public/icons/icon-maskable-512.png", icon(512, { rounded: false, pad: 0.8 }));
// O iOS arredonda os cantos sozinho, por isso o apple-touch-icon é quadrado.
writeFileSync("public/icons/apple-touch-icon.png", icon(180, { rounded: false, pad: 1 }));
console.log("Ícones gerados em public/icons/");
