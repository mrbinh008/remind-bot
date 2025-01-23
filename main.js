import TelegramBot from 'node-telegram-bot-api';
import cron from 'node-cron';
import moment from 'moment-timezone';
import sqlite3 from 'sqlite3';
import schedule from 'node-schedule';

// Initialize bot with token
const bot = new TelegramBot(process.env.BOT_TOKEN, {polling: true});

// Open SQLite database
const db = new sqlite3.Database('./bot.sqlite');

// Save group and user to the database when the bot is added to a group
const saveGroupAndUser = (msg) => {
    const chatId = msg.chat.id;
    const username = '@' + msg.from.username;

    // Save group to groups table if not exists
    db.get('SELECT id FROM groups WHERE chat_id = ?', [chatId], (err, row) => {
        if (!row) {
            db.run('INSERT INTO groups (chat_id, name) VALUES (?, ?)', [chatId, msg.chat.title || msg.chat.username || 'Unnamed Group']);
        }
    });

    // Save user to users table if not exists
    db.get('SELECT id FROM users WHERE chat_id = ? AND username = ?', [chatId, username], (err, row) => {
        if (!row) {
            db.run('INSERT INTO users (chat_id, username) VALUES (?, ?)', [chatId, username]);
        }
    });
};

// Send reminder
const sendReminder = async (groupId, text) => {
    db.all('SELECT username FROM users WHERE chat_id = ?', [groupId], (err, rows) => {
        if (err) {
            console.error('Error fetching users:', err);
            return;
        }

        const usernames = [...new Set(rows.map(row => row.username.startsWith('@') ? row.username : `@${row.username}`))].join(' ');
        const message = [usernames, text].filter(Boolean).join(' ');

        bot.sendMessage(groupId, message);
    });
};

// Daily reminder schedule
cron.schedule('* * * * *', () => {
    const currentTime = moment().tz('Asia/Ho_Chi_Minh').format('HH:mm');

    db.all('SELECT * FROM reminders WHERE time = ?', [currentTime], (err, rows) => {
        if (err) {
            console.error('Error querying reminders:', err);
            return;
        }

        rows.forEach(({group_id, text}) => {
            db.get('SELECT chat_id FROM groups WHERE id = ?', [group_id], (err, groupRow) => {
                if (err) {
                    console.error('Error fetching group info:', err);
                    return;
                }

                sendReminder(groupRow.chat_id, text);
            });
        });
    });
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

// /start command to greet users
bot.onText(/\/start/, async (msg) => {
    saveGroupAndUser(msg);
    await bot.sendMessage(msg.chat.id, 'Hello! Use /remind HH:MM "Content" to set a daily reminder.');
});

// /remind command to set a reminder for users or groups
bot.onText(/\/remind (\d{2}:\d{2}) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const time = match[1];
    const text = match[2];
    const member = await bot.getChatMember(chatId, msg.from.id);
    if (member.status !== 'administrator' && member.status !== 'creator') {
        await bot.sendMessage(chatId, 'You do not have permission to cancel reminders.');
        return;
    }
    const [hour, minute] = time.split(':').map(Number);

    const reminderTime = moment.tz({hour, minute}, 'Asia/Ho_Chi_Minh');
    db.get('SELECT id FROM users WHERE chat_id = ? AND username = ?', [chatId, msg.from.username], (err, userRow) => {
        if (!userRow) {
            bot.sendMessage(chatId, 'You are not registered. Please try again!');
            return;
        }

        db.get('SELECT id FROM groups WHERE chat_id = ?', [chatId], (err, groupRow) => {
            if (!groupRow) {
                bot.sendMessage(chatId, 'Group is not registered. Please try again!');
                return;
            }

            // Create new reminder and save to reminders table
            db.run('INSERT INTO reminders (user_id, group_id, time, text) VALUES (?, ?, ?, ?)', [userRow.id, groupRow.id, time, text], (err) => {
                if (err) {
                    console.error(err);
                    return;
                }

                schedule.scheduleJob({hour: reminderTime.hours(), minute: reminderTime.minutes()}, () => {
                    sendReminder(groupRow.chat_id, text);
                });

                bot.sendMessage(chatId, `New reminder set at ${time} with content: "${text}".`);
            });
        });
    });
});

// /editremind command to edit a reminder
bot.onText(/\/editremind (\d{2}:\d{2}) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const time = match[1];
    const text = match[2];
    const [hour, minute] = time.split(':').map(Number);

    const reminderTime = moment.tz({hour, minute}, 'Asia/Ho_Chi_Minh');

    const member = await bot.getChatMember(chatId, msg.from.id);
    if (member.status !== 'administrator' && member.status !== 'creator') {
        await bot.sendMessage(chatId, 'You do not have permission to cancel reminders.');
        return;
    }

    db.get('SELECT id FROM users WHERE chat_id = ? AND username = ?', [chatId, msg.from.username], (err, userRow) => {
        if (!userRow) return;

        db.get('SELECT id FROM groups WHERE chat_id = ?', [chatId], (err, groupRow) => {
            if (!groupRow) return;

            // Update reminder
            db.run('UPDATE reminders SET time = ?, text = ? WHERE user_id = ? AND group_id = ?', [time, text, userRow.id, groupRow.id], (err) => {
                if (err) return;

                schedule.scheduleJob({hour: reminderTime.hours(), minute: reminderTime.minutes()}, () => {
                    sendReminder(groupRow.chat_id, `Edited reminder: ${text}`);
                });

                bot.sendMessage(chatId, `Reminder edited to ${time} with content: "${text}".`);
            });
        });
    });
});

