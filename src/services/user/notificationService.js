const User = require('../../models/User');

exports.getUserPreferences = async (user) => {
  const prefs = user.notification_preferences || {};
  return {
    masterPush: prefs.masterPush !== undefined ? prefs.masterPush : true,
    flood: prefs.flood !== undefined ? prefs.flood : true,
    sos: prefs.sos !== undefined ? prefs.sos : true,
    community: prefs.community !== undefined ? prefs.community : true,
    pushChannel: prefs.pushChannel !== undefined ? prefs.pushChannel : true,
    emailChannel: prefs.emailChannel !== undefined ? prefs.emailChannel : false
  };
};

exports.updateUserPreferences = async (userId, preferencesData) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  const { masterPush, flood, sos, community, pushChannel, emailChannel } = preferencesData;

  user.notification_preferences = {
    masterPush: masterPush !== undefined ? masterPush : true,
    flood: flood !== undefined ? flood : true,
    sos: sos !== undefined ? sos : true,
    community: community !== undefined ? community : true,
    pushChannel: pushChannel !== undefined ? pushChannel : true,
    emailChannel: emailChannel !== undefined ? emailChannel : false
  };

  await user.save();
  return user.notification_preferences;
};

exports.markAsRead = async (notificationId, user) => {
  const Notification = require('../../models/Notification');
  const notif = await Notification.findById(notificationId);
  if (!notif) {
    const error = new Error('Notification not found');
    error.status = 404;
    throw error;
  }
  
  const isRecipient = notif.recipient_id && notif.recipient_id.toString() === user._id.toString();
  const isRoleMatch = notif.recipient_role && notif.recipient_role === user.role;
  if (!isRecipient && !isRoleMatch) {
    const error = new Error('Unauthorized');
    error.status = 403;
    throw error;
  }

  notif.is_read = true;
  await notif.save();
  return notif;
};

exports.markAllRead = async (user) => {
  const Notification = require('../../models/Notification');
  await Notification.updateMany(
    {
      $or: [
        { recipient_id: user._id },
        { recipient_role: user.role }
      ],
      is_read: false
    },
    { is_read: true }
  );
};
