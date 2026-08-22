import React, { useState, useEffect, useCallback, useMemo } from 'react';
import CodeEditor from './components/CodeEditor';

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================
const API_BASE = 'https://codeassess-backend-ltvf.onrender.com/api';
const CENTERS = ['Karur', 'Namakkal', 'Coimbatore', 'Dindigul'];
const ROLES = ['student', 'trainer'];
const QUESTION_TYPES = ['mcq', 'debugging', 'coding'];
const DEFAULT_LANGUAGE = 'javascript';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const getDefaultTemplate = (language) => {
  const templates = {
    python: `def solve():\n    # Read input from stdin\n    # Print result to stdout\n    pass\n\nif __name__ == '__main__':\n    solve()`,
    cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write code here\n    return 0;\n}`,
    java: `import java.util.Scanner;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write code here\n    }\n}`,
    go: `package main\nimport "fmt"\n\nfunc main() {\n    // Write code here\n}`,
    javascript: `// Write code here`
  };
  return templates[language] || templates.javascript;
};

const getQuestionStatus = (question, answer) => {
  if (!answer) return 'unanswered';
  if (question.type === 'mcq') {
    return answer.mcqAnswer !== null ? 'answered' : 'unanswered';
  }
  return answer.codeAnswer?.trim() ? 'answered' : 'unanswered';
};

