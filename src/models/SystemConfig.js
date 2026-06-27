const mongoose = require('mongoose');
const { Schema } = mongoose;

const systemConfigSchema = new Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'default'
  },
  water_level_l1: { type: Number, default: 20 },
  water_level_l2: { type: Number, default: 40 },
  water_level_l3: { type: Number, default: 50 },
  water_level_l4: { type: Number, default: 60 },
}, { timestamps: true });

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
