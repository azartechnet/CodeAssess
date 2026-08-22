import React, { useState, useEffect } from 'react';
import CodeEditor from './components/CodeEditor';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('auth'); // auth, student-dashboard, teacher-dashboard, test-portal, submission-view
  const [loading, setLoading] = useState(true);

  // Authentication states
  const [authTab, setAuthTab] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'student', center: '' });
  const [authError, setAuthError] = useState('');

  // Dashboard & test data states
  const [tests, setTests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [activeTest, setActiveTest] = useState(null);
  const [activeSubmission, setActiveSubmission] = useState(null);

  // Test Portal taking states
  const [studentAnswers, setStudentAnswers] = useState([]); // Array of { questionId, type, mcqAnswer, codeAnswer, language }
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0); // seconds
  const [isSubmittingTest, setIsSubmittingTest] = useState(false);

  // Teacher dashboard controls
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [editingTestId, setEditingTestId] = useState(null);
  const [studentsList, setStudentsList] = useState([]);

  // Wrapper to auto-submit test before navigating away
  const setCurrentViewWithAutoSubmit = async (view) => {
    if (activeTest && !isSubmittingTest) {
      try {
        await submitTest();
      } catch (e) {
        // ignore errors, navigation will still proceed
      }
    }
    setCurrentView(view);
  };
  const [testForm, setTestForm] = useState({
    title: '',
    description: '',
    duration: 60,
    subject: '',
    assignedStudents: [],
    questions: []
  });
  const [selectedTestSubmissions, setSelectedTestSubmissions] = useState([]);
  const [viewingTestSubmissions, setViewingTestSubmissions] = useState(null);

  // Sync token and load user info
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      fetchUser();
    } else {
      localStorage.removeItem('token');
      setUser(null);
      setCurrentView('auth');
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const res = await fetch('https://codeassess-backend-ltvf.onrender.com/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
        if (data.user.role === 'admin') setCurrentView('admin-dashboard');
        else if (data.user.role === 'trainer') setCurrentView('trainer-dashboard');
        else setCurrentView('student-dashboard');
      } else {
        setToken('');
      }
    } catch {
      setToken('');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setCurrentViewWithAutoSubmit('auth');
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authTab === 'login' ? 'https://codeassess-backend-ltvf.onrender.com/api/auth/login' : 'https://codeassess-backend-ltvf.onrender.com/api/auth/register';
    const payload = authTab === 'login' 
      ? { email: authForm.email, password: authForm.password }
      : authForm;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        if (data.token) {
          setToken(data.token);
        } else if (data.message) {
          alert(data.message);
          setAuthTab('login');
        }
        setAuthForm({ name: '', email: '', password: '', role: 'student', center: '' });
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('Connection server error. Please try again.');
    }
  };

  // Admin dashboard state
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminTests, setAdminTests] = useState([]);
  const [adminSubmissions, setAdminSubmissions] = useState([]);
  const [adminPendingUsers, setAdminPendingUsers] = useState([]);
  const [adminTab, setAdminTab] = useState('overview'); // overview | users | pending | tests | submissions
  const [adminFilterCenter, setAdminFilterCenter] = useState('');
  const [adminFilterRole, setAdminFilterRole] = useState('');
  const CENTERS = ['Karur', 'Namakkal', 'Coimbatore', 'Dindigul'];

  const loadAdminData = async () => {
    if (!token) return;
    try {
      const [ovRes, usersRes, pendingRes, testsRes, subsRes] = await Promise.all([
        fetch('https://codeassess-backend-ltvf.onrender.com/api/admin/overview', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('https://codeassess-backend-ltvf.onrender.com/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('https://codeassess-backend-ltvf.onrender.com/api/admin/pending-users', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('https://codeassess-backend-ltvf.onrender.com/api/admin/tests', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('https://codeassess-backend-ltvf.onrender.com/api/admin/submissions', { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);
      if (ovRes.ok) setAdminOverview(await ovRes.json());
      if (usersRes.ok) setAdminUsers(await usersRes.json());
      if (pendingRes.ok) setAdminPendingUsers(await pendingRes.json());
      if (testsRes.ok) setAdminTests(await testsRes.json());
      if (subsRes.ok) setAdminSubmissions(await subsRes.json());
    } catch (err) {
      console.error('Admin data load failed', err);
    }
  };

  const downloadAdminCsv = (url, filename) => {
    fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert('Download failed.'));
  };

  // Fetch student or teacher tests
  const loadDashboardData = async () => {
    if (!token) return;
    try {
      // Load Tests
      const testsRes = await fetch('https://codeassess-backend-ltvf.onrender.com/api/tests', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (testsRes.ok) {
        const testsData = await testsRes.json();
        setTests(testsData);
      }

      // Load Submissions (students only)
      if (user && user.role === 'student') {
        const subRes = await fetch('https://codeassess-backend-ltvf.onrender.com/api/submissions/my', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubmissions(subData);
        }
      }

      // Load students list (trainers only, for assigning tests)
      if (user && user.role === 'trainer') {
        const studRes = await fetch('https://codeassess-backend-ltvf.onrender.com/api/students', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (studRes.ok) {
          const studData = await studRes.json();
          setStudentsList(studData);
        } else {
          console.error('Failed to load students list');
        }
      }
    } catch (err) {
      console.error("Dashboard load failed", err);
    }
  };

  useEffect(() => {
    if (user) {
      if (user.role === 'admin') {
        loadAdminData();
      } else {
        loadDashboardData();
      }
    }
  }, [user, currentView]);

  // ==========================================
  // STUDENT PORTAL LOGIC
  // ==========================================
  const startTest = async (testId) => {
    try {
      const res = await fetch(`https://codeassess-backend-ltvf.onrender.com/api/tests/${testId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const testData = await res.json();
      if (res.ok) {
        setActiveTest(testData);
        setTimeLeft(testData.duration * 60);
        setActiveQuestionIndex(0);
        
        // Setup initial blank answers
        const initialAnswers = testData.questions.map(q => {
          let codeAnswer = '';
          let language = q.language || 'javascript';
          
          if (q.type === 'debugging') {
            codeAnswer = q.buggyCode;
          } else if (q.type === 'coding') {
            // Pick template or blank
            codeAnswer = q.languageTemplates?.[language] || getDefaultTemplate(language);
          }

          return {
            questionId: q._id,
            type: q.type,
            mcqAnswer: null,
            codeAnswer,
            language
          };
        });
        setStudentAnswers(initialAnswers);
        setCurrentView('test-portal');
      }
    } catch (error) {
      alert("Could not load test details.");
    }
  };

  // Test countdown timer
  useEffect(() => {
    if (currentView !== 'test-portal' || timeLeft <= 0) {
      if (timeLeft === 0 && currentView === 'test-portal') {
        submitTest();
      }
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, currentView]);

  const submitTest = async () => {
    if (isSubmittingTest) return;
    setIsSubmittingTest(true);
    try {
      const res = await fetch('https://codeassess-backend-ltvf.onrender.com/api/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          testId: activeTest._id,
          answers: studentAnswers
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Test submitted successfully! You scored: ${data.totalScore} pts.`);
        setActiveTest(null);
        setCurrentView('student-dashboard');
      } else {
        alert("Submission failed: " + data.error);
      }
    } catch (error) {
      alert("Error submitting test: " + error.message);
    } finally {
      setIsSubmittingTest(false);
    }
  };

  // Helper template boilerplates
  const getDefaultTemplate = (lang) => {
    switch (lang) {
      case 'python':
        return `def solve():\n    # Read input from stdin\n    # Print result to stdout\n    pass\n\nif __name__ == '__main__':\n    solve()`;
      case 'cpp':
        return `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write code here\n    return 0;\n}`;
      case 'java':
        return `import java.util.Scanner;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write code here\n    }\n}`;
      case 'go':
        return `package main\nimport "fmt"\n\nfunc main() {\n    // Write code here\n}`;
      default:
        return `// Write code here`;
    }
  };

  // Update specific answers
  const updateAnswer = (value, field = 'codeAnswer') => {
    const updated = [...studentAnswers];
    const qId = activeTest.questions[activeQuestionIndex]._id;
    const idx = updated.findIndex(a => a.questionId === qId);
    if (idx !== -1) {
      updated[idx][field] = value;
      // If student edits the code language, we also swap templates if they hadn't typed much
      if (field === 'language') {
        const q = activeTest.questions[activeQuestionIndex];
        if (q.type === 'coding') {
          updated[idx].codeAnswer = q.languageTemplates?.[value] || getDefaultTemplate(value);
        }
      }
      setStudentAnswers(updated);
    }
  };

  // ==========================================
  // TEACHER DASHBOARD LOGIC
  // ==========================================
  const startCreateTest = () => {
    setTestForm({
      title: '',
      description: '',
      duration: 60,
      subject: '',
      assignedStudents: [],
      questions: []
    });
    setEditingTestId(null);
    setIsCreatingTest(true);
  };

  const startEditTest = (test) => {
    setTestForm({
      title: test.title,
      description: test.description || '',
      duration: test.duration,
      subject: test.subject || '',
      assignedStudents: test.assignedStudents ? test.assignedStudents.map(s => s._id || s) : [],
      questions: test.questions.map(q => {
        const qCopy = {
          _id: q._id,
          type: q.type,
          title: q.title,
          description: q.description,
          points: q.points,
          options: q.options || [],
          correctOption: q.correctOption,
          buggyCode: q.buggyCode,
          language: q.language,
          testCases: q.testCases || []
        };
        if (q.languageTemplates) {
          qCopy.languageTemplates = q.languageTemplates instanceof Map
            ? Object.fromEntries(q.languageTemplates)
            : q.languageTemplates;
        }
        return qCopy;
      })
    });
    setEditingTestId(test._id);
    setIsCreatingTest(true);
  };

  const handleCreateTestSubmit = async (e) => {
    e.preventDefault();
    if (!testForm.title || testForm.questions.length === 0) {
      alert("Please provide a title and at least one question.");
      return;
    }

    const isEdit = !!editingTestId;
    const url = isEdit ? `/api/tests/${editingTestId}` : '/api/tests';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(testForm)
      });

      if (res.ok) {
        alert(isEdit ? "Test updated successfully!" : "Test created successfully!");
        setIsCreatingTest(false);
        setEditingTestId(null);
        loadDashboardData();
      } else {
        const err = await res.json();
        alert("Error: " + err.error);
      }
    } catch (error) {
      alert("Failed to submit: " + error.message);
    }
  };

  const addQuestionToForm = (type) => {
    const defaultQ = {
      type,
      title: '',
      description: '',
      points: 10,
      options: type === 'mcq' ? ['', '', '', ''] : [],
      correctOption: type === 'mcq' ? 0 : undefined,
      buggyCode: type === 'debugging' ? '' : undefined,
      language: type === 'debugging' ? 'javascript' : undefined,
      languageTemplates: type === 'coding' ? { javascript: '', python: '', cpp: '', java: '' } : undefined,
      testCases: (type === 'debugging' || type === 'coding') ? [{ input: '', output: '', isSample: true }] : []
    };

    setTestForm(prev => ({
      ...prev,
      questions: [...prev.questions, defaultQ]
    }));
  };

  const removeQuestionFromForm = (idx) => {
    const list = [...testForm.questions];
    list.splice(idx, 1);
    setTestForm(prev => ({ ...prev, questions: list }));
  };

  const updateQuestionForm = (idx, field, value) => {
    const list = [...testForm.questions];
    list[idx][field] = value;
    setTestForm(prev => ({ ...prev, questions: list }));
  };

  const updateQuestionTestCase = (qIdx, tcIdx, field, value) => {
    const list = [...testForm.questions];
    const tcList = [...list[qIdx].testCases];
    tcList[tcIdx][field] = value;
    list[qIdx].testCases = tcList;
    setTestForm(prev => ({ ...prev, questions: list }));
  };

  const addTestCaseToQuestion = (qIdx) => {
    const list = [...testForm.questions];
    list[qIdx].testCases.push({ input: '', output: '', isSample: false });
    setTestForm(prev => ({ ...prev, questions: list }));
  };

  const removeTestCaseFromQuestion = (qIdx, tcIdx) => {
    const list = [...testForm.questions];
    list[qIdx].testCases.splice(tcIdx, 1);
    setTestForm(prev => ({ ...prev, questions: list }));
  };

  // View student submissions on a specific test
  const viewSubmissions = async (testId) => {
    try {
      const res = await fetch(`https://codeassess-backend-ltvf.onrender.com/api/submissions/test/${testId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedTestSubmissions(data);
        const test = tests.find(t => t._id === testId);
        setViewingTestSubmissions(test);
      }
    } catch (err) {
      alert("Could not load submissions.");
    }
  };

  const deleteTest = async (testId) => {
    if (!confirm("Are you sure you want to delete this test? All student records for it will be lost.")) return;
    try {
      const res = await fetch(`https://codeassess-backend-ltvf.onrender.com/api/admin/tests/${testId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Test deleted.");
        loadDashboardData();
      }
    } catch (err) {
      alert("Error deleting test.");
    }
  };

// Delete a user (admin)
const deleteUser = async (userId) => {
  if (!confirm('Are you sure you want to delete this user?')) return;
  try {
    const res = await fetch(`https://codeassess-backend-ltvf.onrender.com/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      alert('User deleted.');
      loadAdminData();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'Failed to delete user'));
    }
  } catch (e) {
    alert('Delete user request failed.');
  }
};

// Edit a user (admin) – simple prompt based implementation
const editUser = async (userId) => {
  const user = adminUsers.find(u => u._id === userId);
  if (!user) {
    alert('User not found.');
    return;
  }
  const newName = prompt('Enter new name', user.name);
  const newEmail = prompt('Enter new email', user.email);
  const newCenter = prompt('Enter new center', user.center || '');
  if (newName && newEmail) {
    try {
      const res = await fetch(`https://codeassess-backend-ltvf.onrender.com/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName, email: newEmail, center: newCenter }),
      });
      if (res.ok) {
        alert('User updated.');
        loadAdminData();
      } else {
        const err = await res.json();
        alert('Error: ' + (err.error || 'Failed to update user'));
      }
    } catch (e) {
      alert('Update request failed.');
    }
  }
};

