const mysql = require("mysql2/promise");

/*
    AICEE database connection
    - Local development: DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
    - Railway MySQL: MYSQLHOST / MYSQLPORT / MYSQLUSER / MYSQLPASSWORD / MYSQLDATABASE
*/
const db = mysql.createPool({
    host: process.env.DB_HOST || process.env.MYSQLHOST,
    user: process.env.DB_USER || process.env.MYSQLUSER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE,
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
    queueLimit: 0
});

async function testConnection() {
    try {
        const connection = await db.getConnection();
        console.log("✅ Connected to MySQL database!");
        connection.release();
    } catch (err) {
        console.error("❌ Database connection failed:", err.message);
    }
}

testConnection();

module.exports = db;
