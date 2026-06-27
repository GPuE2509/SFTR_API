const mongoose = require('mongoose');
const { Schema } = mongoose;

const rescueSessionSchema = new Schema({
  requester_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'Requester ID is required'] },
  sender_phone: { 
    type: String, 
    maxlength: [20, 'Phone number cannot exceed 20 characters'],
    match: [/^[\d\+\-\(\)\s]+$/, 'Invalid phone number']
  },
  emergency_type: { 
    type: String, 
    enum: {
      values: ['Trapped_By_Flood', 'Medical', 'Vehicle_Broken'],
      message: 'Invalid warning type'
    }
  },
  initial_lng: { 
    type: Number,
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180']
  },
  initial_lat: { 
    type: Number,
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90']
  },
  assigned_volunteer_id: { type: Schema.Types.ObjectId, ref: 'Volunteer' },
  assigned_staff_id: { type: Schema.Types.ObjectId, ref: 'WorkshopStaff' },
  status: { 
    type: String, 
    enum: {
      values: ['Pending', 'Assigned', 'In_Progress', 'Completed', 'Cancelled'],
      message: 'Invalid rescue status'
    },
    default: 'Pending' 
  },
  safe_checked_in: { type: Boolean, default: false },
  completed_at: { type: Date }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('RescueSession', rescueSessionSchema);
