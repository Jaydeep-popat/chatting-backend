import dotenv from "dotenv";
import http from "http";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { Server } from "socket.io";
import { initSocket } from "./socket/index.js";

dotenv.config();

connectDB()
  .then(() => {
    const server = http.createServer(app);

    const io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          const allowedOrigins = ["http://localhost:3000"];
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        },
        credentials: true,
      },
    });

    initSocket(io);

    app.set("io", io);

    server.listen(process.env.PORT, () => {
      console.log("Server is running on port", process.env.PORT);
    });

    process.on("SIGINT", () => {
      console.log("Shutting down server...");
      io.close(() => {
        console.log("Socket.IO server closed.");
        process.exit(0);
      });
    });
  })
  .catch((err) => {
    console.log("Mongo not connected", err);
  });
