import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, 'base64') : null;

export function encrypt(text) {
  if (!text) return null;
  if (!KEY) {
    console.warn('ENCRYPTION_KEY environment variable is not configured. Returning plaintext (INSECURE).');
    return text;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText) {
  if (!encryptedText) return null;
  if (!KEY) {
    console.warn('ENCRYPTION_KEY environment variable is not configured. Returning plaintext (INSECURE).');
    return encryptedText;
  }
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    // Return plaintext if it's not in iv:authTag:encrypted format
    return encryptedText;
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
