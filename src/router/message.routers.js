import { Router } from "express";
import { sendMessage, getMessages, deleteMessage, editMessage, markAsRead, getChatList, getMsgById, getUnrededCount } from "../controllers/message.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { get } from "mongoose";


const router = new Router();

router.route("/send-message").post(
  verifyJWT,
  upload.fields([{ name: "file", maxCount: 1 }]),
  sendMessage
);

router.route("/get-messages").get(
  verifyJWT,
  getMessages
);

router.route("/delete-message/:messageId").delete(
  verifyJWT,
  deleteMessage
);

router.route("/edit-message/:messageId").put(
  verifyJWT,
  editMessage
);

router.route("/mark-as-read/:messageId").patch(
  verifyJWT,
  markAsRead
);

router.route("/get-chat-list").get(
  verifyJWT,
  getChatList
);

router.route("/getMsgById/:messageId").get(
  verifyJWT,
  getMsgById
)

router.route("/getUnrededCount").get(
  verifyJWT,
  getUnrededCount
)
export default router
