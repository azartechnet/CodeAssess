const jwt = require('jsonwebtoken');
const { User } = require('../models/Schemas');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_test_key_change_in_production';

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

const requireTrainer = (req, res, next) => {
  if (req.user && req.user.role === 'trainer') {
    next();
  } else {
    return res.status(403).json({ error: 'Forbidden. Trainer access required.' });
  }
};;

const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
};

module.exports = { authenticate, requireTrainer, requireAdmin, JWT_SECRET };
