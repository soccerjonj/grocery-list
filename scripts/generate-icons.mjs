import { createRequire } from "module";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Use sharp bundled with Next.js
const sharp = require(join(root, "node_modules", "sharp"));

const svg = readFileSync(join(root, "public", "icons", "icon.svg"));

await sharp(svg).resize(192, 192).png().toFile(join(root, "public", "icons", "icon-192.png"));
console.log("✓ icon-192.png");

await sharp(svg).resize(512, 512).png().toFile(join(root, "public", "icons", "icon-512.png"));
console.log("✓ icon-512.png");

await sharp(svg).resize(512, 512).png().toFile(join(root, "public", "icons", "icon-512-maskable.png"));
console.log("✓ icon-512-maskable.png");

console.log("Icons generated.");
