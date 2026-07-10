const Notification = require('../../models/Notification');
const notificationService = require('../../services/user/notificationService');

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const notifications = await Notification.find({
      $or: [
        { recipient_id: userId },
        { recipient_role: userRole }
      ]
    })
      .sort({ created_at: -1 })
      .exec();

    return res.status(200).json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error in getNotifications controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching notifications.'
    });
  }
};

exports.getPreferences = async (req, res) => {
  try {
    const preferences = await notificationService.getUserPreferences(req.user);
    return res.status(200).json({ success: true, data: preferences });
  } catch (error) {
    console.error('Error in getPreferences controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching notification preferences.' });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const preferences = await notificationService.updateUserPreferences(req.user._id, req.body);
    return res.status(200).json({ success: true, message: 'Notification preferences updated successfully.', data: preferences });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error in updatePreferences controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating notification preferences.' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await notificationService.markAsRead(id, req.user);
    return res.status(200).json({ success: true, message: 'Notification marked as read.', data: notification });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error in markAsRead controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while marking notification as read.' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await notificationService.markAllRead(req.user);
    return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('Error in markAllRead controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while marking all notifications as read.' });
  }
};
