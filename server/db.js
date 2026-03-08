import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Require SSL in production; allow plain-text locally
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
})
