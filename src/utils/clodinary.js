import {v2 as cloudinary} from "cloudinary"
import fs from "fs"


cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const uploadOnCloudinary = async (localFilePath) => {

  try {
    if (!localFilePath) {
      console.error("❌ No local file path provided");
      return null;
    }
    console.log("📤 Uploading file to Cloudinary:", localFilePath);

    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });

    console.log("✅ Cloudinary response:", response);

    fs.unlinkSync(localFilePath); // Clean up temp file
    return response;
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error.message);
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath); // Remove temp file on error
    }
    return null;
  }
};

export {uploadOnCloudinary}