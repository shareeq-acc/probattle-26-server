import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Message } from "../entities/Message";
import { User } from "../entities/User";
import { authenticateToken } from "../middleware/auth";
import WebSocketService from "../services/WebSocketService";
import RedisService from "../services/RedisService";
import MessageQueueService from "../services/MessageQueueService";

const router = Router();

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// Send a message (REST API alternative to WebSocket)
router.post("/send", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const senderId = req.user!.id; // Use id instead of userId
    const { receiverId, message, serviceId } = req.body;

    if (!receiverId || !message) {
      return res.status(400).json({ error: "receiverId and message are required" });
    }

    const messageRepo = AppDataSource.getRepository(Message);

    // Generate conversation ID
    const conversationId = `conv_${[senderId, receiverId].sort().join('_')}`;

    // Create and save message
    const newMessage = messageRepo.create({
      senderId,
      receiverId,
      message,
      conversationId,
      read: false,
      metadata: serviceId ? { serviceId } : null,
    });

    const savedMessage = await messageRepo.save(newMessage);

    // Invalidate caches
    await RedisService.del(`user:${senderId}:conversations`);
    await RedisService.del(`user:${receiverId}:conversations`);
    await RedisService.del(`user:${receiverId}:unread-count`);

    // Notify via WebSocket if user is online
    WebSocketService.emitToUser(receiverId, "new_message", {
      id: savedMessage.id,
      senderId,
      receiverId,
      message,
      conversationId,
      timestamp: savedMessage.createdAt,
      read: false,
    });

    // If receiver is offline, store message
    if (!WebSocketService.isUserOnline(receiverId)) {
      await MessageQueueService.storeOfflineMessage(receiverId, {
        id: savedMessage.id,
        senderId,
        receiverId,
        message,
        conversationId,
        timestamp: savedMessage.createdAt,
        read: false,
      });
    }

    res.status(201).json({
      success: true,
      message: savedMessage,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Get conversation between two users
router.get("/conversation/:otherUserId", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id; // Use id instead of userId
    const otherUserId = req.params.otherUserId; // Keep as string for UUID
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    // Check cache first
    const cacheKey = `conversation:${userId < otherUserId ? userId : otherUserId}:${userId < otherUserId ? otherUserId : userId}:${page}`;
    const cached = await RedisService.getJSON<any>(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const messageRepo = AppDataSource.getRepository(Message);

    const [messages, total] = await messageRepo.findAndCount({
      where: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ],
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
      relations: ["sender", "receiver"],
    });

    const result = {
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache for 1 minute
    await RedisService.setJSON(cacheKey, result, 60);

    res.json(result);
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// Get all conversations for a user
router.get("/conversations", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id; // Use id instead of userId

    // Check cache
    const cacheKey = `user:${userId}:conversations`;
    const cached = await RedisService.getJSON<any>(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const messageRepo = AppDataSource.getRepository(Message);

    // Get latest message from each conversation
    const conversations = await messageRepo
      .createQueryBuilder("message")
      .select([
        "CASE WHEN message.senderId = :userId THEN message.receiverId ELSE message.senderId END as otherUserId",
        "MAX(message.createdAt) as lastMessageAt",
        "COUNT(CASE WHEN message.receiverId = :userId AND message.read = false THEN 1 END) as unreadCount",
      ])
      .where("message.senderId = :userId OR message.receiverId = :userId", { userId })
      .groupBy("otherUserId")
      .orderBy("lastMessageAt", "DESC")
      .getRawMany();

    // Get user details for each conversation
    const userRepo = AppDataSource.getRepository(User);
    const conversationsWithUsers = await Promise.all(
      conversations.map(async (conv) => {
        const otherUser = await userRepo.findOne({
          where: { id: conv.otheruserid },
          select: ["id", "name", "email", "avatar"],
        });

        const lastMessage = await messageRepo.findOne({
          where: [
            { senderId: userId, receiverId: conv.otheruserid },
            { senderId: conv.otheruserid, receiverId: userId },
          ],
          order: { createdAt: "DESC" },
        });

        return {
          otherUser: otherUser ? {
            ...otherUser,
            profilePicture: otherUser.avatar,
          } : null,
          lastMessage,
          lastMessageAt: conv.lastmessageat,
          unreadCount: parseInt(conv.unreadcount),
          isOnline: WebSocketService.isUserOnline(conv.otheruserid),
        };
      })
    );

    // Cache for 30 seconds
    await RedisService.setJSON(cacheKey, conversationsWithUsers, 30);

    res.json(conversationsWithUsers);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Mark messages as read
router.post("/read/:messageId", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id; // Use id instead of userId
    const messageId = parseInt(req.params.messageId);

    const messageRepo = AppDataSource.getRepository(Message);
    const message = await messageRepo.findOne({ where: { id: messageId } });

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.receiverId !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    message.read = true;
    message.readAt = new Date();
    await messageRepo.save(message);

    // Invalidate cache
    await RedisService.del(`user:${userId}:conversations`);

    // Notify sender via WebSocket
    WebSocketService.emitToUser(message.senderId, "message_read", {
      messageId,
      readBy: userId,
      readAt: message.readAt,
    });

    res.json({ success: true, message });
  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({ error: "Failed to mark message as read" });
  }
});

// Get unread message count
router.get("/unread-count", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id; // Use id instead of userId

    // Check cache
    const cacheKey = `user:${userId}:unread-count`;
    const cached = await RedisService.get(cacheKey);
    
    if (cached) {
      return res.json({ count: parseInt(cached) });
    }

    const messageRepo = AppDataSource.getRepository(Message);
    const count = await messageRepo.count({
      where: { receiverId: userId, read: false },
    });

    // Cache for 10 seconds
    await RedisService.set(cacheKey, count.toString(), 10);

    res.json({ count });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

// Mark all messages in a conversation as read
router.post("/read-conversation/:otherUserId", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id; // Use id instead of userId
    const otherUserId = req.params.otherUserId; // Keep as string for UUID

    const messageRepo = AppDataSource.getRepository(Message);
    
    // Update all unread messages from the other user
    await messageRepo
      .createQueryBuilder()
      .update(Message)
      .set({ read: true, readAt: new Date() })
      .where("receiverId = :userId", { userId })
      .andWhere("senderId = :otherUserId", { otherUserId })
      .andWhere("read = false")
      .execute();

    // Invalidate caches
    await RedisService.del(`user:${userId}:conversations`);
    await RedisService.del(`user:${userId}:unread-count`);

    // Notify sender via WebSocket
    WebSocketService.emitToUser(otherUserId, "conversation_read", {
      readBy: userId,
      readAt: new Date(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking conversation as read:", error);
    res.status(500).json({ error: "Failed to mark conversation as read" });
  }
});

// Delete a message
router.delete("/:messageId", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id; // Use id instead of userId
    const messageId = parseInt(req.params.messageId);

    const messageRepo = AppDataSource.getRepository(Message);
    const message = await messageRepo.findOne({ where: { id: messageId } });

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Only sender can delete their message
    if (message.senderId !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await messageRepo.remove(message);

    // Invalidate caches
    await RedisService.del(`message:${messageId}`);
    await RedisService.del(`user:${userId}:conversations`);
    await RedisService.del(`user:${message.receiverId}:conversations`);

    // Notify receiver via WebSocket
    WebSocketService.emitToUser(message.receiverId, "message_deleted", {
      messageId,
      deletedBy: userId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

// Search messages
router.get("/search", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id; // Use id instead of userId
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }

    const messageRepo = AppDataSource.getRepository(Message);

    const messages = await messageRepo
      .createQueryBuilder("message")
      .leftJoinAndSelect("message.sender", "sender")
      .leftJoinAndSelect("message.receiver", "receiver")
      .where("(message.senderId = :userId OR message.receiverId = :userId)", { userId })
      .andWhere("message.message ILIKE :query", { query: `%${query}%` })
      .orderBy("message.createdAt", "DESC")
      .take(limit)
      .getMany();

    res.json({ messages, count: messages.length });
  } catch (error) {
    console.error("Error searching messages:", error);
    res.status(500).json({ error: "Failed to search messages" });
  }
});

export default router;
