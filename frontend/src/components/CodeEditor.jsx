import React, { useState, useEffect, useRef } from 'react';

export default function CodeEditor({
  value = "",
  onChange,
  language = "javascript",
  onLanguageChange,
  languages = ["javascript", "python", "cpp", "java", "go"],
  isLanguageEditable = true
}) {
  const [stdin, setStdin] = useState("");
  const [consoleOutput, setConsoleOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [lineCount, setLineCount] = useState(1);

  const textareaRef = useRef(null);

  const API_BASE =
    import.meta.env.VITE_API_BASE ||
    "https://codeassess-backend-ltvf.onrender.com";

  useEffect(() => {
    const lines = value.split("\n").length;
    setLineCount(Math.max(lines, 1));
  }, [value]);

  const handleKeyDown = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();

      const { selectionStart, selectionEnd } = e.target;

      const newValue =
        value.substring(0, selectionStart) +
        "    " +
        value.substring(selectionEnd);

      onChange(newValue);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart =
            textareaRef.current.selectionEnd =
            selectionStart + 4;
        }
      }, 0);
    }
  };

  const runCode = async () => {
    setIsRunning(true);
    setConsoleOutput("Compiling & Executing Code...");

    try {
      const response = await fetch(
        `${API_BASE}/api/compiler/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem(
              "token"
            )}`
          },
          body: JSON.stringify({
            language,
            sourceCode: value,
            stdin
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to execute code"
        );
      }

      let output = "";

      if (data.stdout) {
        output += `STDOUT:\n${data.stdout}`;
      }

      if (data.stderr) {
        if (output) output += "\n\n";
        output += `STDERR:\n${data.stderr}`;
      }

      if (!data.stdout && !data.stderr) {
        output =
          "Program executed successfully with no console output.";
      }

      setConsoleOutput(output);
    } catch (error) {
      setConsoleOutput(
        `Error:\n${error.message}`
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="editor-container">
      <div className="editor-header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}
        >
          <span
            style={{
              fontSize: "0.85rem",
              color: "var(--text-muted)"
            }}
          >
            Language:
          </span>

          {isLanguageEditable ? (
            <select
              className="editor-select"
              value={language}
              onChange={(e) =>
                onLanguageChange(e.target.value)
              }
            >
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang.toUpperCase()}
                </option>
              ))}
            </select>
          ) : (
            <span
              style={{
                fontWeight: "600",
                color: "var(--accent-light)"
              }}
            >
              {language.toUpperCase()}
            </span>
          )}
        </div>

        <button
          className="btn btn-primary"
          onClick={runCode}
          disabled={isRunning || !value}
          style={{
            padding: "6px 16px",
            fontSize: "0.85rem"
          }}
        >
          {isRunning ? "Running..." : "Run Code"}
        </button>
      </div>

      <div className="editor-textarea-wrapper">
        <div className="editor-linenumbers">
          {Array.from({ length: lineCount }).map(
            (_, i) => (
              <div key={i}>{i + 1}</div>
            )
          )}
        </div>

        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="// Type your program code here..."
          spellCheck={false}
        />
      </div>

      <div className="console-panel">
        <div className="console-stdin">
          <span
            style={{
              fontSize: "0.85rem",
              color: "var(--text-muted)",
              fontWeight: "600"
            }}
          >
            STDIN:
          </span>

          <input
            type="text"
            placeholder="Type input here..."
            value={stdin}
            onChange={(e) =>
              setStdin(e.target.value)
            }
          />
        </div>

        <div className="console-header">
          <div className="console-title">
            Console Output
          </div>

          <button
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.75rem"
            }}
            onClick={() =>
              setConsoleOutput("")
            }
          >
            Clear
          </button>
        </div>

        <div
          className="console-body"
          style={{
            whiteSpace: "pre-wrap",
            color: consoleOutput.startsWith(
              "Error"
            )
              ? "var(--error)"
              : "var(--text-main)"
          }}
        >
          {consoleOutput ||
            "Run your program to see outputs..."}
        </div>
      </div>
    </div>
  );
}