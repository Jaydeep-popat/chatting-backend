import { Message } from "../models/Message.model.js";
import { User } from "../models/user.model.js";
import { ChatRoom } from "../models/chatRoom.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponce.js"
import { uploadOnCloudinary } from "../utils/clodinary.js";

const sendMessage = asyncHandler(async (req, res) => {

  const { receiver, room, content, messageType } = req.body;
  const sender = req.user._id;

  const MESSAGE_TYPES = Object.freeze(["text", "image", "video", "file"]);

  if (!messageType || !MESSAGE_TYPES.includes(messageType)) {
    throw new apiError(400, "Invalid or missing message type.");
  }

  if (!receiver && !room) {
    throw new apiError(400, "Either receiver or room ID must be provided.");
  }

  if (receiver && room) {
    throw new apiError(400, "Provide either receiver or room, not both.");
  }

  if (messageType === "text" && (!content || content.trim().length === 0)) {
    throw new apiError(400, "Text message must have content.");
  }

  let fileUrl = null;
  if (["image", "video", "file"].includes(messageType)) {
    const fileUrlLocalPath = req.files?.file?.[0]?.path;

    if (!fileUrlLocalPath || fileUrlLocalPath.trim().length === 0) {
      throw new apiError(400, "Please provide a file.");
    }

    const uploadFile = await uploadOnCloudinary(fileUrlLocalPath);
    if (!uploadFile) {
      throw new apiError(500, "Failed to upload file to Cloudinary.");
    }
    fileUrl = uploadFile.url;
  }

  if (receiver) {
    const userExists = await User.exists({ _id: receiver }).lean();
    if (!userExists) throw new apiError(404, "Receiver user not found.");
  }

  if (room) {
    const roomExists = await ChatRoom.exists({ _id: room }).lean();
    if (!roomExists) throw new apiError(404, "Chat room not found.");
  }

  const newMessage = await Message.create({
    sender,
    receiver: receiver || null,
    room: room || null,
    content: content || "",
    fileUrl: fileUrl || null,
    messageType,
  });

  const populatedMessage = await Message.findById(newMessage._id).populate(
    "sender",
    "fullName avatar"
  );

  const io = req.app.get("io");
  const userSocketMap = io.userSocketMap;

  if (!io || !userSocketMap) {
    console.warn("Socket.io or userSocketMap not initialized properly.");
  }

  if (receiver) {

    const receiverSockets = userSocketMap.get(receiver.toString());
    console.log(`Receiver sockets for ${receiver}:`, receiverSockets);

    if (receiverSockets) {
      receiverSockets.forEach((socketId) => {
        io.to(socketId).emit("receive-message", populatedMessage);
      });
    } else {
      console.warn(`User ${receiver} is not connected.`);
    }
  }

  if (room) {
    io.to(room.toString()).emit("receive-message", populatedMessage);
  }

  return res
    .status(201)
    .json(new apiResponse(201, populatedMessage, "Message sent successfully"));
});

const getMessages = asyncHandler(async (req, res) => {

  const { receiver, room, page = 1, limit = 20, search } = req.query;
  const userId = req.user._id;

  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);

  if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber <= 0 || limitNumber <= 0) {
    throw new apiError(400, "Page and limit must be positive integers.");
  }

  if (!receiver && !room) {
    throw new apiError(400, "Either receiver or room ID must be provided.");
  }

  if (receiver && room) {
    throw new apiError(400, "Provide either receiver or room, not both.");
  }

  const skip = (pageNumber - 1) * limitNumber;

  let query = { deleted: false };

  if (receiver) {
    query.sender = { $in: [userId, receiver] };
    query.receiver = { $in: [userId, receiver] };
  } else if (room) {
    query.room = room;
  }

  if (search) {
    query.content = { $regex: search, $options: "i" };
  }

  try {
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .populate("sender", "fullName avatar");

    const totalMessages = await Message.countDocuments(query);
    const totalPages = Math.ceil(totalMessages / limitNumber);

    return res.status(200).json(
      new apiResponse(
        200,
        {
          messages,
          pagination: {
            totalMessages,
            totalPages,
            currentPage: pageNumber,
            limit: limitNumber,
          },
        },
        "Messages fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching messages:", error.stack);
    throw new apiError(500, "Failed to fetch messages.");
  }
});

