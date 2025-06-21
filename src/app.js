import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();

dotenv.config();
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}))
console.log("CORS enabled for origin:", process.env.CORS_ORIGIN);
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true, limit: "20kb" }));
app.use(express.static("public"));
app.use(cookieParser());


import userRouter from './router/user.routes.js';
app.use("/api/users", userRouter);

import messageRouter from './router/message.routers.js';
app.use("/api/messages", messageRouter);



export { app };

