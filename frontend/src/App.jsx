import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import jsPDF from "jspdf";
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

  const exportToPDF = async () => {
    if (responses.length === 0) {
      alert("No responses to export");
      return;
    }

    try {
      setIsLoading(true);

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - 2 * margin;
      let yPosition = margin;

      // Helper function to add new page if needed
      const checkPageBreak = (requiredHeight) => {
        if (yPosition + requiredHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
      };

      // Helper function to convert markdown to plain text with basic formatting
      const convertMarkdownToText = (text) => {
        return text
          .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold markers
          .replace(/\*(.*?)\*/g, "$1") // Remove italic markers
          .replace(/#{1,6}\s*(.*)/g, "$1") // Remove header markers
          .replace(/`(.*?)`/g, "$1") // Remove code markers
          .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Remove link markers, keep text
          .replace(/^\s*[-*+]\s+/gm, "• ") // Convert bullet points
          .replace(/^\s*\d+\.\s+/gm, "• ") // Convert numbered lists
          .trim();
      };

      // Add title
      pdf.setFontSize(20);
      pdf.setFont("helvetica", "bold");
      pdf.text("AI Research Paper Analysis Results", margin, yPosition);
      yPosition += 15;

      // Add a line under title
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 15;

      // Add file list
      if (uploadedFiles.length > 0) {
        checkPageBreak(30);

        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text("Analyzed Papers:", margin, yPosition);
        yPosition += 10;

        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");

        uploadedFiles.forEach((file, index) => {
          checkPageBreak(8);
          const paperText = `Paper ${index + 1}: ${file.filename}`;

          // Split long filenames if needed
          const lines = pdf.splitTextToSize(paperText, maxWidth);
          lines.forEach((line) => {
            pdf.text(line, margin, yPosition);
            yPosition += 6;
          });
        });

        yPosition += 10;
      }

      // Add responses
      responses.forEach((response) => {
        checkPageBreak(40);

        // Response title
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        const titleLines = pdf.splitTextToSize(response.title, maxWidth);
        titleLines.forEach((line) => {
          checkPageBreak(8);
          pdf.text(line, margin, yPosition);
          yPosition += 8;
        });

        yPosition += 5;

        // Response content
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");

        const cleanContent = convertMarkdownToText(response.content);
        const contentLines = pdf.splitTextToSize(cleanContent, maxWidth);

        contentLines.forEach((line) => {
          checkPageBreak(6);

          // Check if line starts with bullet point for better formatting
          if (line.trim().startsWith("•")) {
            pdf.text(line, margin + 5, yPosition);
          } else {
            pdf.text(line, margin, yPosition);
          }
          yPosition += 5;
        });

        yPosition += 15; // Space between responses
      });

      // Add footer with timestamp
      const timestamp = new Date().toLocaleString();
      const totalPages = pdf.internal.getNumberOfPages();

      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Generated on ${timestamp}`, margin, pageHeight - 10);
        pdf.text(
          `Page ${i} of ${totalPages}`,
          pageWidth - margin - 20,
          pageHeight - 10
        );
      }

      // Download PDF
      const downloadTimestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/:/g, "-");
      pdf.save(`research-analysis-${downloadTimestamp}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsLoading(false);
    }
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
              <div className="header-buttons">
                <button onClick={exportToPDF} className="save-pdf-button">
                  📄 Save to PDF
                </button>
                <button onClick={clearResponses} className="clear-button">
                  Clear All
                </button>
              </div>
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
