-- Unsafe SQL patterns

-- 1. Unprotected update/delete (no WHERE)
UPDATE users SET role = 'admin';
DELETE FROM users;

-- 2. SQL command execution injection
EXEC xp_cmdshell 'dir';

-- 3. Hardcoded / inline SQL injection-prone patterns
SELECT * FROM users WHERE username = 'admin' OR '1'='1';


-- Safe SQL patterns
UPDATE users SET role = 'admin' WHERE id = 42;
DELETE FROM users WHERE id = 10;
SELECT * FROM users WHERE username = ?;
