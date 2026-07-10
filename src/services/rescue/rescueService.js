const RescueSession = require('../../models/RescueSession');
const Volunteer = require('../../models/Volunteer');
const Notification = require('../../models/Notification');

/**
 * Haversine formula to calculate the distance between two GPS coordinates in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Radius of the Earth in meters
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Create a new rescue session and notify all active volunteers within 5km radius
 * @param {Object} sessionData - { requester_id, sender_phone, emergency_type, initial_lng, initial_lat, description }
 * @param {Object} requesterUser - The User document of the requester
 */
exports.createRescueRequest = async (sessionData, requesterUser) => {
  // 1. Save RescueSession to Database
  const rescueSession = new RescueSession({
    requester_id: sessionData.requester_id,
    sender_phone: sessionData.sender_phone,
    emergency_type: sessionData.emergency_type,
    custom_emergency_type: sessionData.custom_emergency_type,
    photos: sessionData.photos,
    initial_lng: sessionData.initial_lng,
    initial_lat: sessionData.initial_lat,
    description: sessionData.description,
    status: 'Pending',
    safe_checked_in: false
  });

  const savedSession = await rescueSession.save();

  // 2. Fetch all active/available volunteers
  const activeVolunteers = await Volunteer.find({
    status: { $in: ['Approved', 'Available', 'Busy'] }
  }).populate('user_id');

  const notifiedVolunteers = [];
  const MAX_RADIUS_METERS = 5000; // 5 km radius

  // Map emergency type to a user-friendly English text for notifications
  const emergencyTypeLabels = {
    'Trapped_By_Flood': 'Trapped in flooded area',
    'Medical': 'Urgent medical support needed',
    'Vehicle_Broken': 'Vehicle broken/engine stalled due to flood',
    'Other': sessionData.custom_emergency_type || 'Other emergency rescue request'
  };
  const emergencyTypeLabel = emergencyTypeLabels[sessionData.emergency_type] || 'Emergency rescue request';

  // 3. Filter nearby volunteers and notify them
  for (const volunteer of activeVolunteers) {
    if (volunteer.current_lat != null && volunteer.current_lng != null) {
      const distance = haversineDistance(
        parseFloat(sessionData.initial_lat),
        parseFloat(sessionData.initial_lng),
        parseFloat(volunteer.current_lat),
        parseFloat(volunteer.current_lng)
      );

      if (distance <= MAX_RADIUS_METERS) {
        try {
          // Create a Notification. The post-save hook on Notification model
          // automatically sends a WebSocket event to the volunteer.
          const notification = await Notification.create({
            recipient_id: volunteer.user_id._id,
            recipient_role: 'Volunteer',
            title: 'Yêu cầu cứu hộ khẩn cấp gần bạn',
            body: `Yêu cầu mới: "${emergencyTypeLabel}". Cách bạn ${Math.round(distance)}m. SĐT: ${sessionData.sender_phone}`,
            type: 'Emergency_SOS_Nearby',
            reference_id: savedSession._id,
            reference_type: 'rescue_sessions',
            metadata: {
              sender_name: requesterUser.full_name,
              avatar_url: requesterUser.avatar_url || '',
              web_url: '/missions', // Maps to Request SOS page on Volunteer panel
              app_params: {
                lat: sessionData.initial_lat,
                lng: sessionData.initial_lng,
                rescueSessionId: savedSession._id.toString(),
                distance_m: Math.round(distance),
                phone: sessionData.sender_phone,
                description: sessionData.description || '',
                emergency_type: sessionData.emergency_type,
                custom_emergency_type: sessionData.custom_emergency_type || '',
                photos: sessionData.photos || ''
              }
            }
          });

          notifiedVolunteers.push({
            volunteer_id: volunteer._id,
            user_id: volunteer.user_id._id,
            name: volunteer.user_id.full_name,
            distance: Math.round(distance)
          });
        } catch (notifErr) {
          console.error(`Failed to notify volunteer ${volunteer._id}:`, notifErr);
        }
      }
    }
  }

  return {
    rescueSession: savedSession,
    notifiedCount: notifiedVolunteers.length,
    notifiedVolunteers
  };
};

