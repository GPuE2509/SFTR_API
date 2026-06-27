const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Volunteer = require('../../models/Volunteer');
const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');
const { BCRYPT_SALT_ROUNDS } = require('../../utils/authUtils');
const { deleteImage, uploadImage } = require('../../utils/uploadCloudinary');
const { sendPasswordChangeNotificationEmail } = require('../../utils/sendEmail');

exports.getUserProfile = async (userOrId) => {
  let user;
  let userId;
  if (userOrId && typeof userOrId === 'object' && userOrId._id) {
    user = userOrId;
    userId = user._id;
  } else {
    userId = userOrId;
    user = await User.findById(userId).select('-password_hash');
    if (!user) {
      const error = new Error('User does not exist.');
      error.status = 404;
      throw error;
    }
  }

  // Run independent queries in parallel
  const [pendingVolunteer, staffLinks] = await Promise.all([
    Volunteer.findOne({ user_id: userId, status: 'Pending_Approval' }),
    WorkshopStaff.find({ user_id: userId, is_owner: true })
  ]);

  let pendingWorkshop = null;
  if (staffLinks.length > 0) {
    const workshopIds = staffLinks.map(link => link.workshop_id);
    const ws = await Workshop.findOne({
      _id: { $in: workshopIds },
      status: 'Pending_Approval'
    });
    if (ws) {
      pendingWorkshop = {
        requestedRole: 'workshop',
        workshopName: ws.name
      };
    }
  }

  return {
    user,
    pendingVolunteer: pendingVolunteer ? {
      requestedRole: 'volunteer',
      vehicleType: pendingVolunteer.vehicle_type
    } : null,
    pendingWorkshop
  };
};

exports.updateUserProfile = async (userId, updateData) => {
  const fieldsToUpdate = {};
  
  if (updateData.full_name !== undefined) {
    if (typeof updateData.full_name !== 'string' || updateData.full_name.trim().length < 2) {
      const error = new Error('Full name must be at least 2 characters.');
      error.status = 400;
      throw error;
    }
    fieldsToUpdate.full_name = updateData.full_name.trim();
  }

  if (updateData.phone !== undefined) {
    fieldsToUpdate.phone = updateData.phone ? updateData.phone.trim() : '';
  }

  if (updateData.dob !== undefined) {
    fieldsToUpdate.dob = updateData.dob ? updateData.dob.trim() : '';
  }

  if (updateData.district !== undefined) {
    fieldsToUpdate.district = updateData.district ? updateData.district.trim() : '';
  }

  if (updateData.avatar_url !== undefined) {
    fieldsToUpdate.avatar_url = updateData.avatar_url ? updateData.avatar_url.trim() : '';
  }

  if (Object.keys(fieldsToUpdate).length === 0) {
    const user = await User.findById(userId).select('-password_hash');
    if (!user) {
      const error = new Error('User does not exist.');
      error.status = 404;
      throw error;
    }
    return {
      id: user._id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      dob: user.dob,
      district: user.district,
      avatar_url: user.avatar_url,
      role: user.role,
    };
  }

  // Optimize: Performs a single findByIdAndUpdate operation to save a DB roundtrip
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: fieldsToUpdate },
    { new: true, runValidators: true }
  ).select('-password_hash');

  if (!user) {
    const error = new Error('User does not exist.');
    error.status = 404;
    throw error;
  }

  return {
    id: user._id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    dob: user.dob,
    district: user.district,
    avatar_url: user.avatar_url,
    role: user.role,
  };
};

exports.updateUserAvatar = async (userOrId, fileBuffer) => {
  let user;
  if (userOrId && typeof userOrId === 'object' && userOrId._id) {
    user = userOrId;
  } else {
    user = await User.findById(userOrId).select('avatar_url');
    if (!user) {
      const error = new Error('User does not exist.');
      error.status = 404;
      throw error;
    }
  }

  const oldAvatarUrl = user.avatar_url;

  const folder = `smart-flood-traffic/users/${user._id}`;
  const publicId = `avatar-${user._id}-${Date.now()}`;
  const result = await uploadImage(fileBuffer, folder, publicId);

  user.avatar_url = result.secure_url;
  await user.save();

  // Optimize: Clean up the old avatar from Cloudinary asynchronously in the background
  if (oldAvatarUrl && oldAvatarUrl.includes('cloudinary.com')) {
    const regex = /\/upload\/(?:v\d+\/)?([^\.]+)/;
    const match = oldAvatarUrl.match(regex);
    if (match && match[1]) {
      deleteImage(match[1]).catch((deleteErr) => {
        console.error('Failed to delete old avatar asynchronously:', deleteErr);
      });
    }
  }

  return result.secure_url;
};

exports.changeUserPassword = async (userId, currentPassword, newPassword, currentToken) => {
  // Optimize: Select only password_hash, email, full_name to reduce document size
  const user = await User.findById(userId).select('password_hash email full_name');
  if (!user) {
    const error = new Error('User does not exist.');
    error.status = 404;
    throw error;
  }

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isPasswordValid) {
    const error = new Error('Current password is incorrect.');
    error.status = 400;
    throw error;
  }

  user.password_hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await user.save();

  sendPasswordChangeNotificationEmail(user.email, user.full_name).catch((mailErr) => {
    console.error('Failed to send password change notification email:', mailErr);
  });
};

exports.deleteUserAvatar = async (userOrId) => {
  let user;
  if (userOrId && typeof userOrId === 'object' && userOrId._id) {
    user = userOrId;
  } else {
    user = await User.findById(userOrId).select('avatar_url');
    if (!user) {
      const error = new Error('User does not exist.');
      error.status = 404;
      throw error;
    }
  }

  const oldAvatarUrl = user.avatar_url;

  // Set avatar_url to empty string to return to default avatar
  user.avatar_url = '';
  await user.save();

  // Clean up the old avatar from Cloudinary asynchronously in the background
  if (oldAvatarUrl && oldAvatarUrl.includes('cloudinary.com')) {
    const regex = /\/upload\/(?:v\d+\/)?([^\.]+)/;
    const match = oldAvatarUrl.match(regex);
    if (match && match[1]) {
      deleteImage(match[1]).catch((deleteErr) => {
        console.error('Failed to delete old avatar asynchronously:', deleteErr);
      });
    }
  }

  return '';
};
