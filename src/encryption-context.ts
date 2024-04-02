import { createCipheriv, createDecipheriv, pbkdf2, randomBytes } from 'crypto';

export class EncryptionContext {
    authTagLength = 16;
    iterations = 100000;
    ivLength = 12;
    key: Buffer | null = null;
    keyLength = 32;
    salt = Buffer.from('6cb9de4e18ba892d479d931c979dceaffe5438cfd09a22d5f88baef9eee75cd8', 'hex');

    encrypt(plaintext: string) {
        if (!this.key) {
            throw new Error('Encryption password not set');
        }

        const iv = randomBytes(this.ivLength);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: this.authTagLength });
        const part1 = cipher.update(plaintext, 'utf8');
        const part2 = cipher.final();
        const authTag = cipher.getAuthTag();
        const encrypted = Buffer.concat([iv, authTag, part1, part2]);

        return encrypted.toString('base64');
    }

    decrypt(ciphertext: string) {
        if (!this.key) {
            throw new Error('Encryption password not set');
        }

        const encrypted = Buffer.from(ciphertext, 'base64');
        const iv = encrypted.subarray(0, this.ivLength);
        const authTag = encrypted.subarray(this.ivLength, this.ivLength + this.authTagLength);
        const parts = encrypted.subarray(this.ivLength + this.authTagLength);
        const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
        decipher.setAuthTag(authTag);

        let decrypted;

        try {
            decrypted = Buffer.concat([decipher.update(parts), decipher.final()]);
        } catch {
            throw new Error('Encryption password is wrong');
        }

        return decrypted.toString('utf8');
    }

    setPassword(password: string) {
        this.key = null;

        return new Promise<void>((resolve, reject) => {
            pbkdf2(password, this.salt, this.iterations, this.keyLength, 'sha512', (err, derivedKey) => {
                if (err) {
                    return reject(err);
                }

                this.key = derivedKey;
                return resolve();
            });
        });
    }
}
