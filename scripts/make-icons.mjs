// Generates the home-screen icons from one SVG. Run: npm run icons
// The logo (an open book with a cat peeking over it) on blush, matching the site.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const INK = "#4a3728";
const logo = (scale) => {
  // The logo is drawn in a 46×40 box; center it in the 512 square.
  const k = (512 / 46) * scale;
  const tx = 256 - 23 * k, ty = 256 - 22 * k;
  return `<g transform="translate(${tx} ${ty}) scale(${k})">
    <path d="M15 13l2.5-6 3 5" fill="${INK}"/><path d="M26 12l2.6-5 2.4 6" fill="${INK}"/>
    <path d="M14 16c0-5 4-8 9-8s9 3 9 8z" fill="${INK}"/>
    <circle cx="19.5" cy="13.5" r="1" fill="#fdf8f3"/><circle cx="26.5" cy="13.5" r="1" fill="#fdf8f3"/>
    <path d="M3 17c6-2 13-1.5 20 2 7-3.5 14-4 20-2v18c-6-2-13-1.5-20 2-7-3.5-14-4-20-2z" fill="#fffcf8" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M23 19v18" stroke="${INK}" stroke-width="2"/>
    <path d="M8 22.5c3-.8 6-.6 10 .6M8 27c3-.8 6-.6 10 .6M28 23c4-1.2 7-1.4 10-.6M28 27.6c4-1.2 7-1.4 10-.6" stroke="#d4a59a" stroke-width="1.6" stroke-linecap="round"/>
  </g>`;
};

const icon = (scale, rounded) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="#f2c4c4"/>${logo(scale)}</svg>`;

const outputs = [
  ["public/icon-192.png", 192, icon(0.78, false)],
  ["public/icon-512.png", 512, icon(0.78, false)],
  ["public/icon-maskable-512.png", 512, icon(0.6, false)], // safe zone for Android shapes
  ["public/apple-touch-icon.png", 180, icon(0.78, false)],
];
for (const [file, size, svg] of outputs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
}
writeFileSync("public/favicon.svg", icon(0.86, true));
console.log("icons written");
