const mongoose = require('mongoose');
const { Schema } = mongoose;

const workshopReviewSchema = new Schema({
  workshop_id: { type: Schema.Types.ObjectId, ref: 'Workshop', required: [true, 'Workshop ID is required'] },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User ID is required'] },
  parent_id: { type: Schema.Types.ObjectId, ref: 'WorkshopReview' },
  rating: { 
    type: Number,
    min: [1, 'Minimum rating score is 1'],
    max: [5, 'Maximum rating score is 5']
  },
  content: { 
    type: String,
    trim: true
  },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('WorkshopReview', workshopReviewSchema);