// /cancelremind command to cancel a reminder
bot.onText(/\/cancelremind/, async (msg) => {
    const chatId = msg.chat.id;
    const member = await bot.getChatMember(chatId, msg.from.id);
    if (member.status !== 'administrator' && member.status !== 'creator') {
        await bot.sendMessage(chatId, 'You do not have permission to cancel reminders.');
        return;
    }

    db.get('SELECT id FROM users WHERE chat_id = ? AND username = ?', [chatId, msg.from.username], (err, userRow) => {
        if (!userRow) return;

        db.get('SELECT id FROM groups WHERE chat_id = ?', [chatId], (err, groupRow) => {
            if (!groupRow) return;

            db.run('DELETE FROM reminders WHERE user_id = ? AND group_id = ?', [userRow.id, groupRow.id], (err) => {
                if (err) return;

                bot.sendMessage(chatId, 'Your reminder has been canceled.');
            });
        });
    });
});

// /tagall command to tag all users in the group
bot.onText(/\/tagall/, (msg) => {
    const chatId = msg.chat.id;

    db.all('SELECT username FROM users WHERE chat_id = ?', [chatId], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }

        const usernames = [...new Set(rows.map(row => row.username.startsWith('@') ? row.username : `@${row.username}`))].join(' ');

        bot.sendMessage(chatId, usernames.length > 0 ? usernames : 'No members to tag.');
    });
});

// /adduser command to add a user to the database
bot.onText(/\/adduser (@\w+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const usernameToAdd = match[1].replace('@', '');

    bot.getChatMember(chatId, msg.from.id).then((member) => {
        if (member.status === 'administrator' || member.status === 'creator') {
            db.get('SELECT id FROM users WHERE chat_id = ? AND username = ?', [chatId, usernameToAdd], (err, row) => {
                if (!row) {
                    db.run('INSERT INTO users (chat_id, username) VALUES (?, ?)', [chatId, usernameToAdd]);
                    bot.sendMessage(chatId, `Member ${usernameToAdd} added to the list.`);
                } else {
                    bot.sendMessage(chatId, `Member ${usernameToAdd} already exists in the list.`);
                }
            });
        } else {
            bot.sendMessage(chatId, 'You do not have permission to add members.');
        }
    });
});

// /removeuser command to remove a user from the database
bot.onText(/\/removeuser (@\w+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const usernameToRemove = match[1].replace('@', '');

    bot.getChatMember(chatId, msg.from.id).then((member) => {
        if (member.status === 'administrator' || member.status === 'creator') {
            db.run('DELETE FROM users WHERE chat_id = ? AND username = ?', [chatId, usernameToRemove]);
            bot.sendMessage(chatId, `Member ${usernameToRemove} removed from the list.`);
        } else {
            bot.sendMessage(chatId, 'You do not have permission to remove members.');
        }
    });
});