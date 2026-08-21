const mongoose = require('mongoose');

// User Schema
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'trainer', 'admin'], default: 'student' },
  center: { type: String, enum: ['Karur', 'Namakkal', 'Coimbatore', 'Dindigul'], default: '' },
  isActive: { type: Boolean, default: false },
}, { timestamps: true });

// Question Sub-schema (can be MCQ, Debugging, or Coding)
const QuestionSchema = new mongoose.Schema({
  type: { type: String, enum: ['mcq', 'debugging', 'coding'], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true }, // Markdown supported
  points: { type: Number, default: 10 },
  
  // MCQ specific fields
  options: [{ type: String }], // Array of options (e.g., ["A", "B", "C", "D"])
  correctOption: { type: Number }, // Index of the correct option (0-indexed)
  
  // Coding & Debugging specific fields
  buggyCode: { type: String }, // For debugging questions
  language: { type: String }, // Primary language for debugging question (e.g., "javascript", "python")
  languageTemplates: {
    type: Map,
    of: String
  }, // For coding questions, e.g. { "python": "def solve()...", "javascript": "function..." }
  testCases: [{
    input: { type: String, default: "" },
    output: { type: String, required: true },
    isSample: { type: Boolean, default: false }
  }]
});

// Test Schema
const TestSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  duration: { type: Number, required: true }, // Duration in minutes
  questions: [QuestionSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, default: 'General' },
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

// Submission Schema
const SubmissionSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  answers: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['mcq', 'debugging', 'coding'], required: true },
    
    // MCQ submission
    mcqAnswer: { type: Number },
    
    // Coding/Debugging submission
    codeAnswer: { type: String },
    language: { type: String },
    
    // Evaluation results
    passedCases: { type: Number, default: 0 },
    totalCases: { type: Number, default: 0 },
    score: { type: Number, default: 0 }
  }],
  totalScore: { type: Number, default: 0 },
  submittedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Test = mongoose.model('Test', TestSchema);
const Submission = mongoose.model('Submission', SubmissionSchema);

module.exports = { User, Test, Submission };
