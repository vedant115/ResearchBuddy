import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const API_BASE_URL = "http://localhost:5000/api";

function App() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [responses, setResponses] = useState([]);
  const [customQuery, setCustomQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (files.length > 5) {
      alert("Maximum 5 files allowed");
      return;
    }

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setUploadedFiles(data.files);
        setSessionId(data.session_id);
        setResponses([]); // Clear previous responses
      } else {
        const error = await response.json();
        alert(error.error || "Upload failed");
      }
    } catch (error) {
      alert("Upload failed: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalysis = async (analysisType, customQuestion = "") => {
    if (!sessionId) {
      alert("Please upload files first");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          analysis_type: analysisType,
          custom_question: customQuestion,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newResponse = {
          id: Date.now(),
          title: getAnalysisTitle(analysisType, customQuestion),
          content: data.response,
          type: analysisType,
        };
        setResponses((prev) => [...prev, newResponse]);
      } else {
        const error = await response.json();
        alert(error.error || "Analysis failed");
      }
    } catch (error) {
      alert("Analysis failed: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getAnalysisTitle = (type, customQuestion) => {
    const titles = {
      research_gap: "Research Gap Analysis",
      methodology: "Methodology Comparison",
      key_findings: "Key Findings Summary",
      future_work: "Future Work Suggestions",
      custom: `Custom Query: ${customQuestion.substring(0, 50)}${
        customQuestion.length > 50 ? "..." : ""
      }`,
    };
    return titles[type] || "Analysis Result";
  };

  const handleCustomQuery = () => {
    if (!customQuery.trim()) {
      alert("Please enter a question");
      return;
    }
    handleAnalysis("custom", customQuery);
    setCustomQuery("");
  };

  const clearResponses = () => {
    setResponses([]);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🔬 AI Research Paper Analyzer</h1>
        <p>
          Analyze multiple research papers to uncover insights with Gemini AI
        </p>
      </header>

      <div className="app-content">
        {/* Left Sidebar - File Upload */}
        <div className="sidebar">
          <div className="upload-section">
            <h2>📁 Sources</h2>
            <div className="upload-area">
              <input
                type="file"
                id="file-upload"
                multiple
                accept=".pdf"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <label htmlFor="file-upload" className="upload-button">
                + Add PDFs
              </label>
              <p className="upload-note">
                Upload up to 5 research papers (PDF)
              </p>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="uploaded-files">
                <h3>Uploaded Files:</h3>
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <div className="file-number">📄 Paper {index + 1}</div>
                    <div className="file-name">{file.filename}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Chat/Response Area */}
        <div className="main-content">
          <div className="chat-header">
            <h2>💬 Analysis Results</h2>
            {responses.length > 0 && (
              <button onClick={clearResponses} className="clear-button">
                Clear All
              </button>
            )}
          </div>

          {/* Response Display Area */}
          <div className="responses-area">
            {responses.length === 0 ? (
              <div className="empty-state">
                <p>
                  Upload PDFs and click analysis buttons to see results here
                </p>
              </div>
            ) : (
              responses.map((response) => (
                <div key={response.id} className="response-item">
                  <h3>📊 {response.title}</h3>
                  <div className="response-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {response.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Custom Query Input */}
          <div className="query-section">
            <div className="custom-query">
              <textarea
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="Ask a specific question about your research papers..."
                rows={3}
                disabled={!sessionId || isLoading}
              />
              <button
                onClick={handleCustomQuery}
                disabled={!sessionId || isLoading || !customQuery.trim()}
                className="send-button"
              >
                {isLoading ? "⏳" : "➤"}
              </button>
            </div>

            {/* Analysis Buttons */}
            <div className="analysis-buttons">
              <button
                onClick={() => handleAnalysis("research_gap")}
                disabled={!sessionId || isLoading}
                className="analysis-btn"
              >
                🔍 Research Gap
              </button>
              <button
                onClick={() => handleAnalysis("methodology")}
                disabled={!sessionId || isLoading}
                className="analysis-btn"
              >
                ⚙️ Compare Methods
              </button>
              <button
                onClick={() => handleAnalysis("key_findings")}
                disabled={!sessionId || isLoading}
                className="analysis-btn"
              >
                📋 Key Findings
              </button>
              <button
                onClick={() => handleAnalysis("future_work")}
                disabled={!sessionId || isLoading}
                className="analysis-btn"
              >
                🚀 Future Work
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">⏳ Processing...</div>
        </div>
      )}
    </div>
  );
}

export default App;
