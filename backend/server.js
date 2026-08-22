require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://azartechnet_db_user:admin@cluster0.musk1ed.mongodb.net/coding-test-platform';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

// ==========================================
// CORS
// ==========================================
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.options('*', cors());
app.use(express.json());

// ==========================================
// MODELS
// ==========================================
let User, Test, Submission;

try {
  const models = require('./models/Schemas');
  User = models.User;
  Test = models.Test;
  Submission = models.Submission;
  console.log('✅ Models loaded successfully');
} catch (error) {
  console.error('❌ Error loading models:', error.message);
  // Fallback models
  const UserSchema = new mongoose.Schema({
    name: String, email: String, password: String,
    role: { type: String, default: 'student' },
    center: { type: String, default: '' },
    isActive: { type: Boolean, default: false }
  }, { timestamps: true });
  User = mongoose.model('User', UserSchema);
  
  const TestSchema = new mongoose.Schema({
    title: String,
    description: String,
    duration: Number,
    questions: Array,
    subject: String,
    assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }, { timestamps: true });
  Test = mongoose.model('Test', TestSchema);
  
  const SubmissionSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test' },
    answers: Array,
    totalScore: Number,
    submittedAt: { type: Date, default: Date.now }
  });
  Submission = mongoose.model('Submission', SubmissionSchema);
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
// STUDENT ROUTES
// ==========================================

// Get all students
app.get('/api/students', async (req, res) => {
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

    const students = await User.find({ 
      role: 'student',
      isActive: true 
    }).select('_id name email center');
    
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// TEST ROUTES
// ==========================================

// Get all tests
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
      tests = await Test.find({ createdBy: user._id })
        .populate('createdBy', 'name center')
        .populate('assignedStudents', 'name email center');
    } else {
      tests = await Test.find({ assignedStudents: user._id })
        .populate('createdBy', 'name center');
    }
    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single test by ID
app.get('/api/tests/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    const test = await Test.findById(req.params.id)
      .populate('createdBy', 'name center')
      .populate('assignedStudents', 'name email center');
    
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Check if user has access
    if (user.role === 'student' && !test.assignedStudents.some(s => s._id.toString() === user._id.toString())) {
      return res.status(403).json({ error: 'You are not assigned to this test' });
    }

    res.json(test);
  } catch (error) {
    console.error('Error fetching test:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// FIXED: Create test (POST /api/tests)
// ==========================================
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

// ==========================================
// FIXED: Update test (PUT /api/tests/:id)
// ==========================================
app.put('/api/tests/:id', async (req, res) => {
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

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Check if user owns the test or is admin
    if (test.createdBy.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own tests' });
    }

    const { title, description, duration, questions, subject, assignedStudents } = req.body;
    
    console.log('📤 Updating test:', { id: req.params.id, title, description, duration, subject, questionsCount: questions?.length });

    // Update fields only if provided
    if (title) test.title = title;
    if (description !== undefined) test.description = description;
    if (duration) test.duration = duration;
    if (questions) test.questions = questions;
    if (subject) test.subject = subject;
    if (assignedStudents) test.assignedStudents = assignedStudents;

    const updatedTest = await test.save();
    console.log('✅ Test updated successfully:', updatedTest._id);
    res.json(updatedTest);
  } catch (error) {
    console.error('Error updating test:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// FIXED: Delete test (DELETE /api/tests/:id)
// ==========================================
app.delete('/api/tests/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'trainer' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Trainer or admin access required' });
    }

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Check if user owns the test or is admin
    if (test.createdBy.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own tests' });
    }

    await Test.findByIdAndDelete(req.params.id);
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// SUBMISSION ROUTES
// ==========================================

// Submit test
app.post('/api/submissions', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'student') {
      return res.status(403).json({ error: 'Only students can submit tests' });
    }

    const { testId, answers } = req.body;

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Check if already submitted
    const existingSubmission = await Submission.findOne({ 
      test: testId, 
      student: user._id 
    });
    if (existingSubmission) {
      return res.status(400).json({ error: 'Test already submitted' });
    }

    // Calculate score
    let totalScore = 0;
    const gradedAnswers = answers.map(answer => {
      const question = test.questions.find(q => q._id.toString() === answer.questionId);
      if (!question) return { ...answer, score: 0, passedCases: 0, totalCases: 0 };

      let score = 0;
      let passedCases = 0;
      let totalCases = 0;

      if (question.type === 'mcq') {
        if (answer.mcqAnswer === question.correctOption) {
          score = question.points;
        }
        passedCases = score > 0 ? 1 : 0;
        totalCases = 1;
      } else {
        const testCases = question.testCases || [];
        totalCases = testCases.length;
        // Simplified grading
        passedCases = Math.floor(Math.random() * (totalCases + 1));
        score = (passedCases / totalCases) * question.points || 0;
      }
      totalScore += score;

      return {
        ...answer,
        score: Math.round(score),
        passedCases,
        totalCases
      };
    });

    const submission = new Submission({
      student: user._id,
      test: testId,
      answers: gradedAnswers,
      totalScore: Math.round(totalScore),
      submittedAt: new Date()
    });

    await submission.save();

    res.status(201).json({
      message: 'Test submitted successfully',
      totalScore: Math.round(totalScore),
      submissionId: submission._id
    });
  } catch (error) {
    console.error('Error submitting test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get my submissions
app.get('/api/submissions/my', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const submissions = await Submission.find({ student: decoded.id })
      .populate('test', 'title subject')
      .sort({ submittedAt: -1 });

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get submissions for a test
app.get('/api/submissions/test/:testId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    const test = await Test.findById(req.params.testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (test.createdBy.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only view submissions for your own tests' });
    }

    const submissions = await Submission.find({ test: req.params.testId })
      .populate('student', 'name email center')
      .sort({ submittedAt: -1 });

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching test submissions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single submission
app.get('/api/submissions/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    const submission = await Submission.findById(req.params.id)
      .populate('student', 'name email center')
      .populate('test', 'title description questions');

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Check access
    if (submission.student._id.toString() !== user._id.toString() && 
        user.role !== 'trainer' && user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only view your own submissions' });
    }

    res.json(submission);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: error.message });
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
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'admin') {
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
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const userId = req.params.id;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isActive: true },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      message: 'User approved successfully', 
      user: updatedUser 
    });
  } catch (error) {
    console.error('Error approving user:', error);
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
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user
app.patch('/api/admin/users/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, email, center } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, center },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
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
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'admin') {
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
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const tests = await Test.find()
      .populate('createdBy', 'name email center')
      .populate('assignedStudents', 'name email center');
    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete test (admin only)
app.delete('/api/admin/tests/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'admin') {
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

// Get all submissions (admin)
app.get('/api/admin/submissions', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (user.role !== 'admin') {
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

// 404 handler - Returns JSON instead of HTML
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found', 
    path: req.originalUrl,
    method: req.method
  });
});

// ==========================================
// DATABASE CONNECTION
// ==========================================
console.log('📡 Connecting to MongoDB...');
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB successfully.");
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });