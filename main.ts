// main.ts — entrypoint staging bounty "news-image-20261124".
//
// Tugas skrip ini:
//   1. Baca entry.png yang terletak di folder yang sama dengan skrip ini.
//   2. Pastikan file ada, tidak kosong, dan benar-benar file PNG
//      (diperiksa lewat 8 byte magic PNG).
//   3. Salin ke /output/entry.png (buat folder /output bila belum ada).
//   4. Verifikasi salinan byte-per-byte terhadap aslinya via SHA-256;
//      bila hash tidak cocok, gagal dengan pesan yang jelas (exit 1).
//
// Dijalankan dengan: node main.ts

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ENTRY_NAME = 'entry.png';
const OUTPUT_DIR = '/output';
const OUTPUT_PATH = path.join(OUTPUT_DIR, ENTRY_NAME);

// PNG file signature: 8 magic bytes 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function sha256Hex(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node main.ts [--dry-run] [--help]\n' +
        '\n' +
        'Stages the bounty entry image (entry.png next to this script) to /output/entry.png.\n' +
        'Validates that the file exists, is non-empty, is a real PNG (magic bytes + IHDR),\n' +
        'then verifies the staged copy byte-for-byte via SHA-256.\n' +
        '\n' +
        'Options:\n' +
        '  --dry-run   Validate only; do not write anything to /output.\n' +
        '  --help, -h  Show this help and exit.'
    );
    return;
  }
  const dryRun = args.includes('--dry-run');
  const unknown = args.filter((a) => a !== '--dry-run');
  if (unknown.length > 0) {
    fail(`unknown argument(s): ${unknown.join(' ')} (see --help)`);
  }

  const sourcePath = path.join(__dirname, ENTRY_NAME);

  if (!fs.existsSync(sourcePath)) {
    fail(`entry image not found: ${sourcePath}`);
  }

  const data = fs.readFileSync(sourcePath);
  if (data.length === 0) {
    fail(`entry image is empty (0 bytes): ${sourcePath}`);
  }
  if (data.length < PNG_MAGIC.length || !data.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    fail(`entry image is not a PNG file (bad magic bytes): ${sourcePath}`);
  }

  // Sanity check: a real 1024x1024 entry is hundreds of KB. Anything under
  // 1 KB is almost certainly truncated or a placeholder, so reject it early
  // instead of staging a broken image.
  const MIN_SIZE_BYTES = 1024;
  if (data.length < MIN_SIZE_BYTES) {
    fail(
      `entry image suspiciously small (${data.length} bytes, minimum ${MIN_SIZE_BYTES}): ${sourcePath}`
    );
  }

  // Parse the IHDR chunk (offset 8: 4-byte length + 4-byte type "IHDR",
  // then width/height as uint32 big-endian). This catches a file that has
  // the right magic bytes but a corrupt or truncated PNG header.
  if (data.length < 24) {
    fail(`entry image too short for a PNG IHDR chunk (${data.length} bytes): ${sourcePath}`);
  }
  const ihdrLength = data.readUInt32BE(8);
  const ihdrType = data.subarray(12, 16).toString('ascii');
  if (ihdrLength !== 13 || ihdrType !== 'IHDR') {
    fail(
      `entry image has a corrupt PNG header (first chunk "${ihdrType}", length ${ihdrLength}): ${sourcePath}`
    );
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width === 0 || height === 0) {
    fail(`entry image has invalid PNG dimensions (${width}x${height}): ${sourcePath}`);
  }
  console.log(`PNG header OK: ${width}x${height}, ${data.length} bytes`);

  if (dryRun) {
    console.log(
      `DRY RUN: ${ENTRY_NAME} (${data.length} bytes, SHA-256 ${sha256Hex(data)}) ` +
        `would be staged to ${OUTPUT_PATH} (nothing written)`
    );
    return;
  }

  // Staging can fail if /output cannot be created or is not writable —
  // report that as its own clear error instead of a bare stack trace.
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.copyFileSync(sourcePath, OUTPUT_PATH);
  } catch (err) {
    fail(
      `cannot stage entry image to ${OUTPUT_PATH}: ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
  }

  let copy: Buffer;
  try {
    copy = fs.readFileSync(OUTPUT_PATH);
  } catch (err) {
    fail(
      `cannot read back staged copy ${OUTPUT_PATH}: ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
  }
  const sourceHash = sha256Hex(data);
  const copyHash = sha256Hex(copy);
  if (sourceHash !== copyHash) {
    fail(
      `copy verification failed: SHA-256 mismatch for ${OUTPUT_PATH} ` +
        `(source ${sourceHash} != copy ${copyHash})`
    );
  }

  console.log(
    `OK: ${ENTRY_NAME} (${data.length} bytes, SHA-256 ${sourceHash}) staged to ${OUTPUT_PATH}`
  );
}

main();