/**
 * Get active rescue requests that are nearby (within 5km) for a specific volunteer
 * @param {string} volunteerUserId - The user ID of the volunteer
 */
exports.getActiveRescueRequestsForVolunteer = async (volunteerUserId) => {
  const volunteer = await Volunteer.findOne({ user_id: volunteerUserId }).sort({ registered_at: -1 });

  const query = {
    $or: [
      { status: 'Pending' }
    ]
  };

  if (volunteer) {
    query.$or.push({
      status: { $in: ['Assigned', 'In_Progress', 'Arrived', 'Completed', 'Cancelled'] },
      assigned_volunteer_id: volunteer._id
    });
  }

  const rescueSessions = await RescueSession.find(query)
  .populate('requester_id', 'full_name avatar_url')
  .populate({
    path: 'assigned_volunteer_id',
    populate: { path: 'user_id', select: 'full_name phone' }
  });

  const resultSessions = [];
  const MAX_RADIUS_METERS = 5000; // 5 km radius

  for (const session of rescueSessions) {
    const isAssignedToMe = volunteer && session.assigned_volunteer_id && session.assigned_volunteer_id._id.toString() === volunteer._id.toString();

    if (session.initial_lat != null && session.initial_lng != null) {
      if (!volunteer || volunteer.current_lat == null || volunteer.current_lng == null) {
        resultSessions.push({
          ...session.toObject(),
          distance: null
        });
        continue;
      }

      const distance = haversineDistance(
        parseFloat(volunteer.current_lat),
        parseFloat(volunteer.current_lng),
        parseFloat(session.initial_lat),
        parseFloat(session.initial_lng)
      );

      if (isAssignedToMe || distance <= MAX_RADIUS_METERS) {
        resultSessions.push({
          ...session.toObject(),
          distance: Math.round(distance)
        });
      }
    } else if (isAssignedToMe) {
      resultSessions.push({
        ...session.toObject(),
        distance: null
      });
    }
  }

  return resultSessions.sort((a, b) => b.created_at - a.created_at);
};

/**
 * Accept a pending rescue request
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} volunteerUserId - The User ID of the accepting volunteer
 */
exports.acceptRescueRequest = async (rescueSessionId, volunteerUserId) => {
  const volunteer = await Volunteer.findOne({ user_id: volunteerUserId }).populate('user_id');
  if (!volunteer) {
    const err = new Error('Only registered volunteers can accept rescue requests.');
    err.status = 403;
    throw err;
  }

  // Check if volunteer has an uncompleted rescue mission
  const activeSession = await RescueSession.findOne({
    assigned_volunteer_id: volunteer._id,
    status: { $in: ['Assigned', 'In_Progress'] }
  });

  if (activeSession) {
    const err = new Error('Bạn đang có một chuyến cứu hộ chưa hoàn thành. Vui lòng hoàn thành chuyến cứu hộ hiện tại trước khi nhận chuyến mới.');
    err.status = 400;
    throw err;
  }

  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  if (rescueSession.status !== 'Pending') {
    const err = new Error('Yêu cầu cứu hộ này đã được tiếp nhận bởi tình nguyện viên khác.');
    err.status = 400;
    throw err;
  }

  rescueSession.status = 'Assigned';
  rescueSession.assigned_volunteer_id = volunteer._id;
  await rescueSession.save();

  try {
    const notification = new Notification({
      recipient_id: rescueSession.requester_id,
      title: 'Rescue request accepted',
      body: `Volunteer ${volunteer.user_id.full_name} has accepted your rescue request and is coordinating assistance.`,
      type: 'System_Alert',
      reference_type: 'rescue_sessions',
      reference_id: rescueSession._id,
      metadata: {
        web_url: '/sos',
        volunteer_name: volunteer.user_id.full_name,
        volunteer_phone: volunteer.user_id.phone || ''
      }
    });
    await notification.save();
  } catch (notifErr) {
    console.error('Failed to create notification for requester:', notifErr);
  }

  return rescueSession;
};

