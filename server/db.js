import { createPool, DB_TYPE } from './db/adapter.js'
import dotenv from 'dotenv'

dotenv.config()

export const pool = createPool()
export { DB_TYPE }
