import crypto from 'crypto';

export function generateManageToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