/**
 * Get current active rescue request for the user
 * @param {string} userId - The User ID of the requester
 */
exports.getCurrentRescueRequestForUser = async (userId) => {
  return await RescueSession.findOne({
    requester_id: userId,
    status: { $in: ['Pending', 'Assigned', 'In_Progress', 'Arrived'] }
  })
  .populate({
    path: 'assigned_volunteer_id',
    populate: { path: 'user_id', select: 'full_name phone' }
  });
};

/**
 * Cancel an active rescue request
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} requesterUserId - The User ID of the requester (victim)
 */
exports.cancelRescueRequest = async (rescueSessionId, requesterUserId) => {
  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  if (rescueSession.requester_id.toString() !== requesterUserId.toString()) {
    const err = new Error('You do not have permission to cancel this rescue request.');
    err.status = 403;
    throw err;
  }

  rescueSession.status = 'Cancelled';
  await rescueSession.save();

  if (rescueSession.assigned_volunteer_id) {
    try {
      const volunteer = await Volunteer.findById(rescueSession.assigned_volunteer_id);
      if (volunteer) {
        const wsHelper = require('../../utils/wsHelper');
        wsHelper.sendToUser(volunteer.user_id, {
          type: 'rescue_status_update',
          rescueSessionId: rescueSession._id,
          status: 'Cancelled'
        });

        const notification = new Notification({
          recipient_id: volunteer.user_id,
          title: 'Rescue mission cancelled',
          body: 'The user has cancelled their rescue request.',
          type: 'System_Alert',
          reference_type: 'rescue_sessions',
          reference_id: rescueSession._id,
          metadata: {
            web_url: '/missions'
          }
        });
        await notification.save();
      }
    } catch (notifErr) {
      console.error('Failed to notify volunteer of cancellation:', notifErr);
    }
  }

  return rescueSession;
};

/**
 * Start moving to the rescue scene (volunteer only)
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} volunteerUserId - The User ID of the volunteer
 */
exports.startRescueRequest = async (rescueSessionId, volunteerUserId) => {
  const volunteer = await Volunteer.findOne({ user_id: volunteerUserId }).populate('user_id');
  if (!volunteer) {
    const err = new Error('Only registered volunteers can update rescue status.');
    err.status = 403;
    throw err;
  }

  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  if (rescueSession.assigned_volunteer_id.toString() !== volunteer._id.toString()) {
    const err = new Error('You are not assigned to this rescue request.');
    err.status = 403;
    throw err;
  }

  rescueSession.status = 'In_Progress';
  await rescueSession.save();

  try {
    const notification = new Notification({
      recipient_id: rescueSession.requester_id,
      title: 'Volunteer is moving',
      body: `Volunteer ${volunteer.user_id.full_name} is moving to your location.`,
      type: 'System_Alert',
      reference_type: 'rescue_sessions',
      reference_id: rescueSession._id,
      metadata: {
        web_url: '/sos'
      }
    });
    await notification.save();
  } catch (notifErr) {
    console.error('Failed to notify requester of movement:', notifErr);
  }

  return rescueSession;
};

/**
 * Arrive at the rescue scene (volunteer only)
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} volunteerUserId - The User ID of the volunteer
 */