const deleteMessage = asyncHandler(async (req, res) => {

  const { messageId } = req.params;
  const userId = req.user._id;

  if (!messageId) {
    throw new apiError(400, "Message ID is required.");
  }

  // Find the message
  const message = await Message.findById(messageId);
  if (!message) {
    throw new apiError(404, "Message not found.");
  }

  // Optional: Only sender can delete
  if (message.sender.toString() !== userId.toString()) {
    throw new apiError(403, "You are not allowed to delete this message.");
  }

  if (message.deleted) {
    return res.status(200).json(
      new apiResponse(200, null, "Message already deleted.")
    );
  }

  // Mark as deleted
  message.deleted = true;
  await message.save();

  // Notify via socket.io (optional)
  const io = req.app.get("io");
  if (io) {
    // Notify receiver (DM)
    if (message.receiver) {
      const userSocketMap = io.userSocketMap;
      const receiverSockets = userSocketMap?.get(message.receiver.toString());
      if (receiverSockets) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit("message-deleted", { messageId });
        });
      }
    }
    // Notify room (group)
    if (message.room) {
      io.to(message.room.toString()).emit("message-deleted", { messageId });
    }
  }



  return res.status(200).json(
    new apiResponse(200, null, "Message deleted successfully.")
  );
});

const editMessage = asyncHandler(async (req, res) => {

  const { messageId } = req.params;
  const { content } = req.body;
  const userId = req.user._id;

  if (!messageId) {
    throw new apiError(400, "Message ID is required.");
  }

  // Find the message
  const message = await Message.findById(messageId);

  if (!message) {
    throw new apiError(404, "Message not found.");
  }

  if (!content || content.trim().length === 0) {
    throw new apiError(400, "Content is required to edit the message.");
  }

  if (message.messageType !== "text") {
    throw new apiError(400, "Only text messages can be edited.");
  }

  // Only sender can edit
  if (message.sender.toString() !== userId.toString()) {
    throw new apiError(403, "You are not allowed to edit this message.");
  }

  if (message.deleted) {
    throw new apiError(400, "Cannot edit a deleted message.");
  }

  // Update content and mark as edited
  message.content = content;
  message.isEdited = true;
  await message.save();

  // Optionally, populate sender info for the response and socket event
  const populatedMessage = await Message.findById(messageId).populate(
    "sender",
    "fullName avatar"
  );

  // Notify via socket.io
  const io = req.app.get("io");
  if (io) {
    // Notify receiver (DM)
    if (message.receiver) {
      const userSocketMap = io.userSocketMap;
      const receiverSockets = userSocketMap?.get(message.receiver.toString());
      if (receiverSockets) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit("message-edited", populatedMessage);
        });
      }
    }
    // Notify room (group)
    if (message.room) {
      io.to(message.room.toString()).emit("message-edited", populatedMessage);
    }
  }

  return res.status(200).json(
    new apiResponse(200, populatedMessage, "Message edited successfully.")
  );
});

