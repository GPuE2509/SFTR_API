const workshopService = require('../../services/workshop/profileService');

// Get workshop info of current user (to display status)
exports.getWorkshopProfile = async (req, res) => {
  try {
    const workshop = await workshopService.getWorkshop(req.user);
    return res.status(200).json({ workshop });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while fetching workshop information.' });
  }
};

// Update workshop profile information
exports.updateWorkshopProfile = async (req, res) => {
  try {
    const workshop = await workshopService.updateWorkshop(req.user._id, req.body);
    return res.status(200).json({
      message: 'Workshop information updated successfully.',
      workshop
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    return res.status(500).json({ message: 'Server error while updating workshop information.' });
  }
};

exports.uploadCoverPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const cover_url = await workshopService.updateCoverPhoto(req.user._id, req.file.buffer);

    return res.status(200).json({
      message: 'Workshop cover image updated successfully.',
      cover_url
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in PUT workshop cover-photo controller:', error);
    return res.status(500).json({ message: error.message || 'Server error while updating workshop cover image.' });
  }
};

// Get a single workshop by ID (public endpoint for detail view)
exports.getWorkshopById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await workshopService.getWorkshopById(id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error in GET /workshops/:id:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching workshop details.' });
  }
};
