const IncidentReport = require('../../models/IncidentReport');
const User = require('../../models/User');
const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

/**
 * Haversine formula: tính khoảng cách giữa 2 tọa độ GPS (đơn vị: mét)
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // radius of Earth in meters
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Xác định trọng số (weight) của mỗi vote dựa trên contribution_points
 * Level 1 (<50): 1 điểm
 * Level 2 (50-199): 2 điểm  
 * Level 3 (>=200): 3 điểm
 */
function getVoteWeight(contributionPoints) {
  if (contributionPoints >= 200) return 3;
  if (contributionPoints >= 50) return 2;
  return 1;
}

// Create a new incident report
exports.createReport = async (req, res) => {
  try {
    const { 
      reporter_id,
      title, 
      description, 
      images, 
      lng, 
      lat, 
      report_type, 
      ai_confidence_score, 
      is_approved_by_ai,
      duration_hours  // Thời gian tồn tại dự kiến: 0.5, 1, 3, 6, 12 (giờ)
    } = req.body;

    let parsedImages = [];
    try {
      if (typeof images === 'string') {
        parsedImages = JSON.parse(images);
      } else if (Array.isArray(images)) {
        parsedImages = images;
      }
    } catch(e) {}

    const uploadPromises = parsedImages.map(async (img) => {
      let base64Data = '';
      if (typeof img === 'string') { 
        base64Data = img;
      } else if (img && img.url) { 
        base64Data = img.url;
      }

      if (base64Data) {
        try {
          // Upload to Cloudinary. base64Data should be a Data URI (e.g. data:image/jpeg;base64,...)
          const result = await cloudinary.uploader.upload(base64Data, {
            folder: 'sftr_incident_reports'
          });
          return { url: result.secure_url, name: `cloudinary_${result.public_id}` };
        } catch (error) {
          console.error('Cloudinary upload error:', error);
          return null;
        }
      }
      return null;
    });

    const results = await Promise.all(uploadPromises);
    const savedImageUrls = results.filter(r => r !== null);

    // Tính expiredAt từ duration_hours
    let expiredAt = null;
    if (duration_hours && !isNaN(parseFloat(duration_hours))) {
      expiredAt = new Date(Date.now() + parseFloat(duration_hours) * 60 * 60 * 1000);
    }

    const reportData = {
      title,
      description,
      images: JSON.stringify(savedImageUrls),
      lng,
      lat,
      report_type,
      ai_confidence_score,
      is_approved_by_ai,
      moderation_status: 'Pending',
      lifecycle_status: 'Active',
      expiredAt,
      expiration_notified: false
    };
    
    // Only set reporter_id if it's a valid object ID string
    const mongoose = require('mongoose');
    if (reporter_id && mongoose.Types.ObjectId.isValid(reporter_id)) {
      // Also ensure it's precisely 24 hex characters, otherwise isValid might have false positives (like any 12 byte string)
      if (String(reporter_id).length === 24) {
        reportData.reporter_id = reporter_id;
      }
    }

    const newReport = new IncidentReport(reportData);

    const savedReport = await newReport.save();

    const { checkAndTriggerWarningZoneAlerts } = require('../../utils/warningZoneHelper');
    checkAndTriggerWarningZoneAlerts(savedReport.lat, savedReport.lng, {
      title: `Cảnh báo ngập lụt từ cộng đồng: ${savedReport.title}`,
      body: savedReport.description || `Có báo cáo ngập lụt tại khu vực lân cận.`,
      type: 'Flood_In_Warning_Zone',
      reference_id: savedReport._id,
      reference_type: 'incident_reports',
      metadata: {
        sender_name: 'Cộng đồng',
        web_url: `/reports`,
      }
    }).catch(err => console.error('Error triggering warning zone alerts from user report:', err));

    // Notify Admin and Manager roles about new pending review report
    try {
      const Notification = require('../../models/Notification');
      const districtStr = savedReport.district || 'nearby';
      await Notification.create({
        recipient_role: 'Admin',
        title: 'New Incident Report Pending Review',
        body: `A new report "${savedReport.title}" has been submitted in ${districtStr} and is pending review.`,
        type: 'System_Alert',
        reference_id: savedReport._id,
        reference_type: 'incident_reports',
        metadata: {
          sender_name: 'System',
          web_url: `/reports`
        }
      });

      await Notification.create({
        recipient_role: 'Manager',
        title: 'New Incident Report Pending Review',
        body: `A new report "${savedReport.title}" has been submitted in ${districtStr} and is pending review.`,
        type: 'System_Alert',
        reference_id: savedReport._id,
        reference_type: 'incident_reports',
        metadata: {
          sender_name: 'System',
          web_url: `/reports`
        }
      });
    } catch (err) {
      console.error('Failed to create incident report notifications:', err);
    }

    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    res.status(201).json({ success: true, data: savedReport });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get all incident reports
exports.getReports = async (req, res) => {
  try {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit) || 5;

    if (page) {
      const skip = (page - 1) * limit;
      const total = await IncidentReport.countDocuments();
      const reports = await IncidentReport.find()
        .populate('reporter_id', 'full_name')
        .sort({ created_at: -1 }).skip(skip).limit(limit);
      return res.status(200).json({ 
        success: true, 
        data: reports,
        pagination: { total, page, pages: Math.ceil(total / limit) }
      });
    } else {
      // Backward compatibility for mobile app
      const reports = await IncidentReport.find()
        .populate('reporter_id', 'full_name')
        .sort({ created_at: -1 });
      return res.status(200).json({ success: true, data: reports });
    }
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get count of new reports since a timestamp
exports.getNewCount = async (req, res) => {
  try {
    const { since } = req.query;
    const query = since && !isNaN(parseInt(since)) ? { created_at: { $gt: new Date(parseInt(since)) } } : {};
    const count = await IncidentReport.countDocuments(query);
    res.status(200).json({ success: true, count });
  } catch (error) {
    console.error('Error getting new count:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get a single incident report by ID
exports.getReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await IncidentReport.findById(id)
      .populate('reporter_id', 'full_name avatar_url contribution_points')
      .populate('voters.user_id', 'full_name avatar_url contribution_points');
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Vote on an incident report (with GPS validation + reputation system)
exports.voteReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { vote_type, user_id, lat, lng, photo_urls } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: 'user_id is required' });
    }
    if (vote_type !== null && !['confirm', 'deny', 'false'].includes(vote_type)) {
      return res.status(400).json({ success: false, message: 'vote_type must be confirm, deny, false, or null to unvote' });
    }

    const report = await IncidentReport.findById(id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    if (report.lifecycle_status === 'Archived') {
      return res.status(400).json({ success: false, message: 'Cannot vote on an archived report' });
    }

    // === GPS proximity check (nếu có lat/lng từ voter) ===
    let distance_m = null;
    const MAX_DISTANCE_M = 150;
    if (lat != null && lng != null && report.lat != null && report.lng != null) {
      distance_m = Math.round(haversineDistance(parseFloat(lat), parseFloat(lng), report.lat, report.lng));
      // Không từ chối vote ngoài 150m — vote vẫn được lưu nhưng sẽ không tính vào ngưỡng deny
    }

    // === Kiểm tra user đã vote chưa ===
    const mongoose = require('mongoose');
    const userObjectId = mongoose.Types.ObjectId.isValid(user_id) ? new mongoose.Types.ObjectId(user_id) : null;
    const existingVoteIndex = report.voters.findIndex(v => v.user_id?.toString() === user_id.toString());

    if (existingVoteIndex !== -1) {
      const prev = report.voters[existingVoteIndex].vote_type;
      if (prev === 'confirm') report.vote_still_exist = Math.max(0, report.vote_still_exist - 1);
      else if (prev === 'deny') report.vote_no_more = Math.max(0, report.vote_no_more - 1);
      else if (prev === 'false') report.vote_wrong_report = Math.max(0, report.vote_wrong_report - 1);
      report.voters.splice(existingVoteIndex, 1);
    }

    // Thêm vote mới nếu có
    if (vote_type) {
      if (vote_type === 'confirm') report.vote_still_exist += 1;
      else if (vote_type === 'deny') report.vote_no_more += 1;
      else if (vote_type === 'false') report.vote_wrong_report += 1;

      let finalPhotoUrl = null;
      if (photo_urls && Array.isArray(photo_urls) && photo_urls.length > 0) {
        const uploadedUrls = [];
        for (const p of photo_urls) {
          if (p && p.startsWith('data:image')) {
            try {
              const result = await cloudinary.uploader.upload(p, { folder: 'incident_reports' });
              uploadedUrls.push(result.secure_url);
            } catch (err) {
              console.error('Error uploading vote photo:', err);
            }
          } else if (p && p.startsWith('http')) {
            uploadedUrls.push(p);
          }
        }
        if (uploadedUrls.length > 0) {
          finalPhotoUrl = JSON.stringify(uploadedUrls);
        }
      }

      report.voters.push({
        user_id: userObjectId || user_id,
        vote_type,
        lat: lat ? parseFloat(lat) : undefined,
        lng: lng ? parseFloat(lng) : undefined,
        distance_m,
        photo_url: finalPhotoUrl || undefined,
        created_at: new Date()
      });

      // === Logic tự động xử lý vòng đời ===
      if (vote_type === 'confirm') {
        // Gia hạn thêm 1 giờ từ thời điểm hiện tại
        const extension = 60 * 60 * 1000; // 1 giờ
        report.expiredAt = new Date(Math.max(Date.now(), (report.expiredAt || Date.now())) + extension);
        report.lifecycle_status = 'Active';
        report.expiration_notified = false;
      } else if (vote_type === 'deny' || vote_type === 'false') {
        // Đếm tổng trọng số của các deny/false votes hợp lệ:
        // - Có GPS và ở trong phạm vi 150m, HOẶC
        // - Có ảnh bằng chứng (không cần GPS)
        const validDenyVotes = report.voters.filter(v =>
          (v.vote_type === 'deny' || v.vote_type === 'false') &&
          ((v.distance_m != null && v.distance_m <= MAX_DISTANCE_M) || v.photo_url)
        );

        let totalDenyWeight = 0;
        if (validDenyVotes.length > 0) {
          // Lấy điểm uy tín của tất cả những người đã vote deny hợp lệ
          const voterIds = validDenyVotes.map(v => v.user_id);
          const votersInfo = await User.find({ _id: { $in: voterIds } }).select('contribution_points');
          
          for (const v of validDenyVotes) {
            const uInfo = votersInfo.find(u => u._id.toString() === v.user_id.toString());
            const pts = uInfo?.contribution_points || 0;
            totalDenyWeight += getVoteWeight(pts);
          }
        }

        // Ngưỡng cố định là 3 điểm trọng số
        if (totalDenyWeight >= 3) {
          report.lifecycle_status = 'Archived';
        }
      }
    }

    // === Tích điểm contribution cho voter (nếu vote có GPS hợp lệ) ===
    if (distance_m != null && userObjectId) {
      try {
        await User.findByIdAndUpdate(userObjectId, { $inc: { contribution_points: 2, weekly_points: 2, monthly_points: 2 } });
      } catch (err) {
        console.error('Failed to update contribution points:', err);
      }
    }

    const savedReport = await report.save();

    // Notify manager nếu bị archive tự động
    if (savedReport.lifecycle_status === 'Archived') {
      try {
        const Notification = require('../../models/Notification');
        await Notification.create({
          recipient_role: 'Manager',
          title: `Report Auto-Archived: ${savedReport.title}`,
          body: `Report "${savedReport.title}" has been automatically archived based on community votes.`,
          type: 'System_Alert',
          reference_id: savedReport._id,
          reference_type: 'incident_reports',
          metadata: { sender_name: 'Community Vote', web_url: '/reports' }
        });
      } catch (err) {
        console.error('Failed to notify manager of auto-archive:', err);
      }
    }

    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    res.status(200).json({ success: true, data: savedReport, distance_m });
  } catch (error) {
    console.error('Error voting on report:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Update incident report moderation status (Approve/Reject) hoặc lifecycle status (Archive)
exports.updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const report = await IncidentReport.findById(id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    // Nếu là archive: cập nhật lifecycle_status
    if (status === 'archive') {
      report.lifecycle_status = 'Archived';
      // Tích điểm cho người tạo report nếu được Approve trước đó
    } else if (['approved', 'rejected', 'pending'].includes(status)) {
      const mappedStatus = status.charAt(0).toUpperCase() + status.slice(1);
      report.moderation_status = mappedStatus;
      // Khi manager approve report mới, tích 5 điểm cho người tạo
      if (status === 'approved' && report.reporter_id) {
        try {
          await User.findByIdAndUpdate(report.reporter_id, {
            $inc: { contribution_points: 5, weekly_points: 5, monthly_points: 5 }
          });
        } catch (err) {
          console.error('Failed to award reporter points:', err);
        }
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid status. Use: approved, rejected, pending, archive' });
    }

    await report.save();

    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    res.status(200).json({ success: true, message: 'Report status updated', data: report });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
