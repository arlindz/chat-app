
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
const connections = require('../server');
const KEY = "key";
router.get('/', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const userId = decoded.id;
        const offset = req.query.offset;
        const limit = req.query.limit;

        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('userId', sql.BigInt, userId);
            request.input('offset', sql.Int, offset);
            request.input('limit', sql.Int, limit);
            const QUERY = `SELECT g.GroupName AS groupName, g.GroupChatId AS groupId
                           FROM Invitations i
                              INNER JOIN GroupChats g
                              ON i.GroupChatId = g.GroupChatId
                           WHERE i.UserId = @userId`;
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
router.post('/invite/:id', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const groupId = req.body.groupId;
        const invitor = decoded.id;
        const invited = req.params.id;

        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('invitor', sql.BigInt, invitor);
            request.input('groupId', sql.BigInt, groupId);
            request.input('invited', sql.BigInt, invited);
            console.log("INVITING");
            console.log(invited, groupId, invitor)
            const QUERY = `BEGIN TRANSACTION;
                             BEGIN TRY
                              DECLARE @CanInvite BIT = CASE WHEN ((SELECT COUNT(*)
                                                                     FROM GroupChatMembers
                                                                     WHERE GroupChatId = @groupId AND UserId = @invitor AND Permission >= 3) = 1 AND
                                                                  (SELECT COUNT(*) 
                                                                   FROM GroupChatMembers 
                                                                   WHERE GroupChatId = @groupId AND UserId = @invited) = 0) THEN 1 ELSE 0 END;
                              IF(@CanInvite = 1)
                              BEGIN
                               INSERT INTO Invitations(UserId, GroupChatId) VALUES (@invited, @groupId);
                               
                               SELECT g.GroupName AS groupName, @groupId AS groupId
                               FROM GroupChats g
                               WHERE g.GroupChatId = @groupId;
                              END
                              COMMIT;
                             END TRY
                             BEGIN CATCH
                               ROLLBACK;
                             END CATCH;`;
            request.query(QUERY, (err, result) => {
                if (err) {
                    res.status(500).send("Internal server error.");
                    console.log(err);
                    return;
                }
                if (result.rowsAffected === 0) {
                    res.status(400).send("Could not accept invitation.");
                    return;
                }
                console.log(result.recordset);
                const key = `${invited},groupchats`;
                if (key in connections && result.recordset !== undefined && result.recordset.length > 0) {
                    connections[key].emit('newInvite', { message: result.recordset });
                }
                res.status(201).json({ message: "Successfully joined groupchat.", response: result.recordset });
            })
        });
    });
});
router.post('/:id', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const groupId = req.params.id;
        const userId = decoded.id;

        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('userId', sql.BigInt, userId);
            request.input('groupId', sql.BigInt, groupId);

            const QUERY = `BEGIN TRANSACTION;
                             BEGIN TRY
                              DECLARE @CanJoin BIT = CASE WHEN ((SELECT COUNT(*) 
                                                                FROM Invitations
                                                                WHERE UserId = @userId AND GroupChatId = @groupId) = 1 AND
                                                                (SELECT COUNT(*)
                                                                 FROM GroupChats
                                                                 WHERE GroupChatId = @groupId AND MaxMembers > Members) = 1
                                                                 AND(SELECT COUNT(*)
                                                                     FROM GroupChatMembers
                                                                     WHERE GroupChatId = @groupId AND UserId = @userId) = 0) THEN 1 ELSE 0 END;
                              IF(@CanJoin = 1)
                              BEGIN

                               INSERT INTO GroupChatMembers(UserId, GroupChatId, Permission) VALUES (@userId, @groupId, 1);
                               UPDATE GroupChats SET Members = Members + 1 WHERE GroupChatId = @groupId;
                               DELETE FROM Invitations WHERE UserId = @userId AND GroupChatId = @groupId;
                               INSERT INTO UnseenMessages(GroupChatId, UserId, UnseenMessagesCount) VALUES(@groupId, @userId, 0);
                               
                               DECLARE @username VARCHAR(30) = (SELECT Username FROM Users WHERE UserId = @userId);
                               INSERT INTO Messages(GroupChatId, Type, Message) VALUES (@groupId, 'Notification', CONCAT(@username, ' has joined the groupchat.'));

                               UPDATE UnseenMessages SET UnseenMessagesCount = UnseenMessagesCount + 1 WHERE GroupChatId = @groupId AND UserId != @userId;

                               SELECT gc.GroupChatId AS groupId, gc.GroupName AS name, 0 AS notifications
                               FROM GroupChats gc
                               WHERE gc.GroupChatId = @groupId;
       
                               SELECT CONCAT(@username, ' has joined the groupchat.') AS Message, 
                                    SCOPE_IDENTITY() AS MessageId, GETDATE() AS CreatedAt, 'Notification' AS Type;
                                    
                               SELECT @username AS Username, @userId AS UserId, 1 AS Permission;

                               SELECT UserId, UnseenMessagesCount
                               FROM UnseenMessages
                               WHERE GroupChatId = @groupId AND UserId != @userId;
                              END
                              COMMIT;
                             END TRY
                             BEGIN CATCH
                               ROLLBACK;
                             END CATCH;`;
            request.query(QUERY, (err, result) => {
                if (err) {
                    res.status(500).send("Internal server error.");
                    console.log(err);
                    return;
                }
                if (result.rowsAffected === 0) {
                    res.status(400).send("Could not accept invitation.");
                    return;
                }
                res.status(201).json({ message: "Successfully joined groupchat.", response: result.recordsets == undefined ? [] : result.recordsets[0] });
                if (groupId in connections) {
                    for (const uid in connections[groupId]) {
                        connections[groupId][uid].emit('pushMessage', { groupId: groupId, message: result.recordsets[1] });
                        connections[groupId][uid].emit('newMember', { groupId: groupId, message: result.recordsets[2] });
                    }
                }
                if (result.recordsets !== undefined && result.recordsets.length != 0) {
                    for (const row of result.recordsets[2]) {
                        const key = `${row.UserId},groupchats`;
                        if (key in connections) {
                            connections[key].emit("newMessage", { groupId: groupId, message: result.recordsets[3] });
                        }
                    }
                }
            })
        });
    });
});
router.delete('/:id', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const groupId = req.params.id;
        const userId = decoded.id;

        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('userId', sql.BigInt, userId);
            request.input('groupId', sql.BigInt, groupId);

            const QUERY = `DELETE FROM Invitations WHERE UserId = @userId AND GroupChatId = @groupId;`;

            request.query(QUERY, (err, result) => {
                if (err) {
                    res.status(500).send("Internal server error.");
                    console.log(err);
                    return;
                }
                if (result.rowsAffected === 0) {
                    res.status(400).send("Could not reject invitation.");
                    return;
                }
                res.status(204).json({ message: "Successfully rejected invitation." });
            })
        });
    });
});
module.exports = router
