const rescueService = require('../../services/rescue/rescueService');
const wsHelper = require('../../utils/wsHelper');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Handle HTTP request to send an emergency rescue request
 */
exports.createRescueRequest = async (req, res) => {
  try {
    const { sender_phone, emergency_type, custom_emergency_type, initial_lng, initial_lat, description, photos } = req.body;

    // 1. Validations
    if (!sender_phone) {
      return res.status(400).json({ success: false, message: 'Contact phone number is required.' });
    }
    if (!emergency_type) {
      return res.status(400).json({ success: false, message: 'Emergency type is required.' });
    }
    const allowedTypes = ['Trapped_By_Flood', 'Medical', 'Vehicle_Broken', 'Other'];
    if (!allowedTypes.includes(emergency_type)) {
      return res.status(400).json({ success: false, message: 'Invalid emergency type.' });
    }
    if (emergency_type === 'Other' && (!custom_emergency_type || !custom_emergency_type.trim())) {
      return res.status(400).json({ success: false, message: 'Please enter details for the other emergency situation.' });
    }

    if (initial_lat == null || initial_lng == null) {
      return res.status(400).json({ success: false, message: 'Rescue location coordinates (longitude, latitude) are required.' });
    }

    const lat = parseFloat(initial_lat);
    const lng = parseFloat(initial_lng);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ success: false, message: 'Latitude must be between -90 and 90.' });
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ success: false, message: 'Longitude must be between -180 and 180.' });
    }

    // 2. Upload photos to Cloudinary if provided
    let photosJson = '';
    if (photos && Array.isArray(photos) && photos.length > 0) {
      const uploadPromises = photos.map(async (imgBase64) => {
        if (imgBase64) {
          try {
            const result = await cloudinary.uploader.upload(imgBase64, {
              folder: 'sftr_rescue_photos'
            });
            return result.secure_url;
          } catch (uploadErr) {
            console.error('Failed to upload rescue photo to Cloudinary:', uploadErr);
            return null;
          }
        }
        return null;
      });
      const urls = (await Promise.all(uploadPromises)).filter(url => url !== null);
      photosJson = JSON.stringify(urls);
    }

    const requester_id = req.user._id;

    // 3. Delegate to Service Layer
    const result = await rescueService.createRescueRequest({
      requester_id,
      sender_phone,
      emergency_type,
      custom_emergency_type: emergency_type === 'Other' ? custom_emergency_type.trim() : '',
      photos: photosJson,
      initial_lng: lng,
      initial_lat: lat,
      description: description || ''
    }, req.user);

    // 3. Return response
    return res.status(201).json({
      success: true,
      message: `Emergency SOS signal sent successfully. Notified ${result.notifiedCount} nearby volunteers.`,
      data: result.rescueSession,
      notifiedCount: result.notifiedCount,
      notifiedVolunteers: result.notifiedVolunteers
    });
  } catch (error) {
    console.error('Error in createRescueRequest controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error sending rescue request.',
      error: error.message
    });
  }
};

/**
 * Handle HTTP request to get active rescue requests for current volunteer
 */
exports.getActiveRescueRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    const requests = await rescueService.getActiveRescueRequestsForVolunteer(userId);

    return res.status(200).json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Error in getActiveRescueRequests controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving rescue requests.',
      error: error.message
    });
  }
};

/**
 * Handle HTTP request to accept a pending rescue request
 */
exports.acceptRescueRequest = async (req, res) => {
  try {
    const rescueSessionId = req.params.id;
    const userId = req.user._id;

    const rescueSession = await rescueService.acceptRescueRequest(rescueSessionId, userId);

    // Broadcast websocket update
    wsHelper.broadcast({ type: 'MAP_UPDATE' });
    wsHelper.sendToUser(rescueSession.requester_id, {
      type: 'rescue_status_update',
      rescueSessionId: rescueSession._id,
      status: rescueSession.status
    });

    return res.status(200).json({
      success: true,
      message: 'Rescue request accepted successfully.',
      data: rescueSession
    });
  } catch (error) {
    console.error('Error in acceptRescueRequest controller:', error);
    const statusCode = error.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Server error accepting rescue request.',
      error: error.message
    });
  }
};

/**
 * Handle HTTP request to get the user's own current active rescue request
 */
