
const express = require('express');
const router = express.Router();
const sql = require("mssql/msnodesqlv8");
const jwt = require("jsonwebtoken");

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
router.post('/', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const userId = decoded.id;

        const groupName = req.body.groupName, maxMembers = req.body.maxMembers;
        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('userId', sql.BigInt, userId);
            request.input('groupName', sql.VarChar, groupName);
            request.input('maxMembers', sql.Int, maxMembers)

            const QUERY = `BEGIN TRANSACTION;
                             BEGIN TRY
                              INSERT INTO GroupChats(GroupName, Members, MaxMembers) VALUES(@groupName, 1, @maxMembers);
                              DECLARE @GroupId BIGINT = SCOPE_IDENTITY();
                              INSERT INTO GroupChatMembers(GroupChatId, UserId, Permission) VALUES (@GroupId, @userId, 4);
                              INSERT INTO UnseenMessages(UserId, GroupChatId, UnseenMessagesCount) VALUES (@userId, @GroupId, 0);
                    
                              SELECT @GroupId AS groupId, @groupName AS name, 0 AS notifications
                    
                              COMMIT;
                             END TRY
                             BEGIN CATCH
                              ROLLBACK;
                             END CATCH;
                            `;
            request.query(QUERY, (err, result) => {
                if (err) {
                    res.status(500).send("Internal server error.");
                    console.log(err);
                    return;
                }
                if (result.rowsAffected === 0) {
                    res.status(400).send("Could not create groupchat.");
                    return;
                }

                const response = { message: "Successfully created groupchat.", response: result.recordset };

                res.status(201).json(response);
            })
        });
    });
});
router.delete('/members/:id', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const userId = decoded.id;
        const groupChatId = req.body.groupId;
        const userToKick = req.params.id;

        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('userId', sql.BigInt, userId);
            request.input('groupId', sql.BigInt, groupChatId);
            request.input('userToKick', sql.BigInt, userToKick);

            const QUERY = `BEGIN TRANSACTION;
                            BEGIN TRY
                             DECLARE @Kicking BIT = CASE WHEN ((SELECT Permission
                                                             FROM GroupChatMembers
                                                             WHERE UserId = @userId AND GroupChatId = @groupId) > 
                                                             (SELECT Permission 
                                                             FROM GroupChatMembers
                                                             WHERE UserId = @userToKick AND GroupChatId = @groupId)) THEN 1 ELSE 0 END; 
                            DECLARE @Leaving BIT = CASE WHEN ((@userId = @userToKick) AND 
                                                             (SELECT COUNT(*) 
                                                             FROM GroupChatMembers
                                                             WHERE GroupChatId = @groupId AND UserId = @userId) = 1) THEN 1 ELSE 0 END;
                             IF(@Kicking = 1 OR @Leaving = 1)
                             BEGIN 
                               DECLARE @perm INT = (SELECT Permission FROM GroupChatMembers WHERE UserId = @userToKick AND GroupChatId = @groupId);
  
                               DELETE FROM GroupChatMembers WHERE UserId = @userToKick AND GroupChatId = @groupId;
                               DELETE FROM UnseenMessages WHERE UserId = @userToKick AND GroupChatId = @groupId;

                               UPDATE GroupChats SET Members = Members - 1 WHERE GroupChatId = @groupId;

                               DECLARE @memberCount INT = (SELECT Members FROM GroupChats WHERE GroupChatId = @groupId);
                               IF(@memberCount = 0)
                                BEGIN 
                                 DELETE FROM GroupChats WHERE GroupChatId = @groupId;
                                END
                               ELSE
                                BEGIN
                                 DECLARE @kickingUsername VARCHAR(30) = (SELECT Username FROM Users WHERE UserId = @userId);
                                 IF(@Kicking = 1)
                                 BEGIN
                                   DECLARE @kickedUsername VARCHAR(30) = (SELECT Username FROM Users WHERE UserId = @userToKick);

                                   INSERT INTO Messages(GroupChatId, Type, Message) VALUES (@groupId, 'Notification', CONCAT(@kickingUsername, ' has kicked ', @kickedUsername, ' from the groupchat.'));

                                   SELECT CONCAT(@kickingUsername, ' has kicked ', @kickedUsername, ' from the groupchat.') AS Message, 
                                          SCOPE_IDENTITY() AS MessageId, GETDATE() AS CreatedAt, 'Notification' AS Type;
                                 END
                                 ELSE
                                 BEGIN
                                   INSERT INTO Messages(GroupChatId, Type, Message) VALUES(@groupId, 'Notification', CONCAT(@kickingUsername, ' has left the groupchat.'));
                                   UPDATE UnseenMessages SET UnseenMessagesCount = UnseenMessagesCount + 1 WHERE GroupChatId = @groupId AND UserId != @userId;

                                   SELECT CONCAT(@kickingUsername, ' has left the groupchat.') AS Message, 
                                          SCOPE_IDENTITY() AS MessageId, GETDATE() AS CreatedAt, 'Notification' AS Type;
                                 END
                                 SELECT UserId, UnseenMessagesCount AS unseenMessages
                                 FROM UnseenMessages
                                 WHERE GroupChatId = @groupId;
                                END
                               IF(@perm = 4)
                               BEGIN
                                 DECLARE @userToPromote BIGINT = (SELECT MIN(UserId) 
                                                                 FROM (SELECT UserId
                                                                       FROM GroupChatMembers
                                                                       WHERE GroupChatId = @groupId AND Permission = (SELECT MAX(Permission) FROM GroupChatMembers WHERE GroupChatId = @groupId)) s);
                                 UPDATE GroupChatMembers SET Permission = 4 WHERE UserId = @userToPromote AND GroupChatId = @groupId;
                               END
                                 
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
                if (result.rowsAffected[0] == 0) {
                    res.status(403).json({ message: "You can't delete this user." });
                    return;
                }
                res.status(204).json({ message: "Successfully deleted user from the groupchat." });
                console.log(result.recordsets);
                const key = `${userToKick},groupchats`;
                if (result.recordset != undefined) {
                    if (groupChatId in connections) {
                        for (const uid in connections[groupChatId]) {
                            if (uid != userToKick) {
                                connections[groupChatId][uid].emit('pushMessage', { groupId: groupChatId, message: result.recordsets[0] })
                                connections[groupChatId][uid].emit('removedMember', { userId: userToKick });
                            }
                        }
                    }
                }
                if (result.recordsets != undefined && result.recordsets.length != 0) {
                    for (const row of result.recordsets[1]) {
                        const k = `${row.UserId},groupchats`;
                        console.log("checking if " + k + " is in connections")
                        if (k in connections) {
                            console.log("emiting...");
                            connections[k].emit('groupchatNewMessage', { groupId: groupChatId, unseenMessages: row.unseenMessages });
                        }
                    }
                }
                if (key in connections) {
                    connections[key].emit('kickedFromGroupChat', { groupId: groupChatId });
                }
            })
        });
    });
});
router.put('/notifications/:id', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const userId = decoded.id;
        const groupChatId = req.params.id;
        const notifications = req.body.notifications;

        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('userId', sql.BigInt, userId);
            request.input('groupId', sql.BigInt, groupChatId);
            request.input('notifications', sql.Int, notifications);
            const QUERY = `UPDATE UnseenMessages SET UnseenMessagesCount = @notifications WHERE GroupChatId = @groupId AND UserId = @userId;`;

            request.query(QUERY, (err, result) => {
                if (err) {
                    res.status(500).send("Internal server error.");
                    console.log(err);
                    return;
                }
                res.status(200).json({ message: "Successfully updated the notifications." });
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
        const userId = decoded.id;
        const groupChatId = req.params.id;

        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('userId', sql.BigInt, userId);
            request.input('groupId', sql.BigInt, groupChatId);

            const QUERY = `BEGIN TRANSACTION;
                            BEGIN TRY
                             DECLARE @CanDelete BIT = CASE WHEN (SELECT COUNT(*)
                                                                 FROM GroupChatMembers
                                                                 WHERE GroupChatId = @groupId AND UserId = @userId AND Permission = 4) = 1 THEN 1 ELSE 0 END;
                             IF(@CanDelete = 1)
                             BEGIN                                 
                               SELECT UserId 
                               FROM GroupChatMembers
                               WHERE GroupChatId = @groupId;

                               DELETE FROM GroupChatMembers WHERE GroupChatId = @groupId;
                               DELETE FROM UnseenMessages WHERE GroupChatId = @groupId;
                               DELETE FROM Messages WHERE GroupChatId = @groupId;
                               DELETE FROM GroupChats WHERE GroupChatId = @groupId;
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
                if (result.rowsAffected[0] == 0) {
                    res.status(403).json({ message: "You can't delete this user." });
                    return;
                }
                res.status(204).json({ message: "Successfully deleted user from the groupchat." });
                console.log(result.recordset);
                for (const row of result.recordset) {
                    const key = `${row.UserId},groupchats`;
                    if (key in connections) {
                        connections[key].emit('kickedFromGroupChat', { groupId: groupChatId });
                    }
                }
            })
        });
    });
});
router.get(`/members/:id`, (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const userId = decoded.id;
        const groupChatId = req.params.id;

        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('userId', sql.BigInt, userId);
            request.input('groupId', sql.BigInt, groupChatId);

            const QUERY = `SELECT u.UserId AS UserId, u.Username, gcm.Permission
                           FROM GroupChatMembers gcm
                              INNER JOIN Users u
                              ON gcm.UserId = u.UserId
                           WHERE gcm.GroupChatId = @groupId;`;
            request.query(QUERY, (err, result) => {
                if (err) {
                    res.status(500).send("Internal server error.");
                    console.log(err);
                    return;
                }
                const response = { message: "Successfully retrieved members.", response: result.recordset };

                res.status(200).json(response);
            })
        });
    });
});

router.get('/:id', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const userId = decoded.id;
        const groupId = req.params.id;

        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();
            request.input('userId', sql.BigInt, userId);
            request.input('groupId', sql.BigInt, groupId);
            const QUERY = `SELECT gc.GroupChatId AS GroupId, gc.GroupName AS Name, gc.Members AS Members, gc.MaxMembers AS MaxMembers, 
                           (SELECT Permission FROM GroupChatMembers WHERE UserId = @userId AND GroupChatId = @groupId) AS Permission
                           FROM GroupChats gc
                           WHERE GroupChatId = @groupId AND EXISTS(SELECT * FROM GroupChatMembers gcm WHERE gcm.UserId = @userId AND gcm.GroupChatId = gc.GroupChatId);`;
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
        const query = req.query.q === undefined ? "" : req.query.q;

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

            const QUERY = `SELECT gc.GroupChatId AS groupId, gc.GroupName AS name, COALESCE(um.UnseenMessagesCount, 0) AS notifications
                           FROM GroupChatMembers gcm
                              INNER JOIN GroupChats gc
                              ON gcm.GroupChatId = gc.GroupChatId
                                LEFT JOIN UnseenMessages um
                                ON um.UserId = gcm.UserId AND gcm.GroupChatId = um.GroupChatId
                           WHERE gcm.UserId = @userId ${query.length === 0 ? "" : "AND gc.GroupName LIKE CONCAT('%', @query, '%')"}
                           ORDER BY gcm.CreatedAt DESC
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

router.post('/messages/:id', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const groupChatId = req.params.id;
        const userId = decoded.id;
        const message = req.body.message;
        if (isNaN(groupChatId)) {
            res.status(400).send("Invalid information provided.");
            return;
        }
        if (message === undefined || message.length > 2000) {
            res.status(400).send("Invalid message.");
            return;
        }
        sql.connect(config, (err) => {
            if (err) {
                res.status(500).send("Internal server error.");
                return;
            }
            const request = new sql.Request();

            request.input('userId', sql.BigInt, userId);
            request.input('message', sql.VarChar, message);
            request.input('groupChatId', sql.BigInt, groupChatId);

            const QUERY = `BEGIN TRANSACTION;
                            BEGIN TRY
                              DECLARE @CanMessage BIT = CASE WHEN (SELECT COUNT(*)
                                                         FROM GroupChatMembers
                                                         WHERE UserId = @userId AND GroupChatId = @groupChatId) = 1 THEN 1 ELSE 0 END;
                                                         
                              IF(@CanMessage = 1)
                              BEGIN
                               INSERT INTO Messages(GroupChatId, UserId, Message) VALUES (@groupChatId, @userId, @message);
                               DECLARE @messageId BIGINT = SCOPE_IDENTITY();
                               
                               UPDATE UnseenMessages SET UnseenMessagesCount = UnseenMessagesCount + 1 WHERE GroupChatId = @groupChatId AND UserId != @userId;
                               
                               SELECT UserId, GroupChatId, UnseenMessagesCount
                               FROM UnseenMessages
                               WHERE GroupChatId = @groupChatId;

                               SELECT @message AS Message, @messageId AS MessageId, u.Username, GETDATE() AS CreatedAt, 'Message' AS Type
                               FROM Users u 
                               WHERE u.UserId = @userId;
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
                if (result.recordsets.length === 0) {
                    res.status(403).send("You can't send a message to this groupchat.");
                    return;
                }
                const response = { message: "Successfully published message.", response: result.recordsets[1] };

                res.status(201).json(response);
                for (const element of result.recordsets[0]) {
                    const key = `${element.UserId},groupchats`;
                    if (key in connections) {
                        connections[key].emit(`groupchatNewMessage`, { groupId: groupChatId, unseenMessages: element.UnseenMessagesCount });
                    }
                }
                if (groupChatId in connections) {
                    for (const uid in connections[groupChatId]) {
                        if (uid != userId)
                            connections[groupChatId][uid].emit(`pushMessage`, { groupId: groupChatId, message: result.recordsets[1] });
                    }
                }
            })
        });
    });
});
router.get('/messages/:id', (req, res) => {
    const token = req.headers['x-access-token'];
    jwt.verify(token, KEY, (err, decoded) => {
        if (err) {
            res.status(500).send("Invalid token.");
            return;
        }
        const groupChatId = req.params.id;
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
            request.input('groupChatId', sql.BigInt, groupChatId);
            console.log(userId, groupChatId);
            const QUERY = `BEGIN TRANSACTION;
                           BEGIN TRY
                            DECLARE @CanMessage BIT = CASE WHEN (SELECT COUNT(*)
                                                                 FROM GroupChatMembers
                                                                 WHERE UserId = @userId AND GroupChatId = @groupChatId) = 1 THEN 1 ELSE 0 END;
                            IF(@CanMessage = 1)
                            BEGIN
                                SELECT m.Message, m.MessageId, u.Username, m.CreatedAt, m.Type
                                FROM (SELECT MessageId 
                                 FROM Messages
                                 WHERE GroupChatId = @groupChatId
                                 ORDER BY MessageId DESC
                                 OFFSET @offset ROWS
                                 FETCH NEXT @limit ROWS ONLY) s
                                 INNER JOIN Messages m
                                 ON s.MessageId = m.MessageId
                                   LEFT JOIN Users u
                                   ON u.UserId = m.UserId
                               ORDER BY m.MessageId;
                               UPDATE UnseenMessages SET UnseenMessagesCount = 0 WHERE GroupChatId = @groupChatId AND UserId = @userId;
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

                const response = { message: "Successfully retrieved messages.", response: result.recordset == undefined ? [] : result.recordset };
                const key = `${userId},groupchats`;
                if (key in connections) {
                    connections[key].emit(`groupchatNewMessage`, { groupId: groupChatId, unseenMessages: 0 });
                }
                res.status(200).json(response);

            })
        });
    });
});
module.exports = router
