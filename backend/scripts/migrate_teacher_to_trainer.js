require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/Schemas').User;

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/coding-test-platform';
    await mongoose.connect(uri);
    
    console.log('Updating roles from teacher to trainer...');
    const result = await User.updateMany(
      { role: 'teacher' },
      { $set: { role: 'trainer' } }
    );
    
    console.log(`Migration successful. Modified ${result.modifiedCount} users.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
