import mysql from 'mysql2/promise'

const pool = mysql.createPool({
    host: process.env.HZ_TAK_DB_HOST || 'localhost',
    port: parseInt(process.env.HZ_TAK_DB_PORT || '3306'),
    database: process.env.HZ_TAK_DB_NAME || 'zaikodb',
    user: process.env.HZ_TAK_DB_USER || 'root',
    password: process.env.HZ_TAK_DB_PASSWORD || 'root',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 2000,
})

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
    try {
        const [rows] = await pool.execute(text, params as mysql.RowDataPacket[])
        return rows as T[]
    } catch (error) {
        console.error('Database query failed:', {
            text,
            params,
            error: error instanceof Error ? error.message : String(error)
        })
        throw error
    }
}

export default pool
