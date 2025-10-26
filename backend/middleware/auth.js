const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    let token = req.header('Authorization')?.replace('Bearer ', '');
    // Fallbacks for environments where Authorization header is stripped (e.g., iframe data-auth-url bridges)
    if (!token && req.query && typeof req.query.jwt === 'string') token = req.query.jwt;
    if (!token && req.body && typeof req.body.jwt === 'string') token = req.body.jwt;
    if (!token && req.body && typeof req.body.token === 'string') token = req.body.token;
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = auth; 