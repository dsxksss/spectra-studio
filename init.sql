-- init.sql
-- 如果使用了 MYSQL_DATABASE 环境变量，这里不需要创建库，直接建表即可
-- 这里为了保险，加上了判断
CREATE DATABASE IF NOT EXISTS test;

USE test;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100)
);

INSERT INTO
    users (username, email)
VALUES (
        'zhangsan',
        'zhangsan@example.com'
    ),
    ('lisi', 'lisi@example.com'),
    (
        'wangwu',
        'wangwu@example.com'
    );