exports.arriveRescueRequest = async (rescueSessionId, volunteerUserId) => {
  const volunteer = await Volunteer.findOne({ user_id: volunteerUserId }).populate('user_id');
  if (!volunteer) {
    const err = new Error('Only registered volunteers can update rescue status.');
    err.status = 403;
    throw err;
  }

  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  if (rescueSession.assigned_volunteer_id.toString() !== volunteer._id.toString()) {
    const err = new Error('You are not assigned to this rescue request.');
    err.status = 403;
    throw err;
  }

  rescueSession.status = 'Arrived';
  await rescueSession.save();

  try {
    const notification = new Notification({
      recipient_id: rescueSession.requester_id,
      title: 'Volunteer arrived',
      body: `Volunteer ${volunteer.user_id.full_name} has arrived at your location and is assisting.`,
      type: 'System_Alert',
      reference_type: 'rescue_sessions',
      reference_id: rescueSession._id,
      metadata: {
        web_url: '/sos'
      }
    });
    await notification.save();
  } catch (notifErr) {
    console.error('Failed to notify requester of arrival:', notifErr);
  }

  return rescueSession;
};

/**
 * Complete a rescue request (volunteer only)
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} volunteerUserId - The User ID of the volunteer
 */
exports.completeRescueRequest = async (rescueSessionId, volunteerUserId) => {
  const volunteer = await Volunteer.findOne({ user_id: volunteerUserId });
  if (!volunteer) {
    const err = new Error('Only registered volunteers can update rescue status.');
    err.status = 403;
    throw err;
  }

  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  if (rescueSession.assigned_volunteer_id.toString() !== volunteer._id.toString()) {
    const err = new Error('You are not assigned to this rescue request.');
    err.status = 403;
    throw err;
  }

  rescueSession.status = 'Completed';
  rescueSession.completed_at = new Date();
  await rescueSession.save();

  try {
    const notification = new Notification({
      recipient_id: rescueSession.requester_id,
      title: 'Rescue mission completed',
      body: 'Your rescue mission has been marked as completed by the volunteer.',
      type: 'System_Alert',
      reference_type: 'rescue_sessions',
      reference_id: rescueSession._id,
      metadata: {
        web_url: '/sos'
      }
    });
    await notification.save();
  } catch (notifErr) {
    console.error('Failed to notify requester of completion:', notifErr);
  }

  return rescueSession;
};

/**
 * Confirm safety of the victim and complete the rescue session
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} requesterUserId - The User ID of the requester (victim)
 * @param {Array} safePhotos - Optional array of base64 images of safety status
 */
exports.confirmSafety = async (rescueSessionId, requesterUserId, safePhotos) => {
  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  if (rescueSession.requester_id.toString() !== requesterUserId.toString()) {
    const err = new Error('You are not authorized to confirm safety for this rescue request.');
    err.status = 403;
    throw err;
  }

  rescueSession.safe_checked_in = true;
  rescueSession.status = 'Completed';
  rescueSession.completed_at = new Date();
  if (safePhotos && safePhotos.length > 0) {
    rescueSession.safe_photos = JSON.stringify(safePhotos);
  }
  await rescueSession.save();

  // If there is an assigned volunteer, notify them
  if (rescueSession.assigned_volunteer_id) {
    try {
      const volunteer = await Volunteer.findById(rescueSession.assigned_volunteer_id);
      if (volunteer) {
        const wsHelper = require('../../utils/wsHelper');
        wsHelper.sendToUser(volunteer.user_id, {
          type: 'rescue_status_update',
          rescueSessionId: rescueSession._id,
          status: 'Completed'
        });

        const notification = new Notification({
          recipient_id: volunteer.user_id,
          title: 'Rescue mission completed',
          body: 'The victim has confirmed they are safe and marked the mission as completed.',
          type: 'System_Alert',
          reference_type: 'rescue_sessions',
          reference_id: rescueSession._id,
          metadata: {
            web_url: '/missions'
          }
        });
        await notification.save();
      }
    } catch (notifErr) {
      console.error('Failed to notify volunteer of safety confirmation:', notifErr);
    }
  }

  return rescueSession;
};

