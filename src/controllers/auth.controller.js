import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponce.js"
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/clodinary.js";
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";
import { RefreshToken } from "../models/refreshToken.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";


const registerUser = asyncHandler(async (req, res) => {

  const { username, displayName, email, password, role } = req.body;

  if ([username, displayName, email, password, role].some(field => !field)) {
    throw new apiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  })

  if (existedUser) {
    throw new apiError(409, "User with email or username already exists");
  }

  let profilePic = undefined;

  const profilePicLocalPath = req.files?.profilePic?.[0]?.path;
  console.log("Profile picture path:", profilePicLocalPath);

  if (profilePicLocalPath) {
    const uploadedImage = await uploadOnCloudinary(profilePicLocalPath);

    if (!uploadedImage) {
      throw new apiError(500, "Failed to upload profile picture.");
    } else {
      profilePic = uploadedImage.url;
    }
  }

  const user = await User.create({
    username,
    displayName,
    email,
    password,
    profilePic,
    role
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  )

  if (!createdUser) {
    throw new apiError(409, "something went wrong while creating user");
  }

  // 🔐 Generate tokens
  const accessToken = generateAccessToken(createdUser);
  const refreshToken = generateRefreshToken(createdUser);

  const refreshTokenExpiry = new Date();
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // or use process.env.REFRESH_TOKEN_EXPIRY

  await RefreshToken.create({
    user: createdUser._id,
    token: refreshToken,
    expiresAt: refreshTokenExpiry,
  });

  return res
    .status(201)
    .json(new apiResponse(200, {
      user: createdUser,
      tokens: {
        accessToken,
        refreshToken,
      },
    },
      "user registerd successfully"
    ))
});

const loginUser = asyncHandler(async (req, res) => {

  const { email, username, password } = req.body;

  if (!username && !email) {
    throw new apiError(400, "username or email is required.");
  }
  if (!password) {
    throw new apiError(400, "please provide the password.");
  }

  const user = username
    ? await User.findOne({ username }).select("+password")
    : await User.findOne({ email }).select("+password");

  if (!user) {
    throw new apiError(404, "User not found with the provided email or username.")
  }
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new apiError(401, "Invalid user credentials");
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);


  const loggedInUser = await User.findById(user._id).select("-password");

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 30 * 60 * 1000, // 30 minutes for accessToken
  };

  const refreshTokenOptions = {
    ...options,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for refreshToken
  };

  const refreshTokenExpiry = new Date();
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // or from env

  const tokens = await RefreshToken.find({ user: user._id });

  try {
    const tokens = await RefreshToken.find({ user: user._id }).sort({ createdAt: 1 });

    if (tokens.length >= 3) {
      const oldestToken = tokens[0];
      await RefreshToken.findByIdAndDelete(oldestToken._id);
    }
  } catch (err) {
    console.error("Failed to delete oldest token", err);
  }

  await RefreshToken.create({
    user: user._id,
    token: refreshToken,
    expiresAt: refreshTokenExpiry,
  });

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, refreshTokenOptions)
    .json(
      new apiResponse(
        200,
        { user: loggedInUser, tokens: { accessToken, refreshToken, } },
        "User logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    throw new apiError(400, "Refresh token not found in cookies");
  }

  // Step 1: Find all tokens for this user (optional: find only unrevoked tokens)
  const allTokens = await RefreshToken.find({ revoked: false });

  let matchedToken = null;

  for (const dbToken of allTokens) {
    const isMatch = await bcrypt.compare(refreshToken, dbToken.token);
    if (isMatch) {
      matchedToken = dbToken;
      break;
    }
  }

  if (!matchedToken) {
    throw new apiError(404, "Refresh token not found or already deleted");
  }

  await RefreshToken.findByIdAndDelete(matchedToken._id);

  res
    .clearCookie("accessToken", {
      httpOnly: true,
      secure: true,
      sameSite: "none"
    })
    .clearCookie("refreshToken", {
      httpOnly: true,
      secure: true,
      sameSite: "none"
    });

  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        null,
        "User logged out successfully"
      )
    );
});

