import { prismaClient } from "../application/database.js";
import { ResponseError } from "../error/response-error.js";
import { cloudinary } from "../middleware/cloudinary-middleware.js";
import { updateProfileValidation } from "../validation/profile-validation.js";
import { userUuidValidation } from "../validation/user-validation.js";
import { validate } from "../validation/validation.js";

const getUserProfile = async (userId) => {
  userId = validate(userUuidValidation, userId);
  
  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      avatar: true,
      role: true,
      provider: true
    }
  });

  if (!user) throw new ResponseError(404, "User not found");
  return user;
};


const updateProfile = async (userId, request) => {
  const validated = validate(updateProfileValidation, request); // Validasi: fullName, phone
  
  return await prismaClient.user.update({
    where: { id: userId },
    data: {
      fullName: validated.fullName,
      phone: validated.phone
    },
    select: { id: true, fullName: true, phone: true, email: true }
  });
};



const updateAvatar = async (userId, avatarFile) => {
  userId = validate(userUuidValidation, userId);

  // 1. Hapus avatar lama dari Cloudinary jika ada
  const oldUser = await prismaClient.user.findUnique({
    where: { id: userId },

    select: { avatar: true }
  });

  if (oldUser?.avatar) {
    const publicId = oldUser.avatar.split('/').pop().split('.')[0];
    await cloudinary.uploader.destroy(`user_avatars/${publicId}`);
  }

  // 2. Gunakan URL dari Cloudinary yang sudah di-upload oleh middleware
  return await prismaClient.user.update({
    where: { id: userId },
    data: { avatar: avatarFile.path }, // path berisi secure_url dari Cloudinary
    select: {
      id: true,
      avatar: true
    }
  });
};



const changePassword = async (userId, currentPassword, newPassword, confirmPassword) => {
  // Validasi
  if (newPassword !== confirmPassword) {
    throw new ResponseError(400, "New password and confirmation mismatch");
  }

  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    select: { password: true }
  });

  // Verifikasi password lama
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new ResponseError(401, "Current password is wrong");

  // Update password baru
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prismaClient.user.update({
    where: { id: userId },
    data: { password: hashedPassword }
  });
};

export default {
  getUserProfile,
  updateProfile,
  updateAvatar,
  changePassword
}