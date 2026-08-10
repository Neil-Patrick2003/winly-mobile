/**
 * Build every app icon from one brand source.
 *
 * The source artwork is a tile on a transparent field and is not square, which
 * no platform accepts: iOS wants 1024×1024 with no alpha, Android wants a
 * foreground that survives being masked to a circle, and the PWA wants its own
 * sizes. Rather than keeping six hand-edited files in step, this derives them —
 * so the next time the brand moves, it is one command and not an afternoon.
 *
 *   node scripts/make-icons.js [source.png]
 *
 * Written against `pngjs` alone, which the project already has: it is the only
 * image library here, and adding a toolchain for six PNGs is not worth it. The
 * resampler below is plain bilinear, which is what that costs.
 */

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

// Run from the repository root, as `reset-project.js` beside it is.
const ROOT = process.cwd();
const SOURCE = process.argv[2] ?? path.join(ROOT, 'assets/images/brand/welle_app_icon.png');

/** Below this, a pixel counts as field rather than artwork. */
const ALPHA_FLOOR = 8;

function read(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

/** Where the artwork actually is, so the transparent field around it goes. */
function bounds({ width, height, data }) {
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= ALPHA_FLOOR) continue;

      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }

  if (right < 0) throw new Error('The source is entirely transparent.');

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function crop(image, box) {
  const out = new PNG({ width: box.width, height: box.height });

  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const from = ((y + box.top) * image.width + (x + box.left)) * 4;
      const to = (y * box.width + x) * 4;
      out.data.set(image.data.subarray(from, from + 4), to);
    }
  }

  return out;
}

/**
 * Give the knocked-out letters a colour of their own.
 *
 * The artwork is a green tile with "welle" punched clean through it: the letters
 * are holes, not white paint, and they only looked white because they were being
 * shown over a white page. Filling the rounded corners with the tile's green
 * therefore filled the word in as well, and the icon came out blank.
 *
 * A hole is told from the field around the tile by which transparent pixels the
 * border can reach: everything a flood fill from the edge arrives at is outside,
 * and every transparent pixel it cannot reach is enclosed by artwork — which is
 * a letter. Those are painted opaque white, and the outside is left clear so the
 * tile keeps its rounded shape where that matters.
 */
function fillHoles(tile, colour = [255, 255, 255]) {
  const { width, height, data } = tile;
  const outside = new Uint8Array(width * height);
  const stack = [];

  const consider = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;

    const cell = y * width + x;
    if (outside[cell] || data[cell * 4 + 3] > ALPHA_FLOOR) return;

    outside[cell] = 1;
    stack.push(cell);
  };

  for (let x = 0; x < width; x += 1) {
    consider(x, 0);
    consider(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    consider(0, y);
    consider(width - 1, y);
  }

  while (stack.length > 0) {
    const cell = stack.pop();
    const x = cell % width;
    const y = (cell - x) / width;

    consider(x - 1, y);
    consider(x + 1, y);
    consider(x, y - 1);
    consider(x, y + 1);
  }

  let holes = 0;
  for (let cell = 0; cell < width * height; cell += 1) {
    const at = cell * 4;
    if (outside[cell] || data[at + 3] > ALPHA_FLOOR) continue;

    data[at] = colour[0];
    data[at + 1] = colour[1];
    data[at + 2] = colour[2];
    data[at + 3] = 255;
    holes += 1;
  }

  return holes;
}

/**
 * The tile's own colour, taken from inside its left edge.
 *
 * Sampled rather than written down, so a source whose green is a shade off the
 * palette still produces corners that match the artwork instead of a seam.
 */
function ground(tile) {
  const x = Math.round(tile.width * 0.08);
  const y = Math.round(tile.height * 0.5);
  const at = (y * tile.width + x) * 4;

  return [tile.data[at], tile.data[at + 1], tile.data[at + 2]];
}

