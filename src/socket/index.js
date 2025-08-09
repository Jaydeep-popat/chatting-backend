import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import cookie from "cookie";

const userSocketMap = new Map();

export const initSocket = (io) => {
  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const cookies = socket.handshake.headers.cookie
        ? cookie.parse(socket.handshake.headers.cookie)
        : {};

      const token = cookies.accessToken || socket.handshake.query.accessToken;
      if (!token) {
        throw new apiError(401, "Unauthorized", "No token provided.");
      }

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      socket.userId = decoded._id;

      const user = await User.findById(socket.userId).select("_id");
      if (!user) {
        throw new apiError(404, "User not found.");
      }

      next();
    } catch (err) {
      console.error("Socket authentication error:", err.message);
      next({ status: err.status || 401, message: err.message || "Auth error" });
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;

    // Track multiple sockets per user
    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set());
    }
    userSocketMap.get(userId).add(socket.id);

    // Track rooms user has joined (optional but safe)
    socket.joinedRooms = new Set();

    /**
     * JOIN PRIVATE ROOM between two users
     */
    socket.on("join-chat", ({ targetUserId }) => {
      try {
        if (!targetUserId) {
          throw new apiError(400, "Target user ID required.");
        }

        const roomId = [userId, targetUserId].sort().join("-");

        if (!socket.joinedRooms.has(roomId)) {
          socket.join(roomId);
          socket.joinedRooms.add(roomId);
          console.log(`User ${userId} joined room ${roomId}`);
        }

        socket.emit("chat-joined", { roomId });
      } catch (err) {
        console.error("Join room error:", err.message);
        socket.emit("error", { status: err.status || 400, message: err.message });
      }
    });

    /**
     * SEND MESSAGE TO PRIVATE ROOM
     */
    socket.on("send-private-message", ({ targetUserId, message }) => {
      try {
        if (!targetUserId || !message) {
          throw new apiError(400, "Target user ID and message required.");
        }

        const roomId = [userId, targetUserId].sort().join("-");

        // Extra: Auto join sender if not in room (fallback protection)
        if (!socket.joinedRooms.has(roomId)) {
          socket.join(roomId);
          socket.joinedRooms.add(roomId);
        }

        const timestamp = new Date();

        io.to(roomId).emit("receive-private-message", {
          from: userId,
          to: targetUserId,
          message,
          timestamp,
        });
      } catch (err) {
        console.error("Send msg error:", err.message);
        socket.emit("error", { status: err.status || 400, message: err.message });
      }
    });

    /**
     * HANDLE DISCONNECT
     */
    socket.on("disconnect", () => {
      if (userSocketMap.has(userId)) {
        userSocketMap.get(userId).delete(socket.id);
        if (userSocketMap.get(userId).size === 0) {
          userSocketMap.delete(userId);
        }
      }
      console.log(`🔌 User ${userId} disconnected. Active sockets:`, userSocketMap.get(userId)?.size || 0);
    });
  });

  io.userSocketMap = userSocketMap; // expose for controller usage
};