exports.getCurrentRescueRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const currentRescue = await rescueService.getCurrentRescueRequestForUser(userId);

    return res.status(200).json({
      success: true,
      data: currentRescue
    });
  } catch (error) {
    console.error('Error in getCurrentRescueRequest controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving current rescue request.',
      error: error.message
    });
  }
};

/**
 * Handle HTTP request to cancel an active rescue request
 */
exports.cancelRescueRequest = async (req, res) => {
  try {
    const rescueSessionId = req.params.id;
    const userId = req.user._id;

    const rescueSession = await rescueService.cancelRescueRequest(rescueSessionId, userId);

    // Broadcast websocket update
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    return res.status(200).json({
      success: true,
      message: 'Rescue request cancelled successfully.',
      data: rescueSession
    });
  } catch (error) {
    console.error('Error in cancelRescueRequest controller:', error);
    const statusCode = error.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Server error cancelling rescue request.',
      error: error.message
    });
  }
};

/**
 * Handle HTTP request to start moving to a rescue request (volunteer only)
 */
exports.startRescueRequest = async (req, res) => {
  try {
    const rescueSessionId = req.params.id;
    const userId = req.user._id;

    const rescueSession = await rescueService.startRescueRequest(rescueSessionId, userId);

    // Broadcast websocket update
    wsHelper.broadcast({ type: 'MAP_UPDATE' });
    wsHelper.sendToUser(rescueSession.requester_id, {
      type: 'rescue_status_update',
      rescueSessionId: rescueSession._id,
      status: rescueSession.status
    });

    return res.status(200).json({
      success: true,
      message: 'Mission marked as in progress successfully.',
      data: rescueSession
    });
  } catch (error) {
    console.error('Error in startRescueRequest controller:', error);
    const statusCode = error.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Server error starting mission.',
      error: error.message
    });
  }
};

/**
 * Handle HTTP request to mark volunteer as arrived (volunteer only)
 */
exports.arriveRescueRequest = async (req, res) => {
  try {
    const rescueSessionId = req.params.id;
    const userId = req.user._id;

    const rescueSession = await rescueService.arriveRescueRequest(rescueSessionId, userId);

    // Broadcast websocket update
    wsHelper.broadcast({ type: 'MAP_UPDATE' });
    wsHelper.sendToUser(rescueSession.requester_id, {
      type: 'rescue_status_update',
      rescueSessionId: rescueSession._id,
      status: rescueSession.status
    });

    return res.status(200).json({
      success: true,
      message: 'Volunteer marked as arrived at scene successfully.',
      data: rescueSession
    });
  } catch (error) {
    console.error('Error in arriveRescueRequest controller:', error);
    const statusCode = error.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Server error marking arrival.',
      error: error.message
    });
  }
};

/**
 * Handle HTTP request to complete a rescue request (volunteer only)
 */
exports.completeRescueRequest = async (req, res) => {
  try {
    const rescueSessionId = req.params.id;
    const userId = req.user._id;

    const rescueSession = await rescueService.completeRescueRequest(rescueSessionId, userId);

    // Broadcast websocket update
    wsHelper.broadcast({ type: 'MAP_UPDATE' });
    wsHelper.sendToUser(rescueSession.requester_id, {
      type: 'rescue_status_update',
      rescueSessionId: rescueSession._id,
      status: rescueSession.status
    });

    return res.status(200).json({
      success: true,
      message: 'Mission marked as completed successfully.',
      data: rescueSession
    });
  } catch (error) {
    console.error('Error in completeRescueRequest controller:', error);
    const statusCode = error.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Server error completing mission.',
      error: error.message
    });
  }
};

/**
 * Handle HTTP request to confirm requester's safety
 */
exports.confirmSafety = async (req, res) => {
  try {
    const rescueSessionId = req.params.id;
    const userId = req.user._id;
    const { safe_photos } = req.body;

    const rescueSession = await rescueService.confirmSafety(rescueSessionId, userId, safe_photos);

    // Broadcast updates
    wsHelper.broadcast({ type: 'MAP_UPDATE' });
    wsHelper.sendToUser(rescueSession.requester_id, {
      type: 'rescue_status_update',
      rescueSessionId: rescueSession._id,
      status: rescueSession.status
    });

    return res.status(200).json({
      success: true,
      message: 'Safety confirmed successfully, rescue completed.',
      data: rescueSession
    });
  } catch (error) {
    console.error('Error in confirmSafety controller:', error);
    const statusCode = error.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Server error confirming safety.',
      error: error.message
    });
  }
};


