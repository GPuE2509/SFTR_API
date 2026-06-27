const mongoose = require('mongoose');
const { Schema } = mongoose;

const warningZoneSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User ID is required'] },
  zone_name: { 
    type: String, 
    maxlength: [100, 'Warning zone name cannot exceed 100 characters'],
    trim: true
  },
  location: {
    type: { 
      type: String, 
      enum: {
        values: ['Point', 'Polygon'],
        message: 'Zone type must be Point or Polygon'
      },
      required: [true, 'Zone type is required']
    },
    coordinates: { type: Schema.Types.Mixed, required: [true, 'Coordinates are required'] } 
  },
  radius_meters: { 
    type: Number,
    min: [0, 'Radius cannot be negative']
  },
  is_active: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

warningZoneSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('WarningZone', warningZoneSchema);
