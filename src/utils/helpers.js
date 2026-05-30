import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const transactionCache = new Map();

export const reply = (res, requestId, success, data = null, errorCode = '', errorMessage = '') =>
  res.json({ requestId, success, data, errorCode, errorMessage });