/** Bilinear sample of `tile` at a fractional pixel, as RGBA. */
function sample(tile, fx, fy) {
  const x0 = Math.max(0, Math.min(tile.width - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(tile.height - 1, Math.floor(fy)));
  const x1 = Math.min(tile.width - 1, x0 + 1);
  const y1 = Math.min(tile.height - 1, y0 + 1);
  const dx = fx - x0;
  const dy = fy - y0;

  const out = [0, 0, 0, 0];
  for (let channel = 0; channel < 4; channel += 1) {
    const a = tile.data[(y0 * tile.width + x0) * 4 + channel];
    const b = tile.data[(y0 * tile.width + x1) * 4 + channel];
    const c = tile.data[(y1 * tile.width + x0) * 4 + channel];
    const d = tile.data[(y1 * tile.width + x1) * 4 + channel];

    out[channel] =
      a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
  }

  return out;
}

/**
 * Draw the tile centred on a square canvas.
 *
 * @param {number} size        Side of the output.
 * @param {number} scale       How much of that side the artwork spans. Less than
 *                             one is the safe zone a mask may eat into.
 * @param {number[]|null} fill Opaque background, or null to leave it clear.
 */
function square(tile, { size, scale, fill }) {
  const out = new PNG({ width: size, height: size });
  const box = Math.round(size * scale);
  // Fitted rather than stretched: the artwork is a few percent off square, and
  // squashing it to fit is the kind of thing nobody sees and everybody feels.
  // What is left over at the sides is the fill, which is the tile's own colour.
  const span = {
    x: tile.width >= tile.height ? box : Math.round((box * tile.width) / tile.height),
    y: tile.height >= tile.width ? box : Math.round((box * tile.height) / tile.width),
  };
  const offset = { x: Math.round((size - span.x) / 2), y: Math.round((size - span.y) / 2) };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = (y * size + x) * 4;

      if (fill) {
        out.data[at] = fill[0];
        out.data[at + 1] = fill[1];
        out.data[at + 2] = fill[2];
        out.data[at + 3] = 255;
      }

      const inX = x - offset.x;
      const inY = y - offset.y;
      if (inX < 0 || inY < 0 || inX >= span.x || inY >= span.y) continue;

      const [r, g, b, a] = sample(
        tile,
        (inX / span.x) * (tile.width - 1),
        (inY / span.y) * (tile.height - 1)
      );

      // Over whatever is already there — which is the fill for the rounded
      // corners the artwork leaves clear, and nothing at all where it does not.
      const alpha = a / 255;
      const behind = out.data[at + 3] / 255;
      const combined = alpha + behind * (1 - alpha);
      if (combined === 0) continue;

      out.data[at] = (r * alpha + out.data[at] * behind * (1 - alpha)) / combined;
      out.data[at + 1] = (g * alpha + out.data[at + 1] * behind * (1 - alpha)) / combined;
      out.data[at + 2] = (b * alpha + out.data[at + 2] * behind * (1 - alpha)) / combined;
      out.data[at + 3] = Math.round(combined * 255);
    }
  }

  return out;
}

function write(file, image) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(image));
  console.log(`  ${path.relative(ROOT, file)}  ${image.width}×${image.height}`);
}

const source = read(SOURCE);
const tile = crop(source, bounds(source));
const fill = ground(tile);
const holes = fillHoles(tile);

console.log(`Source ${path.relative(ROOT, SOURCE)} → artwork ${tile.width}×${tile.height}`);
console.log(`Ground #${fill.map((c) => c.toString(16).padStart(2, '0')).join('')}`);
console.log(`Knocked-out lettering painted in: ${holes} px\n`);

/*
 * Each output, and why it is shaped the way it is.
 *
 * iOS rounds the icon itself, so its copy is filled corner to corner and
 * carries no alpha — a transparent corner there comes out black. Android masks
 * to a circle and may parallax the foreground, so the artwork sits at two
 * thirds on a clear field with the ground given to `adaptiveIcon` in app.json.
 * A maskable PWA icon is cropped to its inner 80%, so it is padded to match;
 * the plain PWA sizes are shown whole and are not.
 */
const outputs = [
  { file: 'assets/images/icon.png', size: 1024, scale: 1, fill, opaque: true },
  { file: 'assets/images/android-icon-foreground.png', size: 1024, scale: 0.66, fill: null },
  { file: 'assets/images/favicon.png', size: 48, scale: 1, fill },
  { file: 'public/icons/pwa-192.png', size: 192, scale: 1, fill },
  { file: 'public/icons/pwa-512.png', size: 512, scale: 1, fill },
  { file: 'public/icons/pwa-maskable-512.png', size: 512, scale: 0.8, fill },
  { file: 'public/icons/favicon.png', size: 48, scale: 1, fill },
  // Kept beside the source as the record of what was generated, which is what
  // this folder has always been for.
  { file: 'assets/images/brand/generated/icon-ios-1024.png', size: 1024, scale: 1, fill, opaque: true },
  { file: 'assets/images/brand/generated/android-foreground-1024.png', size: 1024, scale: 0.66, fill: null },
  { file: 'assets/images/brand/generated/favicon-48.png', size: 48, scale: 1, fill },
  { file: 'assets/images/brand/generated/pwa-192.png', size: 192, scale: 1, fill },
  { file: 'assets/images/brand/generated/pwa-512.png', size: 512, scale: 1, fill },
  { file: 'assets/images/brand/generated/pwa-maskable-512.png', size: 512, scale: 0.8, fill },
];

for (const { file, size, scale, fill: background, opaque } of outputs) {
  const image = square(tile, { size, scale, fill: background });

  // iOS refuses an icon with an alpha channel; every pixel is already opaque
  // where a fill was given, so this only drops the channel itself.
  if (opaque) {
    for (let at = 3; at < image.data.length; at += 4) image.data[at] = 255;
  }

  write(path.join(ROOT, file), image);
}
