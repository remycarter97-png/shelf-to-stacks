// Generates the home-screen icons from one SVG. Run: npm run icons
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const spine = (scale = 1) => {
  // A book spine with three gold bands, centred in a 512 box.
  const w = 200 * scale, h = 290 * scale, x = 256 - w / 2, y = 256 - h / 2;
  const band = (dy, o) =>
    `<rect x="${x + 28 * scale}" y="${y + dy * scale}" width="${w - 56 * scale}" height="${10 * scale}" rx="${3 * scale}" fill="#f3d9b8" opacity="${o}"/>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${16 * scale}" fill="#6b2f22"/>
    ${band(34, 0.9)}${band(62, 0.65)}${band(90, 0.45)}
    <rect x="${x + 28 * scale}" y="${y + h - 64 * scale}" width="${w - 56 * scale}" height="${10 * scale}" rx="${3 * scale}" fill="#c8834e"/>`;
};

const icon = (scale, rounded) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" ${rounded ? 'rx="96"' : ""} fill="#f8f1e8"/>${spine(scale)}</svg>`;

const outputs = [
  ["public/icon-192.png", 192, icon(1.15, false)],
  ["public/icon-512.png", 512, icon(1.15, false)],
  ["public/icon-maskable-512.png", 512, icon(0.9, false)], // safe zone for Android shapes
  ["public/apple-touch-icon.png", 180, icon(1.15, false)],
];
for (const [file, size, svg] of outputs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
}
writeFileSync("public/favicon.svg", icon(1.3, true));
console.log("icons written");
