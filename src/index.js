import dotenv from "dotenv";
import http from "http";
import connectDB from "./db/index.js";
import { Server } from "socket.io";
import { initSocket } from "./socket/index.js";
import { app } from "./app.js";

dotenv.config();
connectDB()
  .then(() => {
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN,
        credentials: true
      }
    });

    initSocket(io);

    // Attach the socket instance to the app
    app.set("io", io);

    // Start the HTTP server
    server.listen(process.env.PORT, () => {
      console.log(`🚀 Server is running on port ${process.env.PORT}`);
    });

    // Handle server shutdown gracefully
    process.on("SIGINT", () => {
      console.log("Shutting down server...");
      io.close(() => {
        console.log("Socket.IO server closed.");
        process.exit(0);
      });
    });
  })
  .catch((err) => {
    console.log("❌ MongoDB connection failed:", err);
  });
