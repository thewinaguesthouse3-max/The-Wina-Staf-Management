import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../src/domain/types';

// In-memory random fallback when SESSION_SECRET env var is not configured
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function hashSecretCode(code: string): string {
  return hashPassword(code.trim());
}

export function verifySecretCode(code: string, storedHash: string): boolean {
  if (!code.trim() || !storedHash) return false;
  return verifyPassword(code.trim(), storedHash);
}

export interface SessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  exp: number;
}

export function signSessionToken(
  payload: Omit<SessionPayload, 'exp'>,
  ttlSeconds = 60 * 60 * 24 * 7
): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as SessionPayload;
    if (!decoded.userId || !decoded.role || typeof decoded.exp !== 'number') {
      return null;
    }
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function validateSafePhotoUrl(input: unknown): string {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/src/assets/images/') && !trimmed.includes('..')) {
    return trimmed;
  }
  const allowedDataPrefixes = [
    'data:image/jpeg;base64,',
    'data:image/jpg;base64,',
    'data:image/png;base64,',
    'data:image/webp;base64,',
  ];
  const isAllowedData = allowedDataPrefixes.some((prefix) =>
    trimmed.toLowerCase().startsWith(prefix)
  );
  if (isAllowedData && trimmed.length <= 3_000_000) {
    return trimmed;
  }
  return '';
}

export interface AuthenticatedRequest extends Request {
  auth?: SessionPayload;
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export function createAuthMiddleware(
  getUserStatus: (userId: string) => { role: UserRole; status: string } | null
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan login.' });
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Sesi telah berakhir. Silakan login kembali.' });
      return;
    }
    const currentUser = getUserStatus(payload.userId);
    if (!currentUser || currentUser.status !== 'Approved') {
      res.status(403).json({ error: 'Akun tidak aktif atau menunggu persetujuan Owner.' });
      return;
    }
    req.auth = { ...payload, role: currentUser.role };
    next();
  };
}

export function requireOwner(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.auth || req.auth.role !== 'OWNER') {
    res.status(403).json({ error: 'Akses ditolak. Khusus Owner.' });
    return;
  }
  next();
}