const approveUser = async (userId) => {
  if (!confirm('Are you sure you want to approve this user?')) return;
  try {
    const res = await fetch(`https://codeassess-backend-ltvf.onrender.com/api/admin/approve-user/${userId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      alert('User approved.');
      loadAdminData();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'Failed to approve user'));
    }
  } catch (e) {
    alert('Approve request failed.');
  }
};

  const openSubmissionDetails = async (subId) => {
    try {
      const res = await fetch(`https://codeassess-backend-ltvf.onrender.com/api/submissions/${subId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setActiveSubmission(data);
        setCurrentView('submission-view');
      }
    } catch (err) {
      alert("Could not load submission details.");
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '20px' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <h3 style={{ color: 'var(--text-muted)' }}>Loading Platform...</h3>
        <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
      </div>
    );
  }

  // Formatting utility for time
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      {/* HEADER */}
      {user && (
        <nav className="navbar">
          <div className="nav-logo">
            <span>&lt;/&gt; CodeAssess</span>
          </div>
          <div className="nav-user">
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Logged in as <strong style={{ color: '#fff' }}>{user.name}</strong> ({user.role.toUpperCase()})
            </span>
            <button className="btn btn-secondary" onClick={handleLogout} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
              Logout
            </button>
          </div>
        </nav>
      )}

      {/* VIEW 1: AUTHENTICATION */}
      {currentView === 'auth' && (
        <div className="auth-container">
          <div className="card auth-card animate-fade-in">
            <h2 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '1.8rem' }}>Welcome to CodeAssess</h2>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
              Online programming assessment compiler dashboard
            </p>

            <div className="auth-tabs">
              <div className={`auth-tab ${authTab === 'login' ? 'active' : ''}`} onClick={() => setAuthTab('login')}>Login</div>
              <div className={`auth-tab ${authTab === 'register' ? 'active' : ''}`} onClick={() => setAuthTab('register')}>Register</div>
            </div>

            {authError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', textAlign: 'center' }}>
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              {authTab === 'register' && (
                <div className="input-group">
                  <label className="input-label">Full Name</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    required 
                    value={authForm.name} 
                    onChange={e => setAuthForm({ ...authForm, name: e.target.value })} 
                    placeholder="Enter your name"
                  />
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Email Address</label>
                <input 
                  type="email" 
                  className="input-field" 
                  required 
                  value={authForm.email} 
                  onChange={e => setAuthForm({ ...authForm, email: e.target.value })} 
                  placeholder="name@university.edu"
                />
              </div>

              <div className="input-group">
                <label className="input-label">Password</label>
                <input 
                  type="password" 
                  className="input-field" 
                  required 
                  value={authForm.password} 
                  onChange={e => setAuthForm({ ...authForm, password: e.target.value })} 
                  placeholder="••••••••"
                />
              </div>

              {authTab === 'register' && (
                <div className="input-group">
                  <label className="input-label">Register As</label>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        name="role" 
                        value="student" 
                        checked={authForm.role === 'student'} 
                        onChange={() => setAuthForm({ ...authForm, role: 'student' })}
                        style={{ accentColor: 'var(--accent)' }}
                      /> Student
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        name="role" 
                        value="trainer" 
                        checked={authForm.role === 'trainer'} 
                        onChange={() => setAuthForm({ ...authForm, role: 'trainer' })}
                        style={{ accentColor: 'var(--accent)' }}
                      /> Trainer
                    </label>
                  </div>
                </div>
              )}

              {authTab === 'register' && (
                <div className="input-group">
                  <label className="input-label">Center</label>
                  <select
                    className="input-field"
                    required
                    value={authForm.center}
                    onChange={e => setAuthForm({ ...authForm, center: e.target.value })}
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">— Select Center —</option>
                    <option value="Karur">Karur</option>
                    <option value="Namakkal">Namakkal</option>
                    <option value="Coimbatore">Coimbatore</option>
                    <option value="Dindigul">Dindigul</option>
                  </select>
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px', padding: '12px' }}>
                {authTab === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VIEW: ADMIN DASHBOARD */}
      {currentView === 'admin-dashboard' && (
        <div className="container animate-fade-in">
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <div>
              <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Admin Dashboard</h1>
              <p style={{ color: 'var(--text-muted)' }}>Platform-wide overview, center reports, and data exports.</p>
            </div>
            <button className="btn btn-secondary" onClick={loadAdminData} style={{ padding: '8px 16px' }}>
              🔄 Refresh
            </button>
          </header>

          {/* Tab Nav */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--border)', paddingBottom: '0' }}>
            {['overview', 'users', 'pending', 'tests', 'submissions'].map(tab => (
              <button
                key={tab}
                onClick={() => setAdminTab(tab)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px',
                  fontSize: '0.95rem', fontWeight: adminTab === tab ? '700' : '400',
                  color: adminTab === tab ? 'var(--accent-light)' : 'var(--text-muted)',
                  borderBottom: adminTab === tab ? '3px solid var(--accent)' : '3px solid transparent',
                  marginBottom: '-2px', transition: 'all 0.2s'
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* OVERVIEW TAB */}
          {adminTab === 'overview' && adminOverview && (
            <div>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
                {[
                  { label: 'Total Students', value: adminOverview.totalStudents, color: '#60a5fa' },
                  { label: 'Total Trainers', value: adminOverview.totalTrainers, color: '#34d399' },
                  { label: 'Total Tests', value: adminOverview.totalTests, color: '#a78bfa' },
                  { label: 'Total Submissions', value: adminOverview.totalSubmissions, color: '#f97316' },
                ].map(card => (
                  <div key={card.label} className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
                    <div style={{ fontSize: '2.2rem', fontWeight: '800', color: card.color }}>{card.value}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '6px' }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Per-Center Breakdown */}
              <div className="card">
                <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Center-wise Breakdown</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      <th style={{ padding: '10px 12px' }}>Center</th>
                      <th style={{ padding: '10px 12px' }}>Students</th>
                      <th style={{ padding: '10px 12px' }}>Trainers</th>
                      <th style={{ padding: '10px 12px' }}>Total Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminOverview.centerStats.map(c => (
                      <tr key={c.center} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                        <td style={{ padding: '10px 12px', fontWeight: '600' }}>{c.center}</td>
                        <td style={{ padding: '10px 12px', color: '#60a5fa' }}>{c.students}</td>
                        <td style={{ padding: '10px 12px', color: '#34d399' }}>{c.trainers}</td>
                        <td style={{ padding: '10px 12px', fontWeight: '700' }}>{c.students + c.trainers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {adminTab === 'users' && (
            <div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  className="input-field" style={{ width: 'auto', padding: '8px 12px' }}
                  value={adminFilterCenter}
                  onChange={e => setAdminFilterCenter(e.target.value)}
                >
                  <option value="">All Centers</option>
                  {CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  className="input-field" style={{ width: 'auto', padding: '8px 12px' }}
                  value={adminFilterRole}
                  onChange={e => setAdminFilterRole(e.target.value)}
                >
                  <option value="">All Roles</option>
                  <option value="student">Students</option>
                  <option value="trainer">Trainers</option>
                </select>
                <button
                  className="btn btn-primary"
                  style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: '0.85rem' }}
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (adminFilterCenter) params.append('center', adminFilterCenter);
                    if (adminFilterRole) params.append('role', adminFilterRole);
                    downloadAdminCsv(`/api/admin/users/csv?${params}`, 'users_report.csv');
                  }}
                >
                  ⬇ Download Users CSV
                </button>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)' }}>
                      <th style={{ padding: '12px' }}>Name</th>
                      <th style={{ padding: '12px' }}>Email</th>
                      <th style={{ padding: '12px' }}>Role</th>
                      <th style={{ padding: '12px' }}>Center</th>
                      <th style={{ padding: '12px' }}>Registered</th>
                      <th style={{ padding: '12px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers
                      .filter(u => (!adminFilterCenter || u.center === adminFilterCenter) && (!adminFilterRole || u.role === adminFilterRole))
                      .map(u => (
                        <tr key={u._id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '600' }}>{u.name}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{u.email}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: '700',
                              background: u.role === 'trainer' ? 'rgba(52,211,153,0.15)' : 'rgba(96,165,250,0.15)',
                              color: u.role === 'trainer' ? '#34d399' : '#60a5fa'
                            }}>{u.role.toUpperCase()}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>{u.center || '—'}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <button className="btn btn-sm btn-primary" onClick={() => editUser(u._id)} style={{ marginRight: '4px' }}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteUser(u._id)}>Delete</button>
                        </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {adminUsers.filter(u => (!adminFilterCenter || u.center === adminFilterCenter) && (!adminFilterRole || u.role === adminFilterRole)).length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No users found.</div>
                )}
              </div>
            </div>
          )}

          {/* PENDING USERS TAB */}
          {adminTab === 'pending' && (
            <div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)' }}>
                      <th style={{ padding: '12px' }}>Name</th>
                      <th style={{ padding: '12px' }}>Email</th>
                      <th style={{ padding: '12px' }}>Role</th>
                      <th style={{ padding: '12px' }}>Center</th>
                      <th style={{ padding: '12px' }}>Registered</th>
                      <th style={{ padding: '12px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminPendingUsers.map(u => (
                        <tr key={u._id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '600' }}>{u.name}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{u.email}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: '700',
                              background: u.role === 'trainer' ? 'rgba(52,211,153,0.15)' : 'rgba(96,165,250,0.15)',
                              color: u.role === 'trainer' ? '#34d399' : '#60a5fa'
                            }}>{u.role.toUpperCase()}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>{u.center || '—'}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <button className="btn btn-sm btn-primary" onClick={() => approveUser(u._id)} style={{ marginRight: '4px' }}>Approve</button>
                            <button className="btn btn-sm btn-danger" onClick={() => deleteUser(u._id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {adminPendingUsers.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No pending users waiting for approval.</div>
                )}
              </div>
            </div>
          )}

          {/* TESTS TAB */}
          {adminTab === 'tests' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)' }}>
                    <th style={{ padding: '12px' }}>Test Title</th>
                    <th style={{ padding: '12px' }}>Subject</th>
                    <th style={{ padding: '12px' }}>Created By</th>
                    <th style={{ padding: '12px' }}>Center</th>
                    <th style={{ padding: '12px' }}>Questions</th>
                    <th style={{ padding: '12px' }}>Assigned</th>
                    <th style={{ padding: '12px' }}>Created</th>
                    <th style={{ padding: '12px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminTests.map(t => (
                    <tr key={t._id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '600' }}>{t.title}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--accent-light)' }}>{t.subject || 'General'}</td>
                      <td style={{ padding: '10px 12px' }}>{t.createdBy?.name || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{t.createdBy?.center || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{t.questions?.length || 0}</td>
                      <td style={{ padding: '10px 12px' }}>{t.assignedStudents?.length || 0} students</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px' }}>
  <button className="btn btn-sm btn-danger" onClick={() => deleteTest(t._id)} style={{ marginRight: '4px' }}>Delete</button>
</td>
</tr>
                  ))}
                </tbody>
              </table>
              {adminTests.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No tests found.</div>
              )}
            </div>
          )}

          {/* SUBMISSIONS TAB */}
          {adminTab === 'submissions' && (
            <div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  className="input-field" style={{ width: 'auto', padding: '8px 12px' }}
                  value={adminFilterCenter}
                  onChange={e => setAdminFilterCenter(e.target.value)}
                >
                  <option value="">All Centers</option>
                  {CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  className="btn btn-primary"
                  style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: '0.85rem' }}
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (adminFilterCenter) params.append('center', adminFilterCenter);
                    downloadAdminCsv(`/api/admin/submissions/csv?${params}`, 'submissions_report.csv');
                  }}
                >
                  ⬇ Download Submissions CSV
                </button>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)' }}>
                      <th style={{ padding: '12px' }}>Student</th>
                      <th style={{ padding: '12px' }}>Center</th>
                      <th style={{ padding: '12px' }}>Test</th>
                      <th style={{ padding: '12px' }}>Subject</th>
                      <th style={{ padding: '12px' }}>Score</th>
                      <th style={{ padding: '12px' }}>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminSubmissions
                      .filter(s => !adminFilterCenter || s.student?.center === adminFilterCenter)
                      .map(s => (
                        <tr key={s._id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '600' }}>{s.student?.name}</td>
                          <td style={{ padding: '10px 12px' }}>{s.student?.center || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>{s.test?.title}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--accent-light)' }}>{s.test?.subject || 'General'}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--success)', fontWeight: '700' }}>{s.totalScore} Pts</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(s.submittedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {adminSubmissions.filter(s => !adminFilterCenter || s.student?.center === adminFilterCenter).length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No submissions found.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: STUDENT DASHBOARD */}
      {currentView === 'student-dashboard' && (
        <div className="container animate-fade-in">
          <header style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Student Terminal</h1>
            <p style={{ color: 'var(--text-muted)' }}>Select an assessment to complete, or review past results.</p>
          </header>

          <div className="dashboard-grid">
            {/* Left side - Tests Available */}
            <div>
              <h2 style={{ fontSize: '1.4rem', marginBottom: '16px' }}>Active Tests</h2>
              {tests.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                  No assignments or tests have been created by your teachers yet.
                </div>
              ) : (
                <div className="test-list">
                  {tests.map(test => {
                    const submission = submissions.find(s => s.test?._id === test._id);
                    return (
                      <div key={test._id} className="test-item">
                        <div>
                          <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{test.title}</h3>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{test.description || 'No description provided.'}</p>
                          <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--accent-light)', fontWeight: '600' }}>⏱ {test.duration} Minutes</span>
                            <span style={{ color: 'var(--text-muted)' }}>📝 {test.questions?.length || 0} Questions</span>
                          </div>
                        </div>
                        <div>
                          {submission ? (
                            <button className="btn btn-secondary" onClick={() => openSubmissionDetails(submission._id)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                              View Score ({submission.totalScore} pts)
                            </button>
                          ) : (
                            <button className="btn btn-primary" onClick={() => startTest(test._id)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                              Start Test
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right side - Submission History */}
            <div>
              <h2 style={{ fontSize: '1.4rem', marginBottom: '16px' }}>Your Submissions</h2>
              {submissions.length === 0 ? (
                <div className="card" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '30px' }}>
                  You have not submitted any tests yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexType: 'column', flexDirection: 'column', gap: '12px' }}>
                  {submissions.map(sub => (
                    <div key={sub._id} className="card" style={{ padding: '16px', cursor: 'pointer' }} onClick={() => openSubmissionDetails(sub._id)}>
                      <h4 style={{ fontSize: '0.95rem', marginBottom: '6px' }}>{sub.test?.title || 'Deleted Test'}</h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(sub.submittedAt).toLocaleDateString()}
                        </span>
                        <strong style={{ color: 'var(--success)', fontSize: '0.95rem' }}>{sub.totalScore} Pts</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: TRAINER DASHBOARD */}
      {currentView === 'trainer-dashboard' && (
        <div className="container animate-fade-in">
          {isCreatingTest ? (
            /* Creation Form */
            <div className="card" style={{ maxWidth: '900px', margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.6rem' }}>{editingTestId ? 'Edit Programming Assessment' : 'Create New Programming Assessment'}</h2>
                <button className="btn btn-secondary" onClick={() => setIsCreatingTest(false)}>Back to Dashboard</button>
              </div>

              <form onSubmit={handleCreateTestSubmit} className="form-step">
                <div className="input-group">
                  <label className="input-label">Test Title</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    required 
                    value={testForm.title} 
                    onChange={e => setTestForm({ ...testForm, title: e.target.value })}
                    placeholder="e.g. Midterm Coding Assessment"
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Description / Instructions</label>
                  <textarea 
                    className="input-field" 
                    rows="3" 
                    value={testForm.description} 
                    onChange={e => setTestForm({ ...testForm, description: e.target.value })}
                    placeholder="Provide information on test content and programming rules..."
                  />
                </div>

                <div className="input-group" style={{ maxWidth: '300px' }}>
                  <label className="input-label">Subject (optional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Data Structures"
                    value={testForm.subject}
                    onChange={e => setTestForm({ ...testForm, subject: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="input-label" style={{ margin: 0 }}>
                      Assign to Students ({testForm.assignedStudents.length} selected)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => setTestForm(prev => ({ ...prev, assignedStudents: studentsList.map(s => s._id) }))}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => setTestForm(prev => ({ ...prev, assignedStudents: [] }))}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {studentsList.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      No students registered yet.
                    </div>
                  ) : (
                    <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border)', padding: '8px' }}>
                      {studentsList.map(student => {
                        const isChecked = testForm.assignedStudents.includes(student._id);
                        return (
                          <label
                            key={student._id}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', transition: 'background 0.15s', background: isChecked ? 'rgba(99,102,241,0.15)' : 'transparent' }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              style={{ accentColor: 'var(--accent)', width: '15px', height: '15px' }}
                              onChange={() => {
                                setTestForm(prev => {
                                  const already = prev.assignedStudents.includes(student._id);
                                  return {
                                    ...prev,
                                    assignedStudents: already
                                      ? prev.assignedStudents.filter(id => id !== student._id)
                                      : [...prev.assignedStudents, student._id]
                                  };
                                });
                              }}
                            />
                            <span style={{ fontSize: '0.9rem' }}>{student.name}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{student.email}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <hr style={{ borderColor: 'var(--border)', margin: '20px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.25rem' }}>Questions ({testForm.questions.length})</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => addQuestionToForm('mcq')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                      + MCQ
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => addQuestionToForm('debugging')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                      + Debugging Code
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => addQuestionToForm('coding')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                      + Write Code Task
                    </button>
                  </div>
                </div>

                {testForm.questions.map((q, qIdx) => (
                  <div key={qIdx} className="question-form-card">
                    <button type="button" className="remove-question-btn" onClick={() => removeQuestionFromForm(qIdx)}>
                      Remove Q#{qIdx + 1}
                    </button>
                    <h4 style={{ color: 'var(--accent-light)', marginBottom: '16px' }}>Q#{qIdx + 1} - {q.type.toUpperCase()}</h4>

                    <div className="input-group">
                      <label className="input-label">Question Title</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        required 
                        value={q.title} 
                        onChange={e => updateQuestionForm(qIdx, 'title', e.target.value)}
                        placeholder="e.g. Reverse a LinkedList"
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label">Description (Instructions)</label>
                      <textarea 
                        className="input-field" 
                        rows="3" 
                        required 
                        value={q.description} 
                        onChange={e => updateQuestionForm(qIdx, 'description', e.target.value)}
                        placeholder="Explain the coding prompt, variables, and expected return."
                      />
                    </div>

                    <div className="input-group" style={{ maxWidth: '150px' }}>
                      <label className="input-label">Points</label>
                      <input 
                        type="number" 
                        className="input-field" 
                        required 
                        value={q.points} 
                        onChange={e => updateQuestionForm(qIdx, 'points', parseInt(e.target.value) || 10)}
                      />
                    </div>

                    {/* MCQ Choices */}
                    {q.type === 'mcq' && (
                      <div className="input-group">
                        <label className="input-label">Options (Exactly 4 options)</label>
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                            <input 
                              type="radio" 
                              name={`correct-${qIdx}`} 
                              checked={q.correctOption === optIdx}
                              onChange={() => updateQuestionForm(qIdx, 'correctOption', optIdx)}
                              style={{ accentColor: 'var(--accent)' }}
                            />
                            <input 
                              type="text" 
                              className="input-field" 
                              style={{ flex: 1, padding: '8px 12px' }}
                              placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                              required
                              value={opt}
                              onChange={e => {
                                const newOpts = [...q.options];
                                newOpts[optIdx] = e.target.value;
                                updateQuestionForm(qIdx, 'options', newOpts);
                              }}
                            />
                          </div>
                        ))}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Select the radio button next to the correct option.</span>
                      </div>
                    )}

                    {/* Debugging Question Details */}
                    {q.type === 'debugging' && (
                      <>
                        <div className="input-group">
                          <label className="input-label">Code Language</label>
                          <select 
                            className="editor-select" 
                            style={{ alignSelf: 'flex-start' }}
                            value={q.language}
                            onChange={e => updateQuestionForm(qIdx, 'language', e.target.value)}
                          >
                            <option value="javascript">JavaScript</option>
                            <option value="python">Python</option>
                            <option value="cpp">C++</option>
                            <option value="java">Java</option>
                          </select>
                        </div>
                        <div className="input-group">
                          <label className="input-label">Buggy Code Template (Students will fix this code)</label>
                          <textarea 
                            className="input-field" 
                            rows="6" 
                            required
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                            value={q.buggyCode} 
                            onChange={e => updateQuestionForm(qIdx, 'buggyCode', e.target.value)}
                            placeholder={`function reverse(str) {\n  // Buggy code here\n  return str.split("").reverse();\n}`}
                          />
                        </div>
                      </>
                    )}

                    {/* Test Cases for Coding and Debugging questions */}
                    {(q.type === 'debugging' || q.type === 'coding') && (
                      <div className="input-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <label className="input-label">Test Cases (Minimum 1)</label>
                          <button type="button" className="btn btn-secondary" onClick={() => addTestCaseToQuestion(qIdx)} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                            + Add Case
                          </button>
                        </div>
                        
                        {q.testCases.map((tc, tcIdx) => (
                          <div key={tcIdx} style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', marginBottom: '10px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Case #{tcIdx + 1}</span>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={tc.isSample}
                                    onChange={e => updateQuestionTestCase(qIdx, tcIdx, 'isSample', e.target.checked)}
                                  /> Sample Case (Visible to student)
                                </label>
                                {q.testCases.length > 1 && (
                                  <button type="button" onClick={() => removeTestCaseFromQuestion(qIdx, tcIdx)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.75rem' }}>
                                    Delete Case
                                  </button>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div>
                                <label className="input-label" style={{ fontSize: '0.75rem' }}>Input (stdin)</label>
                                <textarea 
                                  className="input-field" 
                                  rows="2" 
                                  style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                                  value={tc.input}
                                  onChange={e => updateQuestionTestCase(qIdx, tcIdx, 'input', e.target.value)}
                                  placeholder="e.g. hello"
                                />
                              </div>
                              <div>
                                <label className="input-label" style={{ fontSize: '0.75rem' }}>Expected Output (stdout)</label>
                                <textarea 
                                  className="input-field" 
                                  rows="2" 
                                  required
                                  style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                                  value={tc.output}
                                  onChange={e => updateQuestionTestCase(qIdx, tcIdx, 'output', e.target.value)}
                                  placeholder="e.g. olleh"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsCreatingTest(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save Assessment
                  </button>
                </div>
              </form>
            </div>
          ) : viewingTestSubmissions ? (
            /* Student Submissions List for test */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <button className="btn btn-secondary" onClick={() => setViewingTestSubmissions(null)} style={{ padding: '6px 12px', fontSize: '0.85rem', marginBottom: '8px' }}>
                    &larr; Back to Tests
                  </button>
                  <h2 style={{ fontSize: '1.6rem' }}>Results for "{viewingTestSubmissions.title}"</h2>
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>Student Submissions ({selectedTestSubmissions.length})</h3>
                {selectedTestSubmissions.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                    No student has submitted answers for this test yet.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <th style={{ padding: '12px' }}>Student Name</th>
                        <th style={{ padding: '12px' }}>Email Address</th>
                        <th style={{ padding: '12px' }}>Submitted Date</th>
                        <th style={{ padding: '12px' }}>Total Score</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTestSubmissions.map(sub => (
                        <tr key={sub._id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                          <td style={{ padding: '12px', fontWeight: '600' }}>{sub.student?.name}</td>
                          <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{sub.student?.email}</td>
                          <td style={{ padding: '12px' }}>{new Date(sub.submittedAt).toLocaleString()}</td>
                          <td style={{ padding: '12px', color: 'var(--success)', fontWeight: '700' }}>{sub.totalScore} Pts</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <button className="btn btn-secondary" onClick={() => openSubmissionDetails(sub._id)} style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                              Review Answers
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                  <a
                    href={`/api/tests/${viewingTestSubmissions._id}/submissions/csv`}
                    download={`${viewingTestSubmissions.title.replace(/\s+/g, '_')}_marks.csv`}
                    className="btn btn-primary"
                    style={{ padding: '8px 18px', fontSize: '0.9rem', textDecoration: 'none', display: 'inline-block' }}
                    onClick={e => {
                      // Attach token to request via fetch, then trigger download
                      e.preventDefault();
                      fetch(`https://codeassess-backend-ltvf.onrender.com/api/tests/${viewingTestSubmissions._id}/submissions/csv`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                      })
                        .then(res => res.blob())
                        .then(blob => {
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${viewingTestSubmissions.title.replace(/\s+/g, '_')}_marks.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        })
                        .catch(() => alert('Failed to download report.'));
                    }}
                  >
                    ⬇ Download Marks Report (CSV)
                  </a>
                </div>
              </div>
            </div>

          ) : (
            /* Dashboard Home */
            <div>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                  <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Trainer Terminal</h1>
                  <p style={{ color: 'var(--text-muted)' }}>Manage tests, questions, compilation runs, and grade reports.</p>
                </div>
                <button className="btn btn-primary" onClick={startCreateTest}>
                  + Create Test
                </button>
              </header>

              <div className="card">
                <h2 style={{ fontSize: '1.4rem', marginBottom: '16px' }}>Your Assessments</h2>
                {tests.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                    No assessments created yet. Click "+ Create Test" above to build one.
                  </div>
                ) : (
                  <div className="test-list">
                    {tests.map(test => (
                      <div key={test._id} className="test-item">
                        <div>
                          <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{test.title}</h3>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{test.description || 'No description.'}</p>
                          <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <span style={{ color: 'var(--accent-light)', fontWeight: '600' }}>⏱ {test.duration} min</span>
                            <span>📝 {test.questions?.length || 0} questions</span>
                            <span>📅 {new Date(test.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn-secondary" onClick={() => viewSubmissions(test._id)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            Submissions
                          </button>
                          <button className="btn btn-secondary" onClick={() => startEditTest(test)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            Edit
                          </button>
                          <button className="btn btn-danger" onClick={() => deleteTest(test._id)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 4: TEST PORTAL ENVIRONMENT (STUDENT) */}
      {currentView === 'test-portal' && activeTest && (
        <div className="portal-layout animate-fade-in">
          {/* Left panel: Info & Navigation */}
          <div className="portal-sidebar">
            <h2 style={{ fontSize: '1.3rem', marginBottom: '6px' }}>{activeTest.title}</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Time Remaining</span>
              <strong style={{ fontSize: '1.1rem', color: timeLeft < 120 ? 'var(--error)' : 'var(--success)' }}>
                {formatTime(timeLeft)}
              </strong>
            </div>

            <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '8px' }}>Questions</h3>
            <div className="question-nav">
              {activeTest.questions.map((q, idx) => {
                const answer = studentAnswers.find(a => a.questionId === q._id);
                let isAnswered = false;
                if (answer) {
                  if (q.type === 'mcq') isAnswered = answer.mcqAnswer !== null;
                  else isAnswered = !!answer.codeAnswer && answer.codeAnswer.trim().length > 0;
                }
                
                return (
                  <button 
                    key={q._id} 
                    className={`q-nav-btn ${activeQuestionIndex === idx ? 'active' : ''} ${isAnswered ? 'answered' : ''}`}
                    onClick={() => setActiveQuestionIndex(idx)}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                All inputs are automatically saved.
              </p>
              <button className="btn btn-primary" onClick={submitTest} disabled={isSubmittingTest}>
                {isSubmittingTest ? 'Submitting...' : 'Finish & Submit Test'}
              </button>
            </div>
          </div>

          {/* Main workspace splits */}
          <div className="portal-main">
            <div className="workspace-container">
              {/* Question view */}
              <div className="pane-left">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', background: 'rgba(99,102,241,0.2)', color: 'var(--accent-light)', padding: '4px 10px', borderRadius: '12px', fontWeight: '700' }}>
                    Question {activeQuestionIndex + 1} ({activeTest.questions[activeQuestionIndex].type.toUpperCase()})
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Weight: <strong>{activeTest.questions[activeQuestionIndex].points} Pts</strong>
                  </span>
                </div>

                <h2 style={{ fontSize: '1.4rem', marginTop: '10px' }}>{activeTest.questions[activeQuestionIndex].title}</h2>
                <div style={{ color: '#e5e7eb', fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                  {activeTest.questions[activeQuestionIndex].description}
                </div>

                {/* MCQ Question Mode Options */}
                {activeTest.questions[activeQuestionIndex].type === 'mcq' && (
                  <div className="mcq-options" style={{ marginTop: '20px' }}>
                    {activeTest.questions[activeQuestionIndex].options.map((opt, oIdx) => {
                      const selAnswer = studentAnswers.find(a => a.questionId === activeTest.questions[activeQuestionIndex]._id);
                      const isSelected = selAnswer && selAnswer.mcqAnswer === oIdx;
                      return (
                        <div 
                          key={oIdx} 
                          className={`mcq-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => updateAnswer(oIdx, 'mcqAnswer')}
                        >
                          <div className="mcq-indicator">
                            {String.fromCharCode(65 + oIdx)}
                          </div>
                          <div style={{ fontSize: '0.95rem' }}>{opt}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Sample Test Case view for coding/debugging */}
                {(activeTest.questions[activeQuestionIndex].type === 'coding' || activeTest.questions[activeQuestionIndex].type === 'debugging') && 
                  activeTest.questions[activeQuestionIndex].testCases?.filter(t => t.isSample).length > 0 && (
                    <div style={{ marginTop: '24px' }}>
                      <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Sample Test Cases:</h4>
                      {activeTest.questions[activeQuestionIndex].testCases
                        .filter(t => t.isSample)
                        .map((tc, tcIdx) => (
                          <div key={tcIdx} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '8px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div>
                                <span style={{ color: 'var(--text-muted)' }}>Input (stdin):</span>
                                <pre style={{ marginTop: '4px', background: '#070913', padding: '6px', borderRadius: '4px' }}>{tc.input || '(none)'}</pre>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-muted)' }}>Expected Output (stdout):</span>
                                <pre style={{ marginTop: '4px', background: '#070913', padding: '6px', borderRadius: '4px' }}>{tc.output}</pre>
                              </div>
                            </div>
                          </div>
                      ))}
                    </div>
                )}
              </div>

              {/* Code writing panel */}
              <div className="pane-right">
                {activeTest.questions[activeQuestionIndex].type === 'mcq' ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
                    This question type (MCQ) does not require a compiler or code execution. Choose an option on the left.
                  </div>
                ) : (
                  <CodeEditor
                    value={studentAnswers.find(a => a.questionId === activeTest.questions[activeQuestionIndex]._id)?.codeAnswer || ''}
                    onChange={(val) => updateAnswer(val, 'codeAnswer')}
                    language={studentAnswers.find(a => a.questionId === activeTest.questions[activeQuestionIndex]._id)?.language || 'javascript'}
                    onLanguageChange={(lang) => updateAnswer(lang, 'language')}
                    isLanguageEditable={activeTest.questions[activeQuestionIndex].type === 'coding'} // Debugging is fixed language
                  />
                )}
              </div>
            </div>

            {/* Bottom Nav Footer */}
            <div style={{ padding: '12px 24px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setActiveQuestionIndex(prev => Math.max(0, prev - 1))}
                disabled={activeQuestionIndex === 0}
              >
                &larr; Previous Question
              </button>
              
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Question {activeQuestionIndex + 1} of {activeTest.questions.length}
              </span>

              <button 
                className="btn btn-secondary" 
                onClick={() => setActiveQuestionIndex(prev => Math.min(activeTest.questions.length - 1, prev + 1))}
                disabled={activeQuestionIndex === activeTest.questions.length - 1}
              >
                Next Question &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 5: DETAILED SUBMISSION / GRADING VIEW (STUDENT OR TEACHER) */}
      {currentView === 'submission-view' && activeSubmission && (
        <div className="container animate-fade-in">
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <button 
                className="btn btn-secondary" 
                onClick={() => setCurrentView(user.role === 'trainer' ? 'trainer-dashboard' : 'student-dashboard')}
                style={{ padding: '6px 12px', fontSize: '0.85rem', marginBottom: '8px' }}
              >
                &larr; Back to Dashboard
              </button>
              <h1 style={{ fontSize: '1.8rem' }}>Submission Report: {activeSubmission.test?.title}</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Completed by <strong style={{ color: '#fff' }}>{activeSubmission.student?.name}</strong> ({activeSubmission.student?.email})
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Overall Score</div>
              <strong style={{ fontSize: '2rem', color: 'var(--success)' }}>{activeSubmission.totalScore} Pts</strong>
            </div>
          </header>

          <div className="card" style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Question Grading Breakdown</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {activeSubmission.answers.map((ans, idx) => {
                const originalQ = activeSubmission.test?.questions.find(q => q._id === ans.questionId);
                const scorePercentage = ans.totalCases > 0 ? (ans.passedCases / ans.totalCases) * 100 : 0;
                
                return (
                  <div key={ans._id} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: 'rgba(0,0,0,0.15)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontWeight: '700', color: 'var(--accent-light)' }}>
                        Q#{idx + 1}: {originalQ?.title || 'Unknown Question'} ({ans.type.toUpperCase()})
                      </span>
                      <strong style={{ color: scorePercentage === 100 ? 'var(--success)' : scorePercentage > 0 ? 'var(--warning)' : 'var(--error)' }}>
                        {ans.score} Pts (Passed {ans.passedCases}/{ans.totalCases} cases)
                      </strong>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                      {originalQ?.description}
                    </p>

                    {ans.type === 'mcq' && (
                      <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {originalQ?.options.map((opt, oIdx) => {
                          const isCorrect = originalQ.correctOption === oIdx; // Might be hidden for student listing but active here
                          const isStudentSelect = ans.mcqAnswer === oIdx;
                          let optStyle = { padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)' };
                          
                          if (isCorrect) {
                            optStyle.background = 'rgba(16, 185, 129, 0.1)';
                            optStyle.borderColor = 'var(--success)';
                          } else if (isStudentSelect && !isCorrect) {
                            optStyle.background = 'rgba(239, 68, 68, 0.1)';
                            optStyle.borderColor = 'var(--error)';
                          }
                          
                          return (
                            <div key={oIdx} style={optStyle}>
                              <strong>{String.fromCharCode(65 + oIdx)}.</strong> {opt} 
                              {isStudentSelect && <span style={{ marginLeft: '10px', fontSize: '0.75rem', fontWeight: 'bold' }}>(Student Answer)</span>}
                              {isCorrect && <span style={{ marginLeft: '10px', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--success)' }}>(Correct Answer)</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {(ans.type === 'coding' || ans.type === 'debugging') && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Language: <strong>{ans.language}</strong></span>
                        </div>
                        <pre style={{ background: '#05070c', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#e5e7eb' }}>
                          {ans.codeAnswer || '// Student submitted empty code'}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
