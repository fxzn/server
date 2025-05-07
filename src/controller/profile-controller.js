import profileService from "../service/profile-service.js";


export const getProfile = async (req, res, next) => {
  try {
    const user = await profileService.getUserProfile(req.user.id);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};


export const updateProfile = async (req, res, next) => {
  try {
    const data = await profileService.updateProfile(req.user.id, req.body);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};



export const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ResponseError(400, 'Avatar file is required');
    }

    const result = await profileService.updateAvatar(req.user.id, req.file);
    
    res.status(200).json({
      success: true,
      data: {
        avatarUrl: result.avatar
      }
    });
  } catch (error) {
    next(error);
  }
};




export const changePassword = async (req, res, next) => {
  try {
    await profileService.changePassword(
      req.user.id, 
      req.body.currentPassword,
      req.body.newPassword,
      req.body.confirmPassword
    );
    res.json({ success: true, message: "Password updated" });
  } catch (error) {
    next(error);
  }
};