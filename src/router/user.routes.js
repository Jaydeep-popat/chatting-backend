import { Router } from "express";
import { loginUser, registerUser,logoutUser,getAlluser,getCurrentUser,updateProfilePicture,updateAccountDetails,refreshAccessToken } from "../controllers/auth.controller.js"
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = new Router();

router.route("/register").post(
    upload.fields([{name:"profilePic",maxCount:1}]),
    registerUser
);

router.route("/login").post(loginUser);

router.route("/logout").post(verifyJWT,logoutUser);

router.route("/getAlluser").post(verifyJWT,getAlluser);

router.route("/getCurrentUser").post(verifyJWT,getCurrentUser);

router.route("/updateProfilePicture").post(
    verifyJWT,
    upload.fields([{name:"profilePic",maxCount:1}]),
    updateProfilePicture
);

router.route("/updateAccountDetails").post(
    verifyJWT,
    updateAccountDetails
);

router.route("/refresh-token").post(refreshAccessToken)

export default router