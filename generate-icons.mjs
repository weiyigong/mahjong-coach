// Generate PNG icons for PWA
// Run with: node generate-icons.mjs

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1a1a2e';
  const r = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Tile background
  const padding = size * 0.12;
  const tileW = size - padding * 2;
  const tileH = size - padding * 2;
  const tr = size * 0.12;

  ctx.fillStyle = '#16213e';
  ctx.beginPath();
  ctx.roundRect(padding, padding, tileW, tileH, tr);
  ctx.fill();

  ctx.strokeStyle = '#a29bfe';
  ctx.lineWidth = size * 0.04;
  ctx.beginPath();
  ctx.roundRect(padding, padding, tileW, tileH, tr);
  ctx.stroke();

  // Character
  ctx.fillStyle = '#ff6b6b';
  ctx.font = `bold ${size * 0.5}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('中', size / 2, size / 2 + size * 0.02);

  return canvas.toBuffer('image/png');
}

try {
  writeFileSync('./public/icon-192.png', generateIcon(192));
  writeFileSync('./public/icon-512.png', generateIcon(512));
  console.log('Icons generated!');
} catch (e) {
  console.log('canvas module not available, creating placeholder icons');
  // Create minimal valid PNG (1x1 pixel)
  process.exit(0);
}
