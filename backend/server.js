require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://azartechnet_db_user:admin@cluster0.musk1ed.mongodb.net/coding-test-platform';

// CORS
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.options('*', cors());
app.use(express.json());

// ==========================================
// ROUTES - Defined directly in server.js for simplicity
// ==========================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

// Import models
let User, Test, Submission;
try {
  const models = require('./models/Schemas');
  User = models.User;
  Test = models.Test;
  Submission = models.Submission;
  console.log('✅ Models loaded successfully');
} catch (error) {
  console.error('❌ Error loading models:', error.message);
  // Create fallback models
  const UserSchema = new mongoose.Schema({
    name: String, email: String, password: String, 
    role: { type: String, default: 'student' },
    center: { type: String, default: '' },
    isActive: { type: Boolean, default: false }
  });
  User = mongoose.model('User', UserSchema);
  Test = mongoose.model('Test', new mongoose.Schema({ title: String }));
  Submission = mongoose.model('Submission', new mongoose.Schema({ student: Object }));
}

// ==========================================
// AUTH ROUTES
// ==========================================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, center } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'student',
      center: center || '',
      isActive: role === 'admin' ? true : false
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: user.isActive ? 'User registered successfully' : 'User registered. Waiting for approval.',
      token: user.isActive ? token : null,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        center: user.center,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (user.role !== 'admin' && !user.isActive) {
      return res.status(403).json({ error: 'Account pending approval' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        center: user.center,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

// Get pending users
app.get('/api/admin/pending-users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await User.findById(decoded.id);
    
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pending = await User.find({ 
      isActive: false, 
      role: { $in: ['student', 'trainer'] } 
    }).select('-password');
    
    res.json(pending);
  } catch (error) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve user
app.patch('/api/admin/approve-user/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await User.findById(decoded.id);
    
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const userId = req.params.id;
    console.log('📤 Approving user with ID:', userId);
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('📤 Current user status:', { 
      name: user.name, 
      email: user.email, 
      isActive: user.isActive 
    });
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isActive: true },
      { new: true }
    ).select('-password');
    
    console.log('✅ User approved:', { 
      name: updatedUser.name, 
      email: updatedUser.email, 
      isActive: updatedUser.isActive 
    });
    
    res.json({ 
      message: 'User approved successfully', 
      user: updatedUser 
    });
  } catch (error) {
    console.error('❌ Error approving user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users
app.get('/api/admin/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await User.findById(decoded.id);
    
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get admin overview
app.get('/api/admin/overview', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await User.findById(decoded.id);
    
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalTrainers = await User.countDocuments({ role: 'trainer' });
    const totalTests = await Test.countDocuments();
    const totalSubmissions = await Submission.countDocuments();

    const CENTERS = ['Karur', 'Namakkal', 'Coimbatore', 'Dindigul'];
    const centerStats = await Promise.all(CENTERS.map(async (center) => ({
      center,
      students: await User.countDocuments({ role: 'student', center }),
      trainers: await User.countDocuments({ role: 'trainer', center })
    })));

    res.json({ 
      totalStudents, 
      totalTrainers, 
      totalTests, 
      totalSubmissions, 
      centerStats 
    });
  } catch (error) {
    console.error('Error fetching admin overview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all tests (admin)
app.get('/api/admin/tests', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await User.findById(decoded.id);
    
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const tests = await Test.find().populate('createdBy', 'name email center');
    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all submissions (admin)
app.get('/api/admin/submissions', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await User.findById(decoded.id);
    
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const submissions = await Submission.find()
      .populate('student', 'name email center')
      .populate('test', 'title subject');
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// TEST ROUTES
// ==========================================

// Get all tests (for students/trainers)
app.get('/api/tests', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    let tests;
    if (user.role === 'trainer' || user.role === 'admin') {
      tests = await Test.find({ createdBy: user._id });
    } else {
      tests = await Test.find({ assignedStudents: user._id });
    }
    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create test
app.post('/api/tests', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'trainer' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Trainer access required' });
    }

    const { title, description, duration, questions, subject, assignedStudents } = req.body;

    if (!title || !duration) {
      return res.status(400).json({ error: 'Title and duration are required' });
    }

    const test = new Test({
      title,
      description: description || '',
      duration,
      questions: questions || [],
      subject: subject || 'General',
      assignedStudents: assignedStudents || [],
      createdBy: user._id
    });

    await test.save();
    res.status(201).json(test);
  } catch (error) {
    console.error('Error creating test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete test (admin)
app.delete('/api/admin/tests/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await User.findById(decoded.id);
    
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const test = await Test.findByIdAndDelete(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin)
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await User.findById(decoded.id);
    
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/', (req, res) => {
  res.json({
    message: "Coding Assessment Platform API is running",
    status: "Healthy",
    time: new Date()
  });
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// ==========================================
// DATABASE CONNECTION
// ==========================================
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB successfully.");
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });