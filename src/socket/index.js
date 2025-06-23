import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import cookie from "cookie"; // Add cookie parser for Node.js

const userSocketMap = new Map();

export const initSocket = (io) => {
  io.use(async (socket, next) => {
  try {
    // Extract token from cookies or query parameters (for testing)
    const cookies = socket.handshake.headers.cookie
      ? cookie.parse(socket.handshake.headers.cookie)
      : {};
    const token = cookies.token || socket.handshake.query.token; // Add query param fallback

    if (!token) {
      throw new apiError(401, "Unauthorized", "No token provided in cookies or query.");
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    socket.userId = decoded._id;

    const user = await User.findById(socket.userId).select("_id");
    if (!user) {
      throw new apiError(404, "User not found", "Invalid user ID in token.");
    }

    next();
  } catch (err) {
    console.error("Socket authentication error:", err.message);
    next({ status: err.status || 401, message: err.message || "Authentication error" });
  }
});

  io.on("connection", async (socket) => {
    console.log(`User connected: ${socket.id}, User ID: ${socket.userId}`);

    // Manage userSocketMap
    const userId = socket.userId;
    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set());
    }
    userSocketMap.get(userId).add(socket.id);
    console.log(`Active sockets for user ${userId}:`, [...userSocketMap.get(userId)]);

    // Join room
    socket.on("join-room", async (roomId) => {
      try {
        if (!roomId) {
          throw new apiError(400, "Bad Request", "Room ID is required.");
        }
        // Optional: Add room authorization logic here
        // e.g., check if user has access to roomId in your database
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);
        socket.emit("room-joined", { roomId });
      } catch (err) {
        console.error("Error joining room:", err.message);
        socket.emit("error", { status: err.status || 400, message: err.message });
      }
    });

    // Send message
    socket.on("send-message", ({ roomId, message }) => {
      try {
        if (!roomId || !message) {
          throw new apiError(400, "Bad Request", "Room ID and message are required.");
        }
        // Optional: Validate message content or sanitize
        io.to(roomId).emit("receive-message", { userId, message, timestamp: new Date() });
      } catch (err) {
        console.error("Error sending message:", err.message);
        socket.emit("error", { status: err.status || 400, message: err.message });
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
      if (userId && userSocketMap.has(userId)) {
        userSocketMap.get(userId).delete(socket.id);
        if (userSocketMap.get(userId).size === 0) {
          userSocketMap.delete(userId);
        }
      }
      console.log(`Remaining sockets for user ${userId}:`, userSocketMap.get(userId)?.size || 0);
    });
  });

  io.userSocketMap = userSocketMap;
};