/**
 * Generate a valid JWT token for testing
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const token = jwt.sign(
  {
    id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
    email: 'stefanogebara@gmail.com'
  },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
);

console.log('Generated JWT Token:');
console.log(token);
