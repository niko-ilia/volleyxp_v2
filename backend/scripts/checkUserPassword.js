const mongoose = require('mongoose');
const User = require('../models/User');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node checkUserPassword.js <email>');
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost/volley-match', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found');
    } else {
      console.log('Email:', user.email);
      console.log('Password:', user.password);
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Mongo connection error:', err);
    process.exit(2);
  }); 