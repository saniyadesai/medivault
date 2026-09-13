import crypto from 'crypto';

// -- Appwrite path: single-pass AES-256-GCM (no chunking) --
export function encryptFile(buffer) {
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [12-byte IV][16-byte authTag][ciphertext]
  const blob = Buffer.concat([iv, tag, encrypted]);
  return { dekWrapped: dek.toString('base64'), dekIv: iv.toString('base64'), blob, checksum };
}

export function decryptFile(encryptedBuf, dekWrappedB64) {
  const dek = Buffer.from(dekWrappedB64, 'base64');
  const iv = encryptedBuf.subarray(0, 12);
  const tag = encryptedBuf.subarray(12, 28);
  const ct = encryptedBuf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', dek, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}