const getAlluser = asyncHandler(async (req, res) => {

  const users = await User.find({}).select("-password -refreshToken");
  return res
    .status(200)
    .json(new apiResponse(200, users, "All users fetched successfully."));
});

const changeCurrentPassword = asyncHandler(async (req, res) => {

  const { currentPassword, newPassword } = req.body;

  const userId = req.user._id;
  const user = await User.findById(userId).select("+password");


  const isPasswordValid = await user.comparePassword(currentPassword);

  if (!isPasswordValid) {
    throw new apiError(401, "Invalid current password.");
  }

  user.password = newPassword;
  await user.save();
  return res
    .status(200)
    .json(new apiResponse(200, null, "Password changed successfully."));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId).select("-password -refreshToken");
  return res
    .status(200)
    .json(new apiResponse(200, user, "Current user fetched successfully."));
});

const updateAccountDetails = asyncHandler(async (req, res) => {

  const { username, displayName, email } = req.body;
  const userId = req.user._id;

  if (!username || !displayName || !email) {
    throw new apiError(400, "All fields are required.");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
    _id: { $ne: userId },
  });

  if (existedUser) {
    throw new apiError(409, "User with email or username already exists");
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { username, displayName, email },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new apiResponse(200, updatedUser, "Account details updated successfully."));
});

const updateProfilePicture = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const profilePicLocalPath = req.files?.profilePic?.[0]?.path;

  if (!profilePicLocalPath) {
    throw new apiError(400, "Profile picture is required.");
  }

  const uploadedImage = await uploadOnCloudinary(profilePicLocalPath);

  if (!uploadedImage) {
    throw new apiError(500, "Failed to upload profile picture.");
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { profilePic: uploadedImage.url },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new apiResponse(200, updatedUser, "Profile picture updated successfully."));
})

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies?.refreshToken;

  if (!incomingRefreshToken) {
    throw new apiError(401, "Refresh token not found");
  }

  // Verify the refresh token
  let decoded;
  try {
    decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (error) {
    throw new apiError(403, "Invalid refresh token");
  }

  // Find all refresh tokens
  const tokens = await RefreshToken.find({});
  if (!tokens || tokens.length === 0) {
    throw new apiError(403, "Invalid refresh token");
  }

  let existingToken = null;
  for (const token of tokens) {
    const isMatch = await bcrypt.compare(incomingRefreshToken, token.token);
    if (isMatch) {
      existingToken = token;
      break;
    }
  }

  if (!existingToken) {
    throw new apiError(403, "Invalid refresh token");
  }

  const user = await User.findById(existingToken.user).select("-password");
  if (!user) {
    throw new apiError(404, "User not found");
  }

  // If token expired
  if (new Date() > existingToken.expiresAt) {
    // Create new refresh token
    const newRefreshToken = generateRefreshToken(user);
    const hashedRefreshToken = await bcrypt.hash(newRefreshToken, 10);

    // Replace old token
    await RefreshToken.findByIdAndDelete(existingToken._id);
    await RefreshToken.create({
      user: user._id,
      token: hashedRefreshToken,
      expiresAt: new Date(Date.now() + process.env.REFRESH_TOKEN_EXPIRY * 1000),
    });

    const newAccessToken = generateAccessToken(user);

    res
      .cookie("accessToken", newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 60 * 1000,
      })
      .cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

    return res.status(200).json(
      new apiResponse(
        200,
        { accessToken: newAccessToken, refreshToken: newRefreshToken },
        "New tokens generated successfully"
      )
    );
  } else {
    // If token NOT expired, only generate new access token
    const newAccessToken = generateAccessToken(user);

    res
      .cookie("accessToken", newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 60 * 1000,
      });

    return res.status(200).json(
      new apiResponse(
        200,
        { accessToken: newAccessToken },
        "Access token refreshed successfully"
      )
    );
  }
});



export {
  registerUser,
  loginUser,
  logoutUser,
  getAlluser,
  getCurrentUser,
  changeCurrentPassword,
  updateProfilePicture,
  updateAccountDetails,
  refreshAccessToken
}