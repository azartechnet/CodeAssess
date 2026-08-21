const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Test, Submission } = require('../models/Schemas');
const { authenticate, requireTrainer, requireAdmin, JWT_SECRET } = require('../middleware/auth');
const { runCode, evaluateCode } = require('../controllers/compilerController');

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

// Register
router.post('/auth/register', async (req, res) => {
  const { name, email, password, role, center, adminCode } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please enter all fields' });
  }
  if (!center) {
    return res.status(400).json({ error: 'Please select a center' });
  }
  // If registering as admin, require a secret admin code
  if (role === 'admin') {
    const requiredCode = process.env.ADMIN_CODE || 'ADMIN_SECRET_123';
    if (adminCode !== requiredCode) {
      return res.status(403).json({ error: 'Invalid admin code' });
    }
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'student',
      isActive: role === 'admin' ? true : false,
      center: center || ''
    });

    const savedUser = await newUser.save();

    if (!savedUser.isActive) {
      return res.status(201).json({
        message: 'Registration successful. Please wait for an administrator to approve your account.'
      });
    }

    const token = jwt.sign({ id: savedUser._id, role: savedUser.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        role: savedUser.role,
        center: savedUser.center
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter all fields' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    if (!user.isActive && user.role !== 'admin') {
      return res.status(403).json({ error: 'Account not activated' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        center: user.center
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Current User (Verify Token)
router.get('/auth/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});


// ==========================================
// COMPILER RUN ENDPOINT (Used during testing)
// ==========================================
router.post('/compiler/run', authenticate, runCode);


// ==========================================
// TEST ENDPOINTS
// ==========================================


// Get all students (teacher only)
router.get('/students', authenticate, requireTrainer, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('name email');
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get All Tests (modified for student assignment)
router.get('/tests', authenticate, async (req, res) => {
  try {
    let tests;
    if (req.user.role === 'trainer') {
      // Teachers see tests they created
      tests = await Test.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
      res.json(tests);
    } else {
      // Students see only tests assigned to them
      tests = await Test.find({ assignedStudents: req.user._id }).sort({ createdAt: -1 });
      const filteredTests = tests.map(test => {
        const testObj = test.toObject();
        // Hide correct choices and private test cases from listing metadata
        testObj.questions = testObj.questions.map(q => {
          delete q.correctOption;
          delete q.correctCode;
          if (q.testCases) {
            q.testCases = q.testCases.filter(tc => tc.isSample); // Keep sample test cases only
          }
          return q;
        });
        return testObj;
      });
      res.json(filteredTests);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Test (Teacher only) - accept subject and assignedStudents
router.post('/tests', authenticate, requireTrainer, async (req, res) => {
  const { title, description, duration, questions, subject, assignedStudents } = req.body;
  if (!title || !duration) {
    return res.status(400).json({ error: 'Title and duration are required.' });
  }
  try {
    const newTest = new Test({
      title,
      description,
      duration,
      questions: questions || [],
      subject: subject || 'General',
      assignedStudents: assignedStudents || [],
      createdBy: req.user._id
    });
    const savedTest = await newTest.save();
    res.status(201).json(savedTest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Test (Teacher only) - allow subject and assignedStudents
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
    if (questions) {
      test.questions = questions;
    }
    if (subject !== undefined) {
      test.subject = subject;
    }
    if (assignedStudents !== undefined) {
      test.assignedStudents = assignedStudents;
    }
    const updatedTest = await test.save();
    res.json(updatedTest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download marks report as CSV (teacher only)
router.get('/tests/:id/submissions/csv', authenticate, requireTrainer, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized to export submissions for this test.' });
    }
    const submissions = await Submission.find({ test: req.params.id })
      .populate('student', 'name email')
      .sort({ submittedAt: -1 });
    // Build CSV
    let csv = 'Student Name,Student Email,Total Score,Submitted At\n';
    submissions.forEach(sub => {
      const date = sub.submittedAt ? sub.submittedAt.toISOString() : '';
      csv += `${sub.student.name},${sub.student.email},${sub.totalScore},${date}\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${test.title.replace(/\s+/g, '_')}_marks.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Single Test
router.get('/tests/:id', authenticate, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (req.user.role === 'trainer') {
      res.json(test);
    } else {
      // Filter test details for student consumption
      const testObj = test.toObject();
      testObj.questions = testObj.questions.map(q => {
        delete q.correctOption;
        delete q.correctCode;
        if (q.testCases) {
          q.testCases = q.testCases.filter(tc => tc.isSample);
        }
        return q;
      });
      res.json(testObj);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Delete Test (Teacher only)
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
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// SUBMISSION ENDPOINTS
// ==========================================

// Submit Test (Student only)
router.post('/submissions', authenticate, async (req, res) => {
  const { testId, answers } = req.body;
  if (!testId || !answers) {
    return res.status(400).json({ error: 'Test ID and answers are required.' });
  }

  try {
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Evaluate answers
    const evaluatedAnswers = [];
    let totalScore = 0;

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
        // Did not answer
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
        evalAns.codeAnswer = studentAns.codeAnswer;
        evalAns.language = studentAns.language;

        // Run evaluation on code using the test cases
        if (studentAns.codeAnswer && q.testCases && q.testCases.length > 0) {
          const evalResult = await evaluateCode(studentAns.language, studentAns.codeAnswer, q.testCases);
          evalAns.passedCases = evalResult.passedCases;
          evalAns.totalCases = evalResult.totalCases;
          
          // Calculate proportional score
          if (evalResult.totalCases > 0) {
            evalAns.score = Math.round((evalResult.passedCases / evalResult.totalCases) * q.points);
          }
        }
      }

      totalScore += evalAns.score;
      evaluatedAnswers.push(evalAns);
    }

    const newSubmission = new Submission({
      student: req.user._id,
      test: testId,
      answers: evaluatedAnswers,
      totalScore
    });

    const savedSubmission = await newSubmission.save();
    res.status(201).json(savedSubmission);
  } catch (error) {
    console.error("Submission evaluation failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get current student's submissions
router.get('/submissions/my', authenticate, async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate('test', 'title description')
      .sort({ submittedAt: -1 });
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get submissions for a specific test (Trainer only)
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
    res.status(500).json({ error: error.message });
  }
});

// Get submission by ID
router.get('/submissions/:id', authenticate, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('student', 'name email')
      .populate('test', 'title description questions');
    
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Access check: only student who submitted or the teacher who created the test can view
    if (req.user.role === 'student' && submission.student._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized access to submission details.' });
    }

    res.json(submission);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// ADMIN ENDPOINTS
// ==========================================
const CENTERS = ['Karur', 'Namakkal', 'Coimbatore', 'Dindigul'];

// Overview stats
router.get('/admin/overview', authenticate, requireAdmin, async (req, res) => {
  try {
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalTrainers = await User.countDocuments({ role: 'trainer' });
    const totalTests = await Test.countDocuments();
    const totalSubmissions = await Submission.countDocuments();

    // Per-center breakdown
    const centerStats = await Promise.all(CENTERS.map(async (center) => ({
      center,
      students: await User.countDocuments({ role: 'student', center }),
      trainers: await User.countDocuments({ role: 'trainer', center })
    })));

    res.json({ totalStudents, totalTrainers, totalTests, totalSubmissions, centerStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// All users
router.get('/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { center, role } = req.query;
    const filter = {};
    if (center) filter.center = center;
    if (role) filter.role = role;
    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download users as CSV
router.get('/admin/users/csv', authenticate, requireAdmin, async (req, res) => {
  try {
    const { center, role } = req.query;
    const filter = {};
    if (center) filter.center = center;
    if (role) filter.role = role;
    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    let csv = 'Name,Email,Role,Center,Registered At\n';
    users.forEach(u => {
      csv += `"${u.name}","${u.email}","${u.role}","${u.center || ''}","${u.createdAt ? u.createdAt.toISOString() : ''}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users_report.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// All tests
router.get('/admin/tests', authenticate, requireAdmin, async (req, res) => {
  try {
    const tests = await Test.find().populate('createdBy', 'name email center').sort({ createdAt: -1 });
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a test (Admin only)
router.delete('/admin/tests/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    await Test.deleteOne({ _id: req.params.id });
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// All submissions
router.get('/admin/submissions', authenticate, requireAdmin, async (req, res) => {
  try {
    const { center } = req.query;
    let submissions = await Submission.find()
      .populate('student', 'name email center')
      .populate('test', 'title subject')
      .sort({ submittedAt: -1 });
    if (center) {
      submissions = submissions.filter(s => s.student?.center === center);
    }
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download all submissions as CSV
router.get('/admin/submissions/csv', authenticate, requireAdmin, async (req, res) => {
  try {
    const { center } = req.query;
    let submissions = await Submission.find()
      .populate('student', 'name email center')
      .populate('test', 'title subject')
      .sort({ submittedAt: -1 });
    if (center) {
      submissions = submissions.filter(s => s.student?.center === center);
    }
    let csv = 'Student Name,Student Email,Center,Test Title,Subject,Total Score,Submitted At\n';
    submissions.forEach(sub => {
      const date = sub.submittedAt ? sub.submittedAt.toISOString() : '';
      csv += `"${sub.student?.name || ''}","${sub.student?.email || ''}","${sub.student?.center || ''}","${sub.test?.title || ''}","${sub.test?.subject || ''}","${sub.totalScore}","${date}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions_report.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a user (Admin only)
router.delete('/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await User.deleteOne({ _id: req.params.id });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Get pending users (inactive trainers & students)
router.get('/admin/pending-users', authenticate, requireAdmin, async (req, res) => {
  try {
    const pending = await User.find({ isActive: false, role: { $in: ['trainer','student'] } }).select('-password');
    res.json(pending);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve a user (set isActive true)
router.patch('/admin/approve-user/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.isActive = true;
    await user.save();
    res.json({ message: 'User approved', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a user (Admin only)
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
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


