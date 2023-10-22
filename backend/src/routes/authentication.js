
const express = require('express');
const router = express.Router();
const sql = require("mssql/msnodesqlv8");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const SALT = "salt";
const KEY = "key";
const config = {
    database: 'ChatApp',
    server: 'DESKTOP-8HBAVK7',
    driver: 'msnodesqlv8',
    options: {
        trustedConnection: true
    }
};

// Define your router endpoints here
router.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    console.log(req.body);
    if (password === undefined || username === undefined || password.length < 6) {
        res.status(400).send("Not all information was provided.");
        return;
    }
    const hashedPassword = crypto.pbkdf2Sync(password, SALT, 100000, 64, 'sha512').toString('hex');
    sql.connect(config, (err) => {
        if (err) {
            res.status(500).send("Internal server error.");
            return;
        }
        const request = new sql.Request();
        request.input('username', sql.VarChar, username);
        request.input('password', sql.VarChar, hashedPassword);
        const QUERY = `SELECT Username, UserId FROM Users WHERE username = @username AND password = @password`;
        request.query(QUERY, (err, result) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            if (result.recordset.length === 0) {
                res.status(403).send("Invalid credentials.");
                return;
            }
            const user = result.recordset[0];
            const t = { username: user.Username, id: user.UserId };
            const token = jwt.sign(t, KEY, { expiresIn: 86400 });
            res.status(200).send({ auth: true, token: token, username: user.Username, userId: user.UserId });
        })
    });
});
router.post('/register', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const email = req.body.email;
    if (email === null || password === null || username === null) {
        res.status(400).json({ message: "Invalid information provided." });
        return;
    }
    if (email === undefined || password === undefined || username === undefined || password.length < 6) {
        res.status(400).json({ message: "Not all information was provided." });
        return;
    }
    const hashedPassword = crypto.pbkdf2Sync(password, "salt", 100000, 64, 'sha512').toString('hex');
    sql.connect(config, function (err) {
        if (err) {
            res.status(500).json({ message: "Internal server error." });
            return;
        }

        const request = new sql.Request();
        request.input('username', sql.VarChar, username);
        request.input('password', sql.VarChar, hashedPassword);
        request.input('email', sql.VarChar, email);
        const QUERY = `INSERT INTO Users(Username, Password, Email) VALUES (@username, @password, @email);`;
        request.query(QUERY, (err, recordset) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            if (recordset.rowsAffected[0] === 0) {
                res.status(403).send("Invalid credentials.");
                return;
            }
            res.status(201).json({ message: "User created." })
        })
    });
});

module.exports = router;
