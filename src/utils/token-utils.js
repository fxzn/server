import bcrypt from 'bcrypt';
import crypto from 'crypto';

export const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex'); // Token random 64 karakter
};

export const hashToken = async (token) => {
  return await bcrypt.hash(token, 10); // Hash dengan salt round 10
};

export const compareTokens = async (inputToken, hashedToken) => {
  return await bcrypt.compare(inputToken, hashedToken);
};