// ==========================================
// CUSTOM HOOKS
// ==========================================
const useAuth = () => {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  const fetchUser = useCallback(async () => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      if (response.ok && data.user) {
        setUser(data.user);
        return data.user;
      } else {
        setToken('');
        setUser(null);
        return null;
      }
    } catch {
      setToken('');
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const logout = useCallback(() => {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
  }, []);

  return { token, setToken, user, setUser, loading, setLoading, fetchUser, logout };
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================
export default function App() {
  // ========== AUTH ==========
  const { token, setToken, user, setUser, loading, setLoading, fetchUser, logout } = useAuth();

  // ========== VIEW STATE ==========
  const [currentView, setCurrentView] = useState('auth');
  const [authTab, setAuthTab] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'student', center: '' });
  const [authError, setAuthError] = useState('');

  // ========== DASHBOARD DATA ==========
  const [tests, setTests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [selectedTestSubmissions, setSelectedTestSubmissions] = useState([]);
  const [viewingTestSubmissions, setViewingTestSubmissions] = useState(null);

  // ========== TEST PORTAL ==========
  const [activeTest, setActiveTest] = useState(null);
  const [activeSubmission, setActiveSubmission] = useState(null);
  const [studentAnswers, setStudentAnswers] = useState([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSubmittingTest, setIsSubmittingTest] = useState(false);

  // ========== TEACHER DASHBOARD ==========
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [editingTestId, setEditingTestId] = useState(null);
  const [testForm, setTestForm] = useState({
    title: '',
    description: '',
    duration: 60,
    subject: '',
    assignedStudents: [],
    questions: []
  });

  // ========== ADMIN DASHBOARD ==========
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminTests, setAdminTests] = useState([]);
  const [adminSubmissions, setAdminSubmissions] = useState([]);
  const [adminPendingUsers, setAdminPendingUsers] = useState([]);
  const [adminTab, setAdminTab] = useState('overview');
  const [adminFilterCenter, setAdminFilterCenter] = useState('');
  const [adminFilterRole, setAdminFilterRole] = useState('');

  // ==========================================
  // API HELPER FUNCTIONS
  // ==========================================
  const apiRequest = useCallback(async (endpoint, options = {}) => {
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    };
    const mergedOptions = { ...defaultOptions, ...options };
    
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, mergedOptions);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }, [token]);

  // ==========================================
  // AUTH HANDLERS
  // ==========================================
  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    const isLogin = authTab === 'login';
    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    const payload = isLogin
      ? { email: authForm.email, password: authForm.password }
      : authForm;

    try {
      const data = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (data.token) {
        setToken(data.token);
        const userData = await fetchUser();
        if (userData) {
          setCurrentView(
            userData.role === 'admin' ? 'admin-dashboard' :
            userData.role === 'trainer' ? 'trainer-dashboard' :
            'student-dashboard'
          );
        }
        setAuthForm({ name: '', email: '', password: '', role: 'student', center: '' });
      } else if (data.message) {
        alert(data.message);
        setAuthTab('login');
      }
    } catch (error) {
      setAuthError(error.message || 'Authentication failed. Please try again.');
    }
  };

  // ==========================================
  // DATA LOADING FUNCTIONS
  // ==========================================
  const loadDashboardData = useCallback(async () => {
    if (!token || !user) return;

    try {
      const testsData = await apiRequest('/tests');
      setTests(testsData);

      if (user.role === 'student') {
        const subData = await apiRequest('/submissions/my');
        setSubmissions(subData);
      }

      if (user.role === 'trainer') {
        const studentsData = await apiRequest('/students');
        setStudentsList(studentsData);
      }
    } catch (error) {
      console.error('Dashboard load failed:', error);
    }
  }, [token, user, apiRequest]);

  const loadAdminData = useCallback(async () => {
    if (!token) return;

    try {
      console.log('📊 Loading admin data...');
      
      const [overview, users, pending, testsData, submissionsData] = await Promise.all([
        apiRequest('/admin/overview'),
        apiRequest('/admin/users'),
        apiRequest('/admin/pending-users'),
        apiRequest('/admin/tests'),
        apiRequest('/admin/submissions')
      ]);

      console.log('📊 Pending users from API:', pending);
      console.log('📊 All users from API:', users);

      const pendingFromUsers = users.filter(u => {
        return u.isActive === false || (u.isActive === undefined && u.role !== 'admin');
      });
      
      console.log('📊 Pending users from users list:', pendingFromUsers);

      setAdminOverview(overview);
      setAdminUsers(users);
      setAdminTests(testsData);
      setAdminSubmissions(submissionsData);
      
      if (pending && pending.length > 0) {
        setAdminPendingUsers(pending);
      } else if (pendingFromUsers.length > 0) {
        console.log('⚠️ Pending endpoint returned empty, using filtered users list');
        setAdminPendingUsers(pendingFromUsers);
      } else {
        setAdminPendingUsers([]);
      }
    } catch (error) {
      console.error('Admin data load failed:', error);
    }
  }, [token, apiRequest]);

  // ==========================================
  // TEST PORTAL FUNCTIONS
  // ==========================================
  const startTest = useCallback(async (testId) => {
    try {
      const testData = await apiRequest(`/tests/${testId}`);
      
      setActiveTest(testData);
      setTimeLeft(testData.duration * 60);
      setActiveQuestionIndex(0);

      const initialAnswers = testData.questions.map((question) => {
        let codeAnswer = '';
        const language = question.language || DEFAULT_LANGUAGE;

        if (question.type === 'debugging') {
          codeAnswer = question.buggyCode;
        } else if (question.type === 'coding') {
          codeAnswer = question.languageTemplates?.[language] || getDefaultTemplate(language);
        }

        return {
          questionId: question._id,
          type: question.type,
          mcqAnswer: null,
          codeAnswer,
          language
        };
      });

      setStudentAnswers(initialAnswers);
      setCurrentView('test-portal');
    } catch (error) {
      alert('Could not load test details: ' + error.message);
    }
  }, [apiRequest]);

  const submitTest = useCallback(async () => {
    if (isSubmittingTest || !activeTest) return;

    setIsSubmittingTest(true);

    try {
      const data = await apiRequest('/submissions', {
        method: 'POST',
        body: JSON.stringify({
          testId: activeTest._id,
          answers: studentAnswers
        })
      });

      alert(`Test submitted successfully! You scored: ${data.totalScore} points.`);
      setActiveTest(null);
      setCurrentView('student-dashboard');
      await loadDashboardData();
    } catch (error) {
      alert('Error submitting test: ' + error.message);
    } finally {
      setIsSubmittingTest(false);
    }
  }, [activeTest, studentAnswers, isSubmittingTest, apiRequest, loadDashboardData]);

  const updateAnswer = useCallback((value, field = 'codeAnswer') => {
    if (!activeTest) return;

    const currentQuestion = activeTest.questions[activeQuestionIndex];
    const updatedAnswers = [...studentAnswers];
    const answerIndex = updatedAnswers.findIndex(a => a.questionId === currentQuestion._id);

    if (answerIndex === -1) return;

    updatedAnswers[answerIndex][field] = value;

    if (field === 'language' && currentQuestion.type === 'coding') {
      const newLanguage = value;
      updatedAnswers[answerIndex].codeAnswer = 
        currentQuestion.languageTemplates?.[newLanguage] || 
        getDefaultTemplate(newLanguage);
    }

    setStudentAnswers(updatedAnswers);
  }, [activeTest, activeQuestionIndex, studentAnswers]);

  // ==========================================
  // SUBMISSION FUNCTIONS
  // ==========================================
  const openSubmissionDetails = useCallback(async (submissionId) => {
    try {
      const data = await apiRequest(`/submissions/${submissionId}`);
      setActiveSubmission(data);
      setCurrentView('submission-view');
    } catch (error) {
      alert('Could not load submission details: ' + error.message);
    }
  }, [apiRequest]);

  // ==========================================
  // TEACHER FUNCTIONS
  // ==========================================
  const startCreateTest = useCallback(() => {
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
  }, []);

  const startEditTest = useCallback((test) => {
    setTestForm({
      title: test.title,
      description: test.description || '',
      duration: test.duration,
      subject: test.subject || '',
      assignedStudents: test.assignedStudents ? test.assignedStudents.map(s => s._id || s) : [],
      questions: test.questions.map((q) => ({
        _id: q._id,
        type: q.type,
        title: q.title,
        description: q.description,
        points: q.points,
        options: q.options || [],
        correctOption: q.correctOption,
        buggyCode: q.buggyCode,
        language: q.language,
        testCases: q.testCases || [],
        languageTemplates: q.languageTemplates instanceof Map
          ? Object.fromEntries(q.languageTemplates)
          : q.languageTemplates
      }))
    });
    setEditingTestId(test._id);
    setIsCreatingTest(true);
  }, []);

  const handleCreateTestSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!testForm.title || testForm.questions.length === 0) {
      alert('Please provide a title and at least one question.');
      return;
    }

    const isEdit = !!editingTestId;
    const endpoint = isEdit ? `/tests/${editingTestId}` : '/tests';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      await apiRequest(endpoint, {
        method,
        body: JSON.stringify(testForm)
      });

      alert(isEdit ? 'Test updated successfully!' : 'Test created successfully!');
      setIsCreatingTest(false);
      setEditingTestId(null);
      await loadDashboardData();
    } catch (error) {
      alert('Failed to submit: ' + error.message);
    }
  }, [testForm, editingTestId, apiRequest, loadDashboardData]);

  const deleteTest = useCallback(async (testId) => {
    if (!confirm('Are you sure you want to delete this test? All student records will be lost.')) {
      return;
    }

    try {
      await apiRequest(`/tests/${testId}`, { method: 'DELETE' });
      alert('Test deleted.');
      await loadDashboardData();
    } catch (error) {
      alert('Error deleting test: ' + error.message);
    }
  }, [apiRequest, loadDashboardData]);

  const viewSubmissions = useCallback(async (testId) => {
    try {
      const data = await apiRequest(`/submissions/test/${testId}`);
      setSelectedTestSubmissions(data);
      const test = tests.find(t => t._id === testId);
      setViewingTestSubmissions(test);
    } catch (error) {
      alert('Could not load submissions: ' + error.message);
    }
  }, [apiRequest, tests]);

  // ==========================================
  // QUESTION FORM FUNCTIONS
  // ==========================================
  const addQuestionToForm = useCallback((type) => {
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
  }, []);

  const removeQuestionFromForm = useCallback((idx) => {
    const list = [...testForm.questions];
    list.splice(idx, 1);
    setTestForm(prev => ({ ...prev, questions: list }));
  }, [testForm.questions]);

  const updateQuestionForm = useCallback((idx, field, value) => {
    const list = [...testForm.questions];
    list[idx][field] = value;
    setTestForm(prev => ({ ...prev, questions: list }));
  }, [testForm.questions]);

  const updateQuestionTestCase = useCallback((qIdx, tcIdx, field, value) => {
    const list = [...testForm.questions];
    const tcList = [...list[qIdx].testCases];
    tcList[tcIdx][field] = value;
    list[qIdx].testCases = tcList;
    setTestForm(prev => ({ ...prev, questions: list }));
  }, [testForm.questions]);

  const addTestCaseToQuestion = useCallback((qIdx) => {
    const list = [...testForm.questions];
    list[qIdx].testCases.push({ input: '', output: '', isSample: false });
    setTestForm(prev => ({ ...prev, questions: list }));
  }, [testForm.questions]);

  const removeTestCaseFromQuestion = useCallback((qIdx, tcIdx) => {
    const list = [...testForm.questions];
    list[qIdx].testCases.splice(tcIdx, 1);
    setTestForm(prev => ({ ...prev, questions: list }));
  }, [testForm.questions]);

  // ==========================================
  // ADMIN FUNCTIONS
  // ==========================================
  const deleteUser = useCallback(async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await apiRequest(`/admin/users/${userId}`, { method: 'DELETE' });
      alert('User deleted.');
      
      setAdminUsers(prev => prev.filter(user => user._id !== userId));
      setAdminPendingUsers(prev => prev.filter(user => user._id !== userId));
      
      await loadAdminData();
    } catch (error) {
      alert('Error deleting user: ' + error.message);
    }
  }, [apiRequest, loadAdminData]);

  const editUser = useCallback(async (userId) => {
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
        await apiRequest(`/admin/users/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: newName, email: newEmail, center: newCenter })
        });
        alert('User updated.');
        await loadAdminData();
      } catch (error) {
        alert('Error updating user: ' + error.message);
      }
    }
  }, [adminUsers, apiRequest, loadAdminData]);

  const approveUser = useCallback(async (userId) => {
    if (!confirm('Are you sure you want to approve this user?')) return;

    try {
      console.log('📤 Approving user with ID:', userId);
      
      const response = await apiRequest(`/admin/approve-user/${userId}`, { 
        method: 'PATCH'
      });
      
      console.log('📥 Approve response:', response);
      
      alert('User approved successfully!');
      
      setAdminPendingUsers(prev => prev.filter(user => user._id !== userId));
      
      setAdminUsers(prev => prev.map(user => 
        user._id === userId ? { ...user, isActive: true } : user
      ));
      
      await loadAdminData();
    } catch (error) {
      console.error('❌ Error approving user:', error);
      alert('Error approving user: ' + error.message);
    }
  }, [apiRequest, loadAdminData]);

  const downloadAdminCsv = useCallback(async (url, filename) => {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch {
      alert('Download failed.');
    }
  }, [token]);

  // ==========================================
  // EFFECTS
  // ==========================================
  useEffect(() => {
    const initializeApp = async () => {
      const userData = await fetchUser();
      if (userData) {
        setCurrentView(
          userData.role === 'admin' ? 'admin-dashboard' :
          userData.role === 'trainer' ? 'trainer-dashboard' :
          'student-dashboard'
        );
      }
    };
    initializeApp();
  }, [fetchUser]);

  useEffect(() => {
    if (!user) return;

    if (user.role === 'admin') {
      loadAdminData();
    } else {
      loadDashboardData();
    }
  }, [user, currentView, loadAdminData, loadDashboardData]);

  useEffect(() => {
    if (currentView !== 'test-portal' || timeLeft <= 0) {
      if (timeLeft === 0 && currentView === 'test-portal' && activeTest) {
        submitTest();
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, currentView, activeTest, submitTest]);

  const setCurrentViewWithAutoSubmit = useCallback(async (view) => {
    if (activeTest && !isSubmittingTest && currentView === 'test-portal') {
      try {
        await submitTest();
      } catch {
        // Ignore errors, navigation will proceed
      }
    }
    setCurrentView(view);
  }, [activeTest, isSubmittingTest, currentView, submitTest]);

  // ==========================================
  // RENDER HELPERS
  // ==========================================
  const renderLoading = () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '20px' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <h3 style={{ color: 'var(--text-muted)' }}>Loading Platform...</h3>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
    </div>
  );

  const renderHeader = () => {
    if (!user) return null;

    return (
      <nav className="navbar">
        <div className="nav-logo">
          <span>&lt;/&gt; CodeAssess</span>
        </div>
        <div className="nav-user">
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Logged in as <strong style={{ color: '#fff' }}>{user.name}</strong> ({user.role.toUpperCase()})
          </span>
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              logout();
              setCurrentView('auth');
            }} 
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            Logout
          </button>
        </div>
      </nav>
    );
  };

  // ==========================================
  // MAIN RENDER
  // ==========================================
  if (loading) {
    return renderLoading();
  }

  return (
    <div>
      {renderHeader()}

      {currentView === 'auth' && (
        <div className="auth-container">
          <div className="card auth-card animate-fade-in">
            <h2 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '1.8rem' }}>
              Welcome to CodeAssess
            </h2>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
              Online programming assessment compiler dashboard
            </p>

            <div className="auth-tabs">
              <div 
                className={`auth-tab ${authTab === 'login' ? 'active' : ''}`} 
                onClick={() => setAuthTab('login')}
              >
                Login
              </div>
              <div 
                className={`auth-tab ${authTab === 'register' ? 'active' : ''}`} 
                onClick={() => setAuthTab('register')}
              >
                Register
              </div>
            </div>

            {authError && (
              <div style={{ 
                background: 'rgba(239, 68, 68, 0.1)', 
                color: '#f87171', 
                border: '1px solid rgba(239, 68, 68, 0.2)', 
                padding: '12px', 
                borderRadius: '8px', 
                marginBottom: '16px', 
                fontSize: '0.85rem', 
                textAlign: 'center' 
              }}>
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
                <>
                  <div className="input-group">
                    <label className="input-label">Register As</label>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                      {ROLES.map(role => (
                        <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="role" 
                            value={role} 
                            checked={authForm.role === role} 
                            onChange={() => setAuthForm({ ...authForm, role })}
                            style={{ accentColor: 'var(--accent)' }}
                          />
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>

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
                      {CENTERS.map(center => (
                        <option key={center} value={center}>{center}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px', padding: '12px' }}>
                {authTab === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {currentView === 'admin-dashboard' && (
        <AdminDashboard
          adminOverview={adminOverview}
          adminUsers={adminUsers}
          adminPendingUsers={adminPendingUsers}
          adminTests={adminTests}
          adminSubmissions={adminSubmissions}
          adminTab={adminTab}
          setAdminTab={setAdminTab}
          adminFilterCenter={adminFilterCenter}
          setAdminFilterCenter={setAdminFilterCenter}
          adminFilterRole={adminFilterRole}
          setAdminFilterRole={setAdminFilterRole}
          loadAdminData={loadAdminData}
          deleteUser={deleteUser}
          editUser={editUser}
          approveUser={approveUser}
          deleteTest={deleteTest}
          downloadAdminCsv={downloadAdminCsv}
          CENTERS={CENTERS}
        />
      )}

      {currentView === 'student-dashboard' && (
        <StudentDashboard
          tests={tests}
          submissions={submissions}
          startTest={startTest}
          openSubmissionDetails={openSubmissionDetails}
        />
      )}

      {currentView === 'trainer-dashboard' && (
        <TrainerDashboard
          tests={tests}
          studentsList={studentsList}
          isCreatingTest={isCreatingTest}
          viewingTestSubmissions={viewingTestSubmissions}
          selectedTestSubmissions={selectedTestSubmissions}
          testForm={testForm}
          setTestForm={setTestForm}
          editingTestId={editingTestId}
          startCreateTest={startCreateTest}
          startEditTest={startEditTest}
          handleCreateTestSubmit={handleCreateTestSubmit}
          deleteTest={deleteTest}
          viewSubmissions={viewSubmissions}
          setViewingTestSubmissions={setViewingTestSubmissions}
          setIsCreatingTest={setIsCreatingTest}
          openSubmissionDetails={openSubmissionDetails}
          addQuestionToForm={addQuestionToForm}
          removeQuestionFromForm={removeQuestionFromForm}
          updateQuestionForm={updateQuestionForm}
          updateQuestionTestCase={updateQuestionTestCase}
          addTestCaseToQuestion={addTestCaseToQuestion}
          removeTestCaseFromQuestion={removeTestCaseFromQuestion}
        />
      )}

      {currentView === 'test-portal' && activeTest && (
        <TestPortal
          activeTest={activeTest}
          studentAnswers={studentAnswers}
          activeQuestionIndex={activeQuestionIndex}
          setActiveQuestionIndex={setActiveQuestionIndex}
          timeLeft={timeLeft}
          isSubmittingTest={isSubmittingTest}
          updateAnswer={updateAnswer}
          submitTest={submitTest}
          formatTime={formatTime}
        />
      )}

      {currentView === 'submission-view' && activeSubmission && (
        <SubmissionView
          activeSubmission={activeSubmission}
          user={user}
          setCurrentView={setCurrentView}
        />
      )}
    </div>
  );
}

// ==========================================
// ADMIN DASHBOARD
// ==========================================
function AdminDashboard({
  adminOverview,
  adminUsers,
  adminPendingUsers,
  adminTests,
  adminSubmissions,
  adminTab,
  setAdminTab,
  adminFilterCenter,
  setAdminFilterCenter,
  adminFilterRole,
  setAdminFilterRole,
  loadAdminData,
  deleteUser,
  editUser,
  approveUser,
  deleteTest,
  downloadAdminCsv,
  CENTERS
}) {
  const filteredUsers = useMemo(() => {
    return adminUsers.filter(user => {
      const matchCenter = !adminFilterCenter || user.center === adminFilterCenter;
      const matchRole = !adminFilterRole || user.role === adminFilterRole;
      return matchCenter && matchRole;
    });
  }, [adminUsers, adminFilterCenter, adminFilterRole]);

  const filteredSubmissions = useMemo(() => {
    return adminSubmissions.filter(sub => 
      !adminFilterCenter || sub.student?.center === adminFilterCenter
    );
  }, [adminSubmissions, adminFilterCenter]);

  useEffect(() => {
    console.log('📊 AdminDashboard - Pending Users:', adminPendingUsers);
  }, [adminPendingUsers]);

  return (
    <div className="container animate-fade-in">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Admin Dashboard</h1>
          <p style={{ color: 'var(--text-muted)' }}>Platform-wide overview, center reports, and data exports.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={loadAdminData} style={{ padding: '8px 16px' }}>
            🔄 Refresh
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--border)', paddingBottom: '0' }}>
        {['overview', 'users', 'pending', 'tests', 'submissions'].map(tab => (
          <button
            key={tab}
            onClick={() => setAdminTab(tab)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '10px 20px',
              fontSize: '0.95rem',
              fontWeight: adminTab === tab ? '700' : '400',
              color: adminTab === tab ? 'var(--accent-light)' : 'var(--text-muted)',
              borderBottom: adminTab === tab ? '3px solid var(--accent)' : '3px solid transparent',
              marginBottom: '-2px',
              transition: 'all 0.2s'
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'pending' && adminPendingUsers.length > 0 && (
              <span style={{
                background: '#ef4444',
                color: 'white',
                borderRadius: '50%',
                padding: '0 6px',
                fontSize: '0.7rem',
                marginLeft: '4px'
              }}>
                {adminPendingUsers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {adminTab === 'overview' && adminOverview && (
        <div>
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

      {adminTab === 'users' && (
        <div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="input-field" 
              style={{ width: 'auto', padding: '8px 12px' }}
              value={adminFilterCenter}
              onChange={e => setAdminFilterCenter(e.target.value)}
            >
              <option value="">All Centers</option>
              {CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              className="input-field" 
              style={{ width: 'auto', padding: '8px 12px' }}
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
                downloadAdminCsv(`/admin/users/csv?${params}`, 'users_report.csv');
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
                  <th style={{ padding: '12px' }}>Status</th>
                  <th style={{ padding: '12px' }}>Registered</th>
                  <th style={{ padding: '12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const isActive = u.isActive === true;
                  return (
                    <tr key={u._id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '600' }}>{u.name}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{u.email}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ 
                          padding: '2px 10px', 
                          borderRadius: '12px', 
                          fontSize: '0.78rem', 
                          fontWeight: '700',
                          background: u.role === 'trainer' ? 'rgba(52,211,153,0.15)' : 'rgba(96,165,250,0.15)',
                          color: u.role === 'trainer' ? '#34d399' : '#60a5fa'
                        }}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{u.center || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ 
                          padding: '2px 10px', 
                          borderRadius: '12px', 
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          background: isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: isActive ? '#10b981' : '#ef4444'
                        }}>
                          {isActive ? '✅ Active' : '⏳ Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button className="btn btn-sm btn-primary" onClick={() => editUser(u._id)} style={{ marginRight: '4px' }}>
                          Edit
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteUser(u._id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No users found.</div>
            )}
          </div>
        </div>
      )}

      {adminTab === 'pending' && (
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '16px' 
          }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', margin: 0 }}>
                Pending Approvals ({adminPendingUsers.length})
              </h3>
              <button 
                className="btn btn-secondary" 
                onClick={loadAdminData}
                style={{ padding: '4px 12px', fontSize: '0.75rem' }}
              >
                🔄 Refresh
              </button>
            </div>
            {adminPendingUsers.length > 0 && (
              <button 
                className="btn btn-primary"
                style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                onClick={async () => {
                  if (confirm('Approve all pending users?')) {
                    for (const user of adminPendingUsers) {
                      await approveUser(user._id);
                    }
                    await loadAdminData();
                  }
                }}
              >
                ✅ Approve All
              </button>
            )}
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
                {adminPendingUsers && adminPendingUsers.length > 0 ? (
                  adminPendingUsers.map(u => (
                    <tr key={u._id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '600' }}>{u.name}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{u.email}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ 
                          padding: '2px 10px', 
                          borderRadius: '12px', 
                          fontSize: '0.78rem', 
                          fontWeight: '700',
                          background: u.role === 'trainer' ? 'rgba(52,211,153,0.15)' : 'rgba(96,165,250,0.15)',
                          color: u.role === 'trainer' ? '#34d399' : '#60a5fa'
                        }}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{u.center || '—'}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button 
                          className="btn btn-sm btn-primary" 
                          onClick={() => approveUser(u._id)} 
                          style={{ marginRight: '4px' }}
                        >
                          ✅ Approve
                        </button>
                        <button 
                          className="btn btn-sm btn-danger" 
                          onClick={() => deleteUser(u._id)}
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✅</div>
                      No pending users waiting for approval.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                    <button className="btn btn-sm btn-danger" onClick={() => deleteTest(t._id)}>Delete</button>
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

      {adminTab === 'submissions' && (
        <div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="input-field" 
              style={{ width: 'auto', padding: '8px 12px' }}
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
                downloadAdminCsv(`/admin/submissions/csv?${params}`, 'submissions_report.csv');
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
                {filteredSubmissions.map(s => (
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
            {filteredSubmissions.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No submissions found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// STUDENT DASHBOARD
// ==========================================
function StudentDashboard({ tests, submissions, startTest, openSubmissionDetails }) {
  return (
    <div className="container animate-fade-in">
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Student Terminal</h1>
        <p style={{ color: 'var(--text-muted)' }}>Select an assessment to complete, or review past results.</p>
      </header>

      <div className="dashboard-grid">
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

        <div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '16px' }}>Your Submissions</h2>
          {submissions.length === 0 ? (
            <div className="card" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '30px' }}>
              You have not submitted any tests yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
  );
}

// ==========================================
// TRAINER DASHBOARD
// ==========================================
function TrainerDashboard({
  tests,
  studentsList,
  isCreatingTest,
  viewingTestSubmissions,
  selectedTestSubmissions,
  testForm,
  setTestForm,
  editingTestId,
  startCreateTest,
  startEditTest,
  handleCreateTestSubmit,
  deleteTest,
  viewSubmissions,
  setViewingTestSubmissions,
  setIsCreatingTest,
  openSubmissionDetails,
  addQuestionToForm,
  removeQuestionFromForm,
  updateQuestionForm,
  updateQuestionTestCase,
  addTestCaseToQuestion,
  removeTestCaseFromQuestion
}) {
  if (isCreatingTest) {
    return (
      <TestCreationForm
        testForm={testForm}
        setTestForm={setTestForm}
        editingTestId={editingTestId}
        studentsList={studentsList}
        setIsCreatingTest={setIsCreatingTest}
        handleCreateTestSubmit={handleCreateTestSubmit}
        addQuestionToForm={addQuestionToForm}
        removeQuestionFromForm={removeQuestionFromForm}
        updateQuestionForm={updateQuestionForm}
        updateQuestionTestCase={updateQuestionTestCase}
        addTestCaseToQuestion={addTestCaseToQuestion}
        removeTestCaseFromQuestion={removeTestCaseFromQuestion}
      />
    );
  }

  if (viewingTestSubmissions) {
    return (
      <TestSubmissionsView
        viewingTestSubmissions={viewingTestSubmissions}
        selectedTestSubmissions={selectedTestSubmissions}
        setViewingTestSubmissions={setViewingTestSubmissions}
        openSubmissionDetails={openSubmissionDetails}
      />
    );
  }

  return (
    <div className="container animate-fade-in">
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
  );
}

// ==========================================
// TEST CREATION FORM - UPDATED WITH DURATION CONTROL
// ==========================================
function TestCreationForm({
  testForm,
  setTestForm,
  editingTestId,
  studentsList,
  setIsCreatingTest,
  handleCreateTestSubmit,
  addQuestionToForm,
  removeQuestionFromForm,
  updateQuestionForm,
  updateQuestionTestCase,
  addTestCaseToQuestion,
  removeTestCaseFromQuestion
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [centerFilter, setCenterFilter] = useState('');

  const uniqueCenters = useMemo(() => {
    const centers = studentsList
      .map(s => s.center)
      .filter(center => center && center.trim() !== '');
    
    if (centers.length === 0) {
      return ['All Centers', 'No Center'];
    }
    
    return ['All Centers', ...new Set(centers)];
  }, [studentsList]);

  const filteredStudents = useMemo(() => {
    return studentsList.filter(student => {
      const searchMatch = !searchTerm || 
        student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.email?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const studentCenter = student.center || 'No Center';
      const centerMatch = !centerFilter || centerFilter === 'All Centers' || 
        studentCenter === centerFilter;
      
      return searchMatch && centerMatch;
    });
  }, [studentsList, searchTerm, centerFilter]);

  const selectedCount = testForm.assignedStudents.length;
  const totalStudents = studentsList.length;
  const filteredCount = filteredStudents.length;

  const getCenterDisplay = (student) => {
    const center = student.center;
    if (!center || center.trim() === '') {
      return 'No Center';
    }
    return center;
  };

  // Handle duration change
  const handleDurationChange = (value) => {
    const duration = parseInt(value) || 1;
    setTestForm(prev => ({ ...prev, duration }));
  };

  // Preset duration buttons
  const durationPresets = [15, 30, 45, 60, 90, 120];

  return (
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

        {/* ========================================== */}
        {/* DURATION INPUT - UPDATED */}
        {/* ========================================== */}
        <div className="input-group">
          <label className="input-label">
            Duration (Minutes)
            <span style={{ 
              fontSize: '0.8rem', 
              color: 'var(--text-muted)', 
              marginLeft: '8px',
              fontWeight: 'normal'
            }}>
              Current: {testForm.duration} minutes
            </span>
          </label>
          
          {/* Preset Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            flexWrap: 'wrap',
            marginBottom: '10px'
          }}>
            {durationPresets.map(preset => (
              <button
                key={preset}
                type="button"
                className={`btn ${testForm.duration === preset ? 'btn-primary' : 'btn-secondary'}`}
                style={{ 
                  padding: '4px 12px', 
                  fontSize: '0.8rem',
                  minWidth: '45px'
                }}
                onClick={() => handleDurationChange(preset)}
              >
                {preset}m
              </button>
            ))}
          </div>

          {/* Custom Duration Input with Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input
              type="range"
              min="1"
              max="180"
              step="1"
              value={testForm.duration}
              onChange={e => handleDurationChange(e.target.value)}
              style={{ 
                flex: 1,
                accentColor: 'var(--accent)',
                height: '6px',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            />
            <input
              type="number"
              className="input-field"
              style={{ 
                width: '80px', 
                textAlign: 'center',
                padding: '6px 8px'
              }}
              min="1"
              max="180"
              value={testForm.duration}
              onChange={e => handleDurationChange(e.target.value)}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>min</span>
          </div>
          
          {/* Duration Info */}
          <div style={{ 
            marginTop: '6px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            display: 'flex',
            gap: '16px'
          }}>
            <span>⏱ {testForm.duration} minute{testForm.duration !== 1 ? 's' : ''}</span>
            <span>📊 {Math.floor(testForm.duration / 60)}h {testForm.duration % 60}m</span>
          </div>
        </div>

        {/* Assign to Students */}
        <div className="input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="input-label" style={{ margin: 0 }}>
              👥 Assign to Students ({selectedCount} selected of {totalStudents} total)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => {
                  const filteredIds = filteredStudents.map(s => s._id);
                  setTestForm(prev => ({ ...prev, assignedStudents: filteredIds }));
                }}
              >
                Select All Filtered
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => setTestForm(prev => ({ ...prev, assignedStudents: [] }))}
              >
                Clear All
              </button>
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            marginBottom: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="text"
                className="input-field"
                placeholder="🔍 Search by name or email..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ minWidth: '150px' }}>
              <select
                className="input-field"
                value={centerFilter}
                onChange={e => setCenterFilter(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '0.9rem', cursor: 'pointer' }}
              >
                {uniqueCenters.map(center => (
                  <option key={center} value={center}>
                    {center === 'All Centers' ? '🏢 All Centers' : `🏢 ${center}`}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              fontSize: '0.85rem', 
              color: 'var(--text-muted)',
              padding: '4px 8px'
            }}>
              {filteredCount} student{filteredCount !== 1 ? 's' : ''} found
            </div>
          </div>

          {studentsList.length === 0 ? (
            <div style={{ 
              color: 'var(--text-muted)', 
              fontSize: '0.85rem', 
              padding: '12px', 
              background: 'rgba(0,0,0,0.2)', 
              borderRadius: '8px', 
              border: '1px solid var(--border)' 
            }}>
              No students registered yet.
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ 
              color: 'var(--text-muted)', 
              fontSize: '0.85rem', 
              padding: '12px', 
              background: 'rgba(0,0,0,0.2)', 
              borderRadius: '8px', 
              border: '1px solid var(--border)' 
            }}>
              No students match your search/filter criteria.
            </div>
          ) : (
            <div style={{ 
              maxHeight: '250px', 
              overflowY: 'auto', 
              background: 'rgba(0,0,0,0.2)', 
              borderRadius: '8px', 
              border: '1px solid var(--border)', 
              padding: '8px' 
            }}>
              {filteredStudents.map(student => {
                const isChecked = testForm.assignedStudents.includes(student._id);
                const centerDisplay = getCenterDisplay(student);
                
                return (
                  <label
                    key={student._id}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '10px', 
                      padding: '6px 8px', 
                      borderRadius: '6px', 
                      cursor: 'pointer', 
                      transition: 'background 0.15s', 
                      background: isChecked ? 'rgba(99,102,241,0.15)' : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isChecked ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isChecked ? 'rgba(99,102,241,0.15)' : 'transparent';
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      style={{ accentColor: 'var(--accent)', width: '16px', height: '16px', flexShrink: 0 }}
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: isChecked ? '600' : '400' }}>
                        {student.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                        {student.email}
                      </div>
                    </div>
                    <span style={{ 
                      fontSize: '0.65rem', 
                      padding: '2px 8px', 
                      borderRadius: '12px',
                      background: centerDisplay === 'No Center' 
                        ? 'rgba(255, 255, 255, 0.05)' 
                        : 'rgba(99,102,241,0.1)',
                      color: centerDisplay === 'No Center' 
                        ? 'var(--text-muted)' 
                        : 'var(--accent-light)',
                      border: centerDisplay === 'No Center'
                        ? '1px solid rgba(255,255,255,0.1)'
                        : '1px solid rgba(99,102,241,0.2)',
                      flexShrink: 0,
                      whiteSpace: 'nowrap'
                    }}>
                      {centerDisplay}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginTop: '8px',
            padding: '8px 4px',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            borderTop: '1px solid var(--border)'
          }}>
            <span>
              {selectedCount} student{selectedCount !== 1 ? 's' : ''} selected
              {(searchTerm || centerFilter) && ` (filtered from ${totalStudents} total)`}
            </span>
            {selectedCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                onClick={() => {
                  const names = studentsList
                    .filter(s => testForm.assignedStudents.includes(s._id))
                    .map(s => `• ${s.name} (${s.center || 'No Center'})`)
                    .join('\n');
                  alert(`Selected Students (${testForm.assignedStudents.length}):\n\n${names}`);
                }}
              >
                View Selected
              </button>
            )}
          </div>
        </div>

        <hr style={{ borderColor: 'var(--border)', margin: '20px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.25rem' }}>📝 Questions ({testForm.questions.length})</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {QUESTION_TYPES.map(type => (
              <button 
                key={type}
                type="button" 
                className="btn btn-secondary" 
                onClick={() => addQuestionToForm(type)} 
                style={{ fontSize: '0.75rem', padding: '6px 12px' }}
              >
                + {type.toUpperCase()}
              </button>
            ))}
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
                    <option value="go">Go</option>
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
            💾 Save Assessment
          </button>
        </div>
      </form>
    </div>
  );
}

// ==========================================
// TEST SUBMISSIONS VIEW
// ==========================================
function TestSubmissionsView({
  viewingTestSubmissions,
  selectedTestSubmissions,
  setViewingTestSubmissions,
  openSubmissionDetails
}) {
  return (
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
      </div>
    </div>
  );
}

// ==========================================
// TEST PORTAL
// ==========================================
function TestPortal({
  activeTest,
  studentAnswers,
  activeQuestionIndex,
  setActiveQuestionIndex,
  timeLeft,
  isSubmittingTest,
  updateAnswer,
  submitTest,
  formatTime
}) {
  const currentQuestion = activeTest.questions[activeQuestionIndex];
  const currentAnswer = studentAnswers.find(a => a.questionId === currentQuestion._id);

  return (
    <div className="portal-layout animate-fade-in">
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
            const status = getQuestionStatus(q, answer);
            
            return (
              <button 
                key={q._id} 
                className={`q-nav-btn ${activeQuestionIndex === idx ? 'active' : ''} ${status === 'answered' ? 'answered' : ''}`}
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

      <div className="portal-main">
        <div className="workspace-container">
          <div className="pane-left">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', background: 'rgba(99,102,241,0.2)', color: 'var(--accent-light)', padding: '4px 10px', borderRadius: '12px', fontWeight: '700' }}>
                Question {activeQuestionIndex + 1} ({currentQuestion.type.toUpperCase()})
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Weight: <strong>{currentQuestion.points} Pts</strong>
              </span>
            </div>

            <h2 style={{ fontSize: '1.4rem', marginTop: '10px' }}>{currentQuestion.title}</h2>
            <div style={{ color: '#e5e7eb', fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
              {currentQuestion.description}
            </div>

            {currentQuestion.type === 'mcq' && (
              <div className="mcq-options" style={{ marginTop: '20px' }}>
                {currentQuestion.options.map((opt, oIdx) => {
                  const isSelected = currentAnswer?.mcqAnswer === oIdx;
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

            {(currentQuestion.type === 'coding' || currentQuestion.type === 'debugging') && 
              currentQuestion.testCases?.filter(t => t.isSample).length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Sample Test Cases:</h4>
                  {currentQuestion.testCases
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

          <div className="pane-right">
            {currentQuestion.type === 'mcq' ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
                This question type (MCQ) does not require a compiler or code execution. Choose an option on the left.
              </div>
            ) : (
              <CodeEditor
                value={currentAnswer?.codeAnswer || ''}
                onChange={(val) => updateAnswer(val, 'codeAnswer')}
                language={currentAnswer?.language || DEFAULT_LANGUAGE}
                onLanguageChange={(lang) => updateAnswer(lang, 'language')}
                isLanguageEditable={currentQuestion.type === 'coding'}
              />
            )}
          </div>
        </div>

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
  );
}

// ==========================================
// SUBMISSION VIEW
// ==========================================
function SubmissionView({ activeSubmission, user, setCurrentView }) {
  return (
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
                      const isCorrect = originalQ.correctOption === oIdx;
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
  );
}