const markAsRead = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user._id;

  if (!messageId) {
    throw new apiError(400, "Message ID is required.");
  }

  const message = await Message.findById(messageId);
  if (!message) {
    throw new apiError(404, "Message not found.");
  }

  // For DM: only receiver can mark as read
  if (message.receiver && message.receiver.toString() !== userId.toString()) {
    throw new apiError(403, "You are not allowed to mark this message as read.");
  }

  // For group chat: any member can mark as read
  // (You may want to check if user is in the room, if you have that info)

  // Add user to readBy array if not already present
  if (!message.readBy.map(id => id.toString()).includes(userId.toString())) {
    message.readBy.push(userId);
    await message.save();
  }

  // Optionally, notify sender via socket.io
  const io = req.app.get("io");
  if (io && message.sender) {
    const userSocketMap = io.userSocketMap;
    const senderSockets = userSocketMap?.get(message.sender.toString());
    if (senderSockets) {
      senderSockets.forEach((socketId) => {
        io.to(socketId).emit("message-read", { messageId, reader: userId });
      });
    }
  }

  return res.status(200).json(
    new apiResponse(200, null, "Message marked as read.")
  );
});

const getChatList = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Find all DMs and group messages involving the user
  const messages = await Message.aggregate([
    {
      $match: {
        $or: [
          { sender: userId },
          { receiver: userId },
          { room: { $ne: null } }
        ],
        deleted: false
      }
    },
    // Sort by latest message per conversation
    { $sort: { createdAt: -1 } },
    // Group by DM (user-to-user) or room
    {
      $group: {
        _id: {
          $cond: [
            { $ifNull: ["$room", false] },
            "$room",
            {
              $cond: [
                { $gt: ["$sender", "$receiver"] },
                { $concat: [{ $toString: "$sender" }, "_", { $toString: "$receiver" }] },
                { $concat: [{ $toString: "$receiver" }, "_", { $toString: "$sender" }] }
              ]
            }
          ]
        },
        lastMessage: { $first: "$$ROOT" }
      }
    },
    // Lookup sender and receiver info
    {
      $lookup: {
        from: "users",
        localField: "lastMessage.sender",
        foreignField: "_id",
        as: "sender"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "lastMessage.receiver",
        foreignField: "_id",
        as: "receiver"
      }
    },
    {
      $lookup: {
        from: "chatrooms",
        localField: "lastMessage.room",
        foreignField: "_id",
        as: "room"
      }
    },
    {
      $project: {
        lastMessage: 1,
        sender: { $arrayElemAt: ["$sender", 0] },
        receiver: { $arrayElemAt: ["$receiver", 0] },
        room: { $arrayElemAt: ["$room", 0] }
      }
    },
    // Sort chat list by latest message
    { $sort: { "lastMessage.createdAt": -1 } }
  ]);

  return res.status(200).json(
    new apiResponse(200, messages, "Chat list fetched successfully")
  );
});

const getMsgById = asyncHandler(async (req, res) => {
  const {messageId} = req.params;
  const userId = req.user._id;

  if (!messageId) {
    throw new apiError(400, "Message ID is required.");
  }

  const message = await Message.findById(messageId)
    .populate("sender", "fullName avatar")
    .populate("receiver", "fullName avatar")
    .populate("room");

  if (!message) {
    throw new apiError(404, "Message not found.");
  }

  // Check if user is part of the conversation
  const isSender = message.sender && message.sender._id.toString() === userId.toString();
  const isReceiver = message.receiver && message.receiver._id.toString() === userId.toString();
  const isRoomMember =
    message.room &&
    Array.isArray(message.room.members) &&
    message.room.members.map(id => id.toString()).includes(userId.toString());

  if (!isSender && !isReceiver && !isRoomMember) {
    throw new apiError(403, "You are not allowed to view this message.");
  }

  return res.status(200).json(
    new apiResponse(200, message, "Message fetched successfully")
  );
});

const getUnrededCount= asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Count unread messages for the user
  const unreadCount = await Message.countDocuments({
    receiver: userId,
    readBy: { $nin: [userId] },
    deleted: false
  });
  return res.status(200).json(
    new apiResponse(200, { unreadCount }, "Unread message count fetched successfully")
  );
});


export {
  sendMessage,
  getMessages,
  deleteMessage,
  editMessage,
  markAsRead,
  getChatList,
  getMsgById,
  getUnrededCount
}