import sqlite3 from 'sqlite3';
import fs from 'fs';

// Kiểm tra nếu file cơ sở dữ liệu đã tồn tại
const dbPath = './bot.sqlite';
if (!fs.existsSync(dbPath)) {
    // Tạo cơ sở dữ liệu mới nếu chưa tồn tại
    const db = new sqlite3.Database(dbPath);

    // Tạo bảng groups để lưu thông tin nhóm
    db.run(`CREATE TABLE IF NOT EXISTS groups
            (
                id
                INTEGER
                PRIMARY
                KEY
                AUTOINCREMENT,
                chat_id
                INTEGER
                UNIQUE,
                name
                TEXT
            )`, (err) => {
        if (err) {
            console.error("Lỗi khi tạo bảng groups:", err);
        } else {
            console.log("Bảng groups đã được tạo.");
        }
    });

    // Tạo bảng users để lưu thông tin người dùng
    db.run(`CREATE TABLE IF NOT EXISTS users
    (
        id
        INTEGER
        PRIMARY
        KEY
        AUTOINCREMENT,
        chat_id
        INTEGER,
        username
        TEXT,
        UNIQUE
            (
        chat_id,
        username
            )
        )`, (err) => {
        if (err) {
            console.error("Lỗi khi tạo bảng users:", err);
        } else {
            console.log("Bảng users đã được tạo.");
        }
    });

    // Tạo bảng reminders để lưu thông tin lời nhắc
    db.run(`CREATE TABLE IF NOT EXISTS reminders
    (
        id
        INTEGER
        PRIMARY
        KEY
        AUTOINCREMENT,
        user_id
        INTEGER,
        group_id
        INTEGER,
        time
        TEXT,
        text
        TEXT,
        FOREIGN
        KEY
            (
        user_id
            ) REFERENCES users
            (
                id
            ),
        FOREIGN KEY
            (
                group_id
            ) REFERENCES groups
            (
                id
            )
        )`, (err) => {
        if (err) {
            console.error("Lỗi khi tạo bảng reminders:", err);
        } else {
            console.log("Bảng reminders đã được tạo.");
        }
    });

    // Đóng cơ sở dữ liệu sau khi tạo bảng
    db.close((err) => {
        if (err) {
            console.error("Lỗi khi đóng cơ sở dữ liệu:", err);
        } else {
            console.log("Cơ sở dữ liệu đã được tạo thành công.");
        }
    });
} else {
    console.log("Cơ sở dữ liệu đã tồn tại.");
}
