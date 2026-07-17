import * as fs from 'fs';
import bcrypt from 'bcryptjs';
function loadUsers() {
    const usersFile = process.env.USERS_FILE;
    if (!usersFile || !fs.existsSync(usersFile))
        return null;
    try {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
        if (typeof data !== 'object' || data === null || Array.isArray(data))
            return null;
        return data;
    }
    catch {
        return null;
    }
}
export function usersFileAvailable() {
    return loadUsers() !== null;
}
export function verifyUser(email, password) {
    const users = loadUsers();
    if (!users)
        return false;
    const hash = users[email];
    if (!hash) {
        bcrypt.compareSync(password, '$2b$10$C6UzMDM.H6dfI/f/IKcEeO7ZUr5xkcSSD1G0nDkfLTVVLZeFJ8LG2');
        return false;
    }
    try {
        return bcrypt.compareSync(password, hash);
    }
    catch {
        return false;
    }
}
