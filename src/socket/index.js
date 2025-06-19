import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js"; // Import User model for validation
import jwt from "jsonwebtoken";

const userSocketMap = new Map(); // Map to track user-to-socket connections

export const initSocket = (io) => {
  
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.query.token;

      if (!token) {
        throw new apiError(401, "Unauthorized", "No token provided in handshake query.");
      }

      // Validate the token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded._id; // Attach the userId to the socket

      // Check if the user exists in the database
      const userExists = await User.exists({ _id: socket.userId });
      if (!userExists) {
        throw new apiError(404, "User not found", "Invalid user ID in token.");
      }

      next(); // Proceed to the next middleware
    } catch (err) {
      console.error("Socket authentication error:", err.message);
      next(new Error(err.message || "Authentication error"));
    }
  });

  io.on("connection", async (socket) => {
    console.log(`User connected: ${socket.id}`);

    const userId = socket.userId; // Extract userId from the socket object
    console.log("Authenticated userId:", userId);

    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set());
    }
    userSocketMap.get(userId).add(socket.id);
    console.log(`Active sockets for user ${userId}:`, [...userSocketMap.get(userId)]);

    // Handle joining a room
    socket.on("join-room", (roomId) => {
      try {
        if (!roomId) {
          throw new apiError(400, "Bad Request", "Room ID is required to join a room.");
        }
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);
      } catch (err) {
        console.error("Error joining room:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    // Handle sending a message to a room
    socket.on("send-message", ({ roomId, message }) => {
      try {
        if (!roomId || !message) {
          throw new apiError(400,"Room ID and message are required.");
        }
        io.to(roomId).emit("receive-message", message);
      } catch (err) {
        console.error("Error handling send-message event:", err.message);
        socket.emit("error", { message: err.message });
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
    });
  });

  // Expose the userSocketMap for use in controllers
  io.userSocketMap = userSocketMap;
};
