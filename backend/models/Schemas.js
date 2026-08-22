const mongoose = require('mongoose');

// ==========================================
// USER SCHEMA
// ==========================================
const UserSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    trim: true
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: { 
    type: String, 
    enum: ['student', 'trainer', 'admin'], 
    default: 'student' 
  },
  center: { 
    type: String, 
    enum: ['', 'Karur', 'Namakkal', 'Coimbatore', 'Dindigul'], 
    default: '' 
  },
  isActive: { 
    type: Boolean, 
    default: false 
  }
}, { 
  timestamps: true 
});

// ==========================================
// QUESTION SUB-SCHEMA
// ==========================================
const QuestionSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['mcq', 'debugging', 'coding'], 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  points: { 
    type: Number, 
    default: 10,
    min: 1
  },
  options: [{ 
    type: String 
  }],
  correctOption: { 
    type: Number,
    min: 0
  },
  buggyCode: { 
    type: String 
  },
  language: { 
    type: String,
    default: 'javascript' 
  },
  languageTemplates: {
    type: Map,
    of: String,
    default: {}
  },
  testCases: [{
    input: { 
      type: String, 
      default: "" 
    },
    output: { 
      type: String, 
      required: true 
    },
    isSample: { 
      type: Boolean, 
      default: false 
    }
  }]
});

// ==========================================
// TEST SCHEMA
// ==========================================
const TestSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Test title is required'],
    trim: true
  },
  description: { 
    type: String, 
    default: '' 
  },
  duration: { 
    type: Number, 
    required: true, 
    default: 60,
    min: 1
  },
  questions: [QuestionSchema],
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  subject: { 
    type: String, 
    default: 'General' 
  },
  assignedStudents: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }]
}, { 
  timestamps: true 
});

// ==========================================
// SUBMISSION SCHEMA
// ==========================================
const SubmissionSchema = new mongoose.Schema({
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  test: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Test', 
    required: true 
  },
  answers: [{
    questionId: { 
      type: mongoose.Schema.Types.ObjectId, 
      required: true 
    },
    type: { 
      type: String, 
      enum: ['mcq', 'debugging', 'coding'], 
      required: true 
    },
    mcqAnswer: { 
      type: Number, 
      default: null 
    },
    codeAnswer: { 
      type: String, 
      default: '' 
    },
    language: { 
      type: String, 
      default: 'javascript' 
    },
    passedCases: { 
      type: Number, 
      default: 0 
    },
    totalCases: { 
      type: Number, 
      default: 0 
    },
    score: { 
      type: Number, 
      default: 0 
    }
  }],
  totalScore: { 
    type: Number, 
    default: 0 
  },
  submittedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// ==========================================
// MODEL REGISTRATION
// ==========================================
const User = mongoose.model('User', UserSchema);
const Test = mongoose.model('Test', TestSchema);
const Submission = mongoose.model('Submission', SubmissionSchema);

module.exports = { User, Test, Submission };