
const express = require('express');
const router = express.Router();
const sql = require("mssql/msnodesqlv8");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const config = {
    database: 'ChatApp',
    server: 'DESKTOP-8HBAVK7',
    driver: 'msnodesqlv8',
    options: {
        trustedConnection: true
    }
};
const KEY = "key";
router.get('/search', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const userId = decoded.id;
        const offset = req.query.offset;
        const limit = req.query.limit;
        const query = req.query.q;
        console.log(userId, offset, limit, query);
        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('userId', sql.BigInt, userId);
            request.input('offset', sql.Int, offset);
            request.input('limit', sql.Int, limit);
            request.input('query', sql.VarChar, query);

            const QUERY = `SELECT u.Username, u.UserId
                           FROM Users u
                           WHERE u.Username LIKE CONCAT('%', @query, '%')
                           ORDER BY u.UserId
                           OFFSET @offset ROWS
                           FETCH NEXT @limit ROWS ONLY;`;
            request.query(QUERY, (err, result) => {
                if (err) {
                    res.status(500).send("Internal server error.");
                    console.log(err);
                    return;
                }
                const response = { message: "Successfully retrieved groupchats.", response: result.recordset };

                res.status(200).json(response);
            })
        });
    });
});
module.exports = router;