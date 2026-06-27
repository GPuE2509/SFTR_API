const IncidentReport = require('../../models/IncidentReport');
const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

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
      is_approved_by_ai
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

    const reportData = {
      title,
      description,
      images: JSON.stringify(savedImageUrls),
      lng,
      lat,
      report_type,
      ai_confidence_score,
      is_approved_by_ai,
      moderation_status: 'Pending'
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

// Vote on an incident report
exports.voteReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { vote_type, user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: 'user_id is required' });
    }

    const report = await IncidentReport.findById(id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    // Find if user already voted
    const existingVoteIndex = report.voters.findIndex(v => v.user_id === user_id);
    let previous_vote = null;

    if (existingVoteIndex !== -1) {
      previous_vote = report.voters[existingVoteIndex].vote_type;
      
      // Decrement previous vote count
      if (previous_vote === 'confirm') {
        report.vote_still_exist = Math.max(0, (report.vote_still_exist || 0) - 1);
      } else if (previous_vote === 'deny') {
        report.vote_no_more = Math.max(0, (report.vote_no_more || 0) - 1);
      } else if (previous_vote === 'false') {
        report.vote_wrong_report = Math.max(0, (report.vote_wrong_report || 0) - 1);
      }

      // Remove the existing vote from array
      report.voters.splice(existingVoteIndex, 1);
    }

    // Add new vote if vote_type is provided (not null/un-vote)
    if (vote_type && ['confirm', 'deny', 'false'].includes(vote_type)) {
      if (vote_type === 'confirm') {
        report.vote_still_exist = (report.vote_still_exist || 0) + 1;
      } else if (vote_type === 'deny') {
        report.vote_no_more = (report.vote_no_more || 0) + 1;
      } else if (vote_type === 'false') {
        report.vote_wrong_report = (report.vote_wrong_report || 0) + 1;
      }

      // Push to voters array
      report.voters.push({ user_id, vote_type });
    }

    const savedReport = await report.save();
    res.status(200).json({ success: true, data: savedReport });
  } catch (error) {
    console.error('Error voting on report:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Update incident report status (Approve/Reject)
exports.updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const report = await IncidentReport.findById(id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const mappedStatus = status.charAt(0).toUpperCase() + status.slice(1);
    report.moderation_status = mappedStatus;
    await report.save();

    res.status(200).json({ success: true, message: 'Report status updated', data: report });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
