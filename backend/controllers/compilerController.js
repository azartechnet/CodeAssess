const axios = require('axios');

// Supported language aliases and their Piston runtime details
const LANGUAGE_MAP = {
  javascript: { name: 'javascript', version: '*' },
  typescript: { name: 'typescript', version: '*' },
  python: { name: 'python3', version: '*' },
  python3: { name: 'python3', version: '*' },
  cpp: { name: 'cpp', version: '*' },
  c: { name: 'c', version: '*' },
  java: { name: 'java', version: '*' },
  go: { name: 'go', version: '*' },
  csharp: { name: 'csharp', version: '*' },
  ruby: { name: 'ruby', version: '*' },
  php: { name: 'php', version: '*' }
};

// Execute single run of code on Piston
const runSingle = async (language, sourceCode, stdin = "") => {
  const langConfig = LANGUAGE_MAP[language.toLowerCase()];
  if (!langConfig) {
    throw new Error(`Unsupported programming language: ${language}`);
  }

  // File extension detection
  let extension = 'txt';
  if (language === 'javascript' || language === 'js') extension = 'js';
  else if (language === 'typescript' || language === 'ts') extension = 'ts';
  else if (language === 'python' || language === 'python3' || language === 'py') extension = 'py';
  else if (language === 'cpp' || language === 'cpp') extension = 'cpp';
  else if (language === 'c') extension = 'c';
  else if (language === 'java') extension = 'java';
  else if (language === 'go') extension = 'go';
  else if (language === 'csharp' || language === 'cs') extension = 'cs';
  else if (language === 'ruby' || language === 'rb') extension = 'rb';
  else if (language === 'php') extension = 'php';

  const payload = {
    language: langConfig.name,
    version: langConfig.version,
    files: [
      {
        name: `Solution.${extension}`,
        content: sourceCode
      }
    ],
    stdin: stdin,
    args: [],
    compile_timeout: 10000,
    run_timeout: 10000
  };

  try {
    const response = await axios.post('https://emkc.org/api/v2/piston/execute', payload);
    const runResult = response.data.run;
    
    // Check for compilation errors or execution errors
    const compileResult = response.data.compile;
    if (compileResult && compileResult.code !== 0) {
      return {
        success: false,
        error: compileResult.stderr || compileResult.output,
        stdout: "",
        stderr: compileResult.stderr
      };
    }

    return {
      success: runResult.code === 0,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      error: runResult.stderr || (runResult.code !== 0 ? `Exit Code ${runResult.code}` : null)
    };
  } catch (error) {
    console.error("Piston API error:", error.response ? error.response.data : error.message);
    throw new Error("Failed to execute code on compiler server.");
  }
};

// Route controller for testing custom code run (from playground/student environment)
const runCode = async (req, res) => {
  const { language, sourceCode, stdin } = req.body;
  if (!language || !sourceCode) {
    return res.status(400).json({ error: "Language and sourceCode are required." });
  }

  try {
    const result = await runSingle(language, sourceCode, stdin || "");
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Evaluate code against test cases
const evaluateCode = async (language, sourceCode, testCases) => {
  if (!testCases || testCases.length === 0) {
    return { passedCases: 0, totalCases: 0, results: [] };
  }

  const results = [];
  let passedCases = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    try {
      const runRes = await runSingle(language, sourceCode, tc.input);
      
      const cleanOutput = (runRes.stdout || "").trim().replace(/\r\n/g, "\n");
      const cleanExpected = (tc.output || "").trim().replace(/\r\n/g, "\n");
      const passed = runRes.success && (cleanOutput === cleanExpected);

      if (passed) {
        passedCases++;
      }

      results.push({
        input: tc.input,
        expectedOutput: tc.output,
        actualOutput: runRes.stdout || "",
        error: runRes.error,
        passed: passed
      });
    } catch (err) {
      results.push({
        input: tc.input,
        expectedOutput: tc.output,
        actualOutput: "",
        error: err.message,
        passed: false
      });
    }
  }

  return {
    passedCases,
    totalCases: testCases.length,
    results
  };
};

module.exports = {
  runCode,
  evaluateCode
};
