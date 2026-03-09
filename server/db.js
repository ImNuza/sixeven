import { createPool, DB_TYPE } from './db/adapter.js'
import './env.js'

export const pool = createPool()
export { DB_TYPE }
