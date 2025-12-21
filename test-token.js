import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const userId = 'a483a979-cf85-481d-b65b-af396c2c513a';
const email = 'stefanogebara@gmail.com';

const token = jwt.sign(
  { userId, email },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
);

console.log(token);
