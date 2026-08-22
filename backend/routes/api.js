const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Test, Submission } = require('../models/Schemas');
const { authenticate, requireTrainer, requireAdmin, JWT_SECRET } = require('../middleware/auth');

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

// Register
router.post('/auth/register', async (req, res) => {
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

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

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
router.post('/auth/login', async (req, res) => {
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

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

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
router.get('/auth/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// ==========================================
// STUDENT ROUTES
// ==========================================

// Get all students (trainer only)
router.get('/students', authenticate, requireTrainer, async (req, res) => {
  try {
    const students = await User.find({ role: 'student', isActive: true }).select('_id name email center');
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
router.get('/tests', authenticate, async (req, res) => {
  try {
    let tests;
    if (req.user.role === 'trainer' || req.user.role === 'admin') {
      tests = await Test.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
    } else {
      tests = await Test.find({ assignedStudents: req.user._id }).sort({ createdAt: -1 });
      // Hide correct answers for students
      tests = tests.map(test => {
        const testObj = test.toObject();
        testObj.questions = testObj.questions.map(q => {
          delete q.correctOption;
          if (q.testCases) {
            q.testCases = q.testCases.filter(tc => tc.isSample);
          }
          return q;
        });
        return testObj;
      });
    }
    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single test
router.get('/tests/:id', authenticate, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (req.user.role === 'trainer' || req.user.role === 'admin') {
      res.json(test);
    } else {
      const testObj = test.toObject();
      testObj.questions = testObj.questions.map(q => {
        delete q.correctOption;
        if (q.testCases) {
          q.testCases = q.testCases.filter(tc => tc.isSample);
        }
        return q;
      });
      res.json(testObj);
    }
  } catch (error) {
    console.error('Error fetching test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create test (trainer only)
router.post('/tests', authenticate, requireTrainer, async (req, res) => {
  try {
    const { title, description, duration, questions, subject, assignedStudents } = req.body;

    if (!title || !duration) {
      return res.status(400).json({ error: 'Title and duration are required.' });
    }

    const newTest = new Test({
      title,
      description: description || '',
      duration,
      questions: questions || [],
      subject: subject || 'General',
      assignedStudents: assignedStudents || [],
      createdBy: req.user._id
    });

    const savedTest = await newTest.save();
    res.status(201).json(savedTest);
  } catch (error) {
    console.error('Error creating test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update test (trainer only)
router.put('/tests/:id', authenticate, requireTrainer, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized to modify this test.' });
    }

    const { title, description, duration, questions, subject, assignedStudents } = req.body;
    test.title = title || test.title;
    test.description = description !== undefined ? description : test.description;
    test.duration = duration || test.duration;
    if (questions) test.questions = questions;
    if (subject !== undefined) test.subject = subject;
    if (assignedStudents !== undefined) test.assignedStudents = assignedStudents;

    const updatedTest = await test.save();
    res.json(updatedTest);
  } catch (error) {
    console.error('Error updating test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete test (trainer only)
router.delete('/tests/:id', authenticate, requireTrainer, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized to delete this test.' });
    }

    await Test.deleteOne({ _id: req.params.id });
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
router.post('/submissions', authenticate, async (req, res) => {
  try {
    const { testId, answers } = req.body;

    if (!testId || !answers) {
      return res.status(400).json({ error: 'Test ID and answers are required.' });
    }

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Check if already submitted
    const existingSubmission = await Submission.findOne({ test: testId, student: req.user._id });
    if (existingSubmission) {
      return res.status(400).json({ error: 'Test already submitted' });
    }

    let totalScore = 0;
    const evaluatedAnswers = [];

    for (const q of test.questions) {
      const studentAns = answers.find(a => a.questionId === q._id.toString());
      
      const evalAns = {
        questionId: q._id,
        type: q.type,
        passedCases: 0,
        totalCases: 0,
        score: 0
      };

      if (!studentAns) {
        evaluatedAnswers.push(evalAns);
        continue;
      }

      if (q.type === 'mcq') {
        evalAns.mcqAnswer = studentAns.mcqAnswer;
        const isCorrect = studentAns.mcqAnswer === q.correctOption;
        evalAns.passedCases = isCorrect ? 1 : 0;
        evalAns.totalCases = 1;
        evalAns.score = isCorrect ? q.points : 0;
      } else if (q.type === 'debugging' || q.type === 'coding') {
        evalAns.codeAnswer = studentAns.codeAnswer || '';
        evalAns.language = studentAns.language || 'javascript';
        // Simplified evaluation - in production use actual code runner
        if (q.testCases && q.testCases.length > 0) {
          evalAns.totalCases = q.testCases.length;
          // For demo, simulate passing some cases
          evalAns.passedCases = Math.floor(Math.random() * (evalAns.totalCases + 1));
          evalAns.score = Math.round((evalAns.passedCases / evalAns.totalCases) * q.points);
        }
      }

      totalScore += evalAns.score;
      evaluatedAnswers.push(evalAns);
    }

    const submission = new Submission({
      student: req.user._id,
      test: testId,
      answers: evaluatedAnswers,
      totalScore
    });

    await submission.save();
    res.status(201).json(submission);
  } catch (error) {
    console.error('Error submitting test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get my submissions
router.get('/submissions/my', authenticate, async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate('test', 'title description')
      .sort({ submittedAt: -1 });
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single submission
router.get('/submissions/:id', authenticate, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('student', 'name email')
      .populate('test', 'title description questions');

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Check access
    if (req.user.role === 'student' && submission.student._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    res.json(submission);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get submissions for a test (trainer only)
router.get('/submissions/test/:testId', authenticate, requireTrainer, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized to view submissions for this test.' });
    }

    const submissions = await Submission.find({ test: req.params.testId })
      .populate('student', 'name email')
      .sort({ submittedAt: -1 });

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching test submissions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

// Get admin overview
router.get('/admin/overview', authenticate, requireAdmin, async (req, res) => {
  try {
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

    res.json({ totalStudents, totalTrainers, totalTests, totalSubmissions, centerStats });
  } catch (error) {
    console.error('Error fetching admin overview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users
router.get('/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { center, role } = req.query;
    const filter = {};
    if (center) filter.center = center;
    if (role) filter.role = role;
    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending users
router.get('/admin/pending-users', authenticate, requireAdmin, async (req, res) => {
  try {
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

// ==========================================
// FIXED: Approve user
// ==========================================
router.patch('/admin/approve-user/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    console.log('📤 Approving user with ID:', userId);
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('📤 Current user status:', { 
      name: user.name, 
      email: user.email, 
      isActive: user.isActive 
    });
    
    // Update the user - set isActive to true
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isActive: true },
      { new: true } // This returns the updated document
    ).select('-password');
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found after update' });
    }
    
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

// Edit user
router.patch('/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, email, center, role, isActive } = req.body;
    const update = {};
    if (name) update.name = name;
    if (email) update.email = email;
    if (center) update.center = center;
    if (role) update.role = role;
    if (typeof isActive !== 'undefined') update.isActive = isActive;

    const updatedUser = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User updated', user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
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

// Get all tests (admin)
router.get('/admin/tests', authenticate, requireAdmin, async (req, res) => {
  try {
    const tests = await Test.find().populate('createdBy', 'name email center').sort({ createdAt: -1 });
    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete test (admin)
router.delete('/admin/tests/:id', authenticate, requireAdmin, async (req, res) => {
  try {
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
router.get('/admin/submissions', authenticate, requireAdmin, async (req, res) => {
  try {
    const submissions = await Submission.find()
      .populate('student', 'name email center')
      .populate('test', 'title subject')
      .sort({ submittedAt: -1 });
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;