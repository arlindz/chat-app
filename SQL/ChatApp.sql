CREATE DATABASE ChatApp;
USE ChatApp;

CREATE TABLE Users(
   UserId BIGINT PRIMARY KEY IDENTITY(1,1),
   Username VARCHAR(30) UNIQUE,
   Email VARCHAR(60) NOT NULL,
   Password VARCHAR(128) NOT NULL,
   CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
);
CREATE TABLE GroupChats(
   GroupChatId BIGINT PRIMARY KEY IDENTITY(1,1),
   GroupName VARCHAR(50) NOT NULL,
   Members INT NOT NULL DEFAULT 1,
   MaxMembers INT NOT NULL
);

CREATE INDEX Idx_GroupChats_Id_Name ON GroupChats(GroupChatId, GroupName) 
CREATE TABLE GroupChatMembers(
   UserId BIGINT NOT NULL,
   GroupChatId BIGINT NOT NULL,
   Permission INT NOT NULL,
   CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
   PRIMARY KEY(UserId, GroupChatId),
   FOREIGN KEY(UserId) REFERENCES Users(UserId),
   FOREIGN KEY(GroupChatId) REFERENCES GroupChats(GroupChatId)
);

CREATE INDEX Idx_GroupChatMembers_GroupChatId_UserId ON GroupChatMembers(GroupChatId, UserId);
CREATE TABLE Invitations(
   GroupChatId BIGINT NOT NULL,
   UserId BIGINT NOT NULL,
   PRIMARY KEY(UserId, GroupChatId),
   FOREIGN KEY(GroupChatId) REFERENCES GroupChats(GroupChatId),
   FOREIGN KEY(UserId) REFERENCES Users(UserId)
);

CREATE TABLE Messages(
   MessageId BIGINT PRIMARY KEY IDENTITY(1,1),
   Message VARCHAR(500) NOT NULL,
   GroupChatId BIGINT NOT NULL,
   UserId BIGINT NOT NULL,
   CreatedAt DATETIME DEFAULT GETDATE(),
   Type VARCHAR(10) NOT NULL,
   FOREIGN KEY(UserId) REFERENCES Users(UserId),
   FOREIGN KEY(GroupChatId) REFERENCES GroupChats(GroupChatId),
);

CREATE INDEX Idx_Messages_GroupChatId_MessageId ON Messages(GroupChatId, MessageId)
CREATE TABLE UnseenMessages(
   GroupChatId BIGINT NOT NULL,
   UserId BIGINT NOT NULL,
   PRIMARY KEY(UserId, GroupChatId),
   UnseenMessagesCount INT NOT NULL
);

SELECT * FROM UnseenMessages

SELECT * FROM GroupChats

DECLARE @offset INT = 0;
DECLARE @groupChatId BIGINT = 23;
DECLARE @limit BIGINT = 8;
DECLARE @userId BIGINT = 1;
DECLARE @groupId BIGINT = 23;
BEGIN TRANSACTION;
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
							 THROW;
                             ROLLBACK;
                            END CATCH;

					