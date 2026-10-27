// Abrevia 1 — httpSMS Native End-to-End Encryption (E2EE) Cipher
// Implements AES-256-CFB with SHA-256 key derivation matching httpSMS Android specification
import { randomBytes, createCipheriv, createHash, createDecipheriv } from 'node:crypto';
import { Buffer } from 'node:buffer';

/**
 * Derives a strict 256-bit (32-byte) key from any passphrase using SHA-256.
 * @param {string} key
 * @returns {Buffer}
 */
function hashKey(key) {
    return createHash('sha256').update(String(key)).digest();
}

/**
 * Encrypts a plaintext message using AES-256-CFB matching httpSMS's Android gateway specification.
 * Returns a Base64-encoded string containing the 16-byte IV prepended to the ciphertext.
 *
 * @param {string} key - The encryption passphrase configured in httpSMS Android app
 * @param {string} message - Plaintext message to encrypt
 * @returns {string} - Base64 ciphertext
 */
export function encryptMessage(key, message) {
    if (!key || !message) return message;
    try {
        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-cfb', hashKey(key), iv).setAutoPadding(false);
        return Buffer.concat([
            iv,
            cipher.update(String(message), 'utf8'),
            cipher.final()
        ]).toString('base64');
    } catch (err) {
        console.error('[Cipher] Encryption error:', err.message);
        return message;
    }
}

/**
 * Decrypts an incoming Base64 ciphertext using AES-256-CFB matching httpSMS's Android gateway specification.
 * Extracts the 16-byte IV from the front and decrypts the remainder.
 *
 * @param {string} key - The encryption passphrase configured in httpSMS Android app
 * @param {string} base64Message - Base64 ciphertext from httpSMS
 * @returns {string} - Decrypted UTF-8 plaintext
 */
export function decryptMessage(key, base64Message) {
    if (!key || !base64Message) return base64Message;
    try {
        const cipherBytes = Buffer.from(base64Message, 'base64');
        if (cipherBytes.length < 17) {
            // Not a valid ciphertext (must have at least 16-byte IV + 1 byte data)
            return base64Message;
        }
        const iv = cipherBytes.subarray(0, 16);
        const decipher = createDecipheriv('aes-256-cfb', hashKey(key), iv).setAutoPadding(false);
        return Buffer.concat([
            decipher.update(cipherBytes.subarray(16)),
            decipher.final()
        ]).toString('utf8');
    } catch (err) {
        console.warn('[Cipher] Decryption failed (content may be plaintext), returning raw:', err.message);
        return base64Message;
    }
}
