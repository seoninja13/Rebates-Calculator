const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rebates-cache';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Cache schema
const cacheSchema = new mongoose.Schema({
  key: { 
    type: String, 
    required: true, 
    unique: true 
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    expires: 86400 // 24 hours in seconds
  }
});

// Create TTL index on createdAt field
cacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

const Cache = mongoose.model('Cache', cacheSchema);

module.exports = {
  Cache,
  mongoose
};
