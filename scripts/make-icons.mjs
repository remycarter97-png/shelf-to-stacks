// Generates the home-screen icons from one SVG. Run: npm run icons
// A little stack of books on the shopfront green, matching the logo.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const stack = (scale = 1) => {
  const s = (n) => n * scale;
  const ox = 256 - s(176) / 2 - s(8), oy = 256 - s(176) / 2 - s(8);
  const r = (x, y, w, h, fill, extra = "") =>
    `<rect x="${ox + s(x)}" y="${oy + s(y)}" width="${s(w)}" height="${s(h)}" rx="${s(10)}" fill="${fill}" ${extra}/>`;
  return [
    r(24, 136, 160, 44, "#c9637c"),
    r(40, 88, 140, 44, "#e6a73a"),
    r(16, 40, 152, 44, "#fff8ea"),
    r(40, 57, 86, 10, "#3e5a44", 'opacity="0.5"'),
    `<path d="M${ox + s(128)} ${oy + s(40)}V${oy + s(4)}l${s(14)} ${s(11)} ${s(14)}-${s(11)}V${oy + s(40)}z" fill="#c9637c"/>`,
  ].join("");
};

const icon = (scale, rounded) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="#3e5a44"/>${stack(scale)}</svg>`;

const outputs = [
  ["public/icon-192.png", 192, icon(1.6, false)],
  ["public/icon-512.png", 512, icon(1.6, false)],
  ["public/icon-maskable-512.png", 512, icon(1.25, false)], // safe zone for Android shapes
  ["public/apple-touch-icon.png", 180, icon(1.6, false)],
];
for (const [file, size, svg] of outputs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
}
writeFileSync("public/favicon.svg", icon(1.7, true));
console.log("icons written");
