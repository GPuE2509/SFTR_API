const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
  recipient_id: { type: Schema.Types.ObjectId, ref: 'User' },
  title: { 
    type: String, 
    maxlength: [255, 'Title cannot exceed 255 characters'],
    trim: true
  },
  body: { 
    type: String,
    trim: true
  },
  type: { 
    type: String, 
    enum: {
      values: [
        'New_Comment_On_Post', 'New_Reply_On_Comment', 'New_Reply_On_Review', 
        'Admin_Announcement', 'Flood_In_Warning_Zone', 'Emergency_SOS_Nearby', 
        'Workshop_Invite', 'System_Alert'
      ],
      message: 'Invalid notification type'
    }
  },
  reference_id: { type: Schema.Types.ObjectId },
  reference_type: { 
    type: String, 
    enum: {
      values: ['forum_posts', 'post_comments', 'workshop_reviews', 'incident_reports', 'rescue_sessions'],
      message: 'Invalid reference type'
    }
  },
  
  metadata: {
    sender_name: { 
      type: String, 
      maxlength: [100, 'Sender name cannot exceed 100 characters'],
      trim: true
    },
    avatar_url: { 
      type: String, 
      maxlength: [255, 'Avatar URL cannot exceed 255 characters'],
      match: [/^https?:\/\/.+|^$/, 'Avatar URL must be a valid URL or empty']
    },
    flood_depth_mm: { 
      type: Number,
      min: [0, 'Water depth cannot be negative']
    },
    web_url: { 
      type: String, 
      maxlength: [255, 'Web URL cannot exceed 255 characters']
    },
    app_screen: { 
      type: String, 
      maxlength: [100, 'Screen name cannot exceed 100 characters']
    },
    app_params: { type: Schema.Types.Mixed }
  },
  
  is_read: { type: Boolean, default: false },
  is_push_sent: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('Notification', notificationSchema);