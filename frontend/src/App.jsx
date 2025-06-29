import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import jsPDF from "jspdf";
import "./App.css";

// Import our new utilities
import {
  storePDF,
  getAllPDFs,
  getPDF,
  deletePDF,
  clearAllPDFs,
  isIndexedDBSupported,
  getStorageStats,
} from "./utils/indexedDB.js";
import {
  processMultiplePDFs,
  validateMultiplePDFs,
  estimateProcessingTime,
  isPDFJSReady,
} from "./utils/pdfProcessor.js";

const API_BASE_URL = "http://localhost:5000/api";

function App() {
  // Updated state management for client-side processing
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [storedPDFs, setStoredPDFs] = useState([]);
  const [responses, setResponses] = useState([]);
  const [customQuery, setCustomQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState(null);
  const [processingProgress, setProcessingProgress] = useState({
    current: 0,
    total: 0,
  });
  const [fileProgress, setFileProgress] = useState({
    fileName: "",
    page: 0,
    totalPages: 0,
  });
  const [extractedTexts, setExtractedTexts] = useState([]);
  const [isDBSupported, setIsDBSupported] = useState(true);

  // Initialize component and check for stored PDFs
  useEffect(() => {
    const initializeApp = async () => {
      // Check if IndexedDB is supported
      if (!isIndexedDBSupported()) {
        setIsDBSupported(false);
        console.warn(
          "IndexedDB not supported. Falling back to session-only storage."
        );
        return;
      }

      // Check if PDF.js is ready
      if (!isPDFJSReady()) {
        console.warn("PDF.js not properly loaded");
        return;
      }

      try {
        // Load previously stored PDFs
        const stored = await getAllPDFs();
        setStoredPDFs(stored);
      } catch (error) {
        console.error("Error loading stored PDFs:", error);
      }
    };

    initializeApp();
  }, []);

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Validate files
    const validation = validateMultiplePDFs(files);
    if (!validation.isValid) {
      alert(validation.error);
      return;
    }

    // Show processing estimation
    const estimation = estimateProcessingTime(files);
    const shouldProceed = window.confirm(
      `Processing ${files.length} file(s) (${estimation.totalSizeMB}MB total).\n` +
        `Estimated time: ${estimation.estimatedTimeString}\n\n` +
        `Continue with processing?`
    );

    if (!shouldProceed) return;

    setIsLoading(true);
    setProcessingStatus("Processing PDFs...");
    setProcessingProgress({ current: 0, total: files.length });
    setExtractedTexts([]);
    setUploadedFiles([]);

    try {
      // Process files with progress tracking
      const results = await processMultiplePDFs(
        files,
        // File progress callback
        (fileIndex, fileName, page, totalPages) => {
          setFileProgress({ fileName, page, totalPages });
        },
        // Overall progress callback
        (completedFiles, totalFiles) => {
          setProcessingProgress({ current: completedFiles, total: totalFiles });
        }
      );

      // Separate successful and failed results
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (failed.length > 0) {
        console.warn("Some files failed to process:", failed);
        alert(
          `${failed.length} file(s) failed to process. Check console for details.`
        );
      }

      if (successful.length === 0) {
        alert("No files were successfully processed.");
        return;
      }

      // Store successful results in IndexedDB and prepare for analysis
      const storedFiles = [];
      const texts = [];
      const fileMetadata = [];

      for (const result of successful) {
        try {
          // Find the original file
          const originalFile = files[result.fileIndex];

          // Store in IndexedDB if supported
          let storedId = null;
          if (isDBSupported) {
            storedId = await storePDF(originalFile, result.extractedText);
          }

          storedFiles.push({
            id: storedId || `temp_${Date.now()}_${result.fileIndex}`,
            filename: result.filename,
            size: result.size,
            totalPages: result.totalPages,
            wordCount: result.wordCount,
            characterCount: result.characterCount,
            extractionDate: result.extractionDate,
            isStored: !!storedId,
          });

          texts.push(result.extractedText);
          fileMetadata.push({
            filename: result.filename,
            size: result.size,
            totalPages: result.totalPages,
            wordCount: result.wordCount,
          });
        } catch (storageError) {
          console.error("Error storing PDF:", storageError);
          // Continue with session-only storage
          storedFiles.push({
            id: `temp_${Date.now()}_${result.fileIndex}`,
            filename: result.filename,
            size: result.size,
            totalPages: result.totalPages,
            wordCount: result.wordCount,
            characterCount: result.characterCount,
            extractionDate: result.extractionDate,
            isStored: false,
          });

          texts.push(result.extractedText);
          fileMetadata.push({
            filename: result.filename,
            size: result.size,
            totalPages: result.totalPages,
            wordCount: result.wordCount,
          });
        }
      }

      // Update state
      setUploadedFiles(storedFiles);
      setExtractedTexts(texts);
      setResponses([]); // Clear previous responses

      // Update stored PDFs list if using IndexedDB
      if (isDBSupported) {
        try {
          const updated = await getAllPDFs();
          setStoredPDFs(updated);
        } catch (error) {
          console.warn("Error updating stored PDFs list:", error);
        }
      }

      setProcessingStatus(
        `Successfully processed ${successful.length} file(s)`
      );

      // Clear status after a delay
      setTimeout(() => {
        setProcessingStatus(null);
        setFileProgress({ fileName: "", page: 0, totalPages: 0 });
      }, 3000);
    } catch (error) {
      console.error("Error processing files:", error);
      alert(`Error processing files: ${error.message}`);
      setProcessingStatus("Processing failed");
      setTimeout(() => setProcessingStatus(null), 3000);
    } finally {
      setIsLoading(false);
      // Reset file input
      event.target.value = "";
    }
  };

  const handleAnalysis = async (analysisType, customQuestion = "") => {
    if (extractedTexts.length === 0) {
      alert("Please upload and process files first");
      return;
    }

    setIsLoading(true);
    try {
      // Prepare file metadata for the request
      const fileMetadata = uploadedFiles.map((file) => ({
        filename: file.filename,
        size: file.size,
        totalPages: file.totalPages,
        wordCount: file.wordCount,
        isStored: file.isStored,
      }));

      const response = await fetch(`${API_BASE_URL}/analyze-text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pdf_texts: extractedTexts,
          analysis_type: analysisType,
          custom_question: customQuestion,
          file_metadata: fileMetadata,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newResponse = {
          id: Date.now(),
          title: getAnalysisTitle(analysisType, customQuestion),
          content: data.response,
          type: analysisType,
          documentsProcessed: data.documents_processed,
          fileMetadata: data.file_metadata,
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

  const clearCurrentFiles = () => {
    setUploadedFiles([]);
    setExtractedTexts([]);
    setResponses([]);
    setProcessingStatus(null);
    setFileProgress({ fileName: "", page: 0, totalPages: 0 });
  };

  const handleDeleteStoredPDF = async (pdfId) => {
    if (!isDBSupported) return;

    try {
      await deletePDF(pdfId);
      const updated = await getAllPDFs();
      setStoredPDFs(updated);

      // If this PDF is currently loaded, remove it from current session
      const updatedFiles = uploadedFiles.filter((file) => file.id !== pdfId);
      if (updatedFiles.length !== uploadedFiles.length) {
        setUploadedFiles(updatedFiles);
        // Also update extracted texts accordingly
        const fileIndex = uploadedFiles.findIndex((file) => file.id === pdfId);
        if (fileIndex !== -1) {
          const updatedTexts = extractedTexts.filter(
            (_, index) => index !== fileIndex
          );
          setExtractedTexts(updatedTexts);
        }
      }
    } catch (error) {
      console.error("Error deleting PDF:", error);
      alert("Failed to delete PDF: " + error.message);
    }
  };

  const handleClearAllStoredPDFs = async () => {
    if (!isDBSupported) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete all stored PDFs? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      await clearAllPDFs();
      setStoredPDFs([]);
      clearCurrentFiles();
    } catch (error) {
      console.error("Error clearing all PDFs:", error);
      alert("Failed to clear PDFs: " + error.message);
    }
  };

  const loadStoredPDF = async (pdfId) => {
    if (!isDBSupported) return;

    try {
      setIsLoading(true);
      setProcessingStatus("Loading stored PDF...");

      const pdfData = await getPDF(pdfId);
      if (!pdfData) {
        alert("PDF not found");
        return;
      }

      // Clear current files and load the stored one
      setUploadedFiles([
        {
          id: pdfData.id,
          filename: pdfData.filename,
          size: pdfData.size,
          totalPages: pdfData.totalPages || "Unknown",
          wordCount: pdfData.extractedText.split(/\s+/).length,
          characterCount: pdfData.extractedText.length,
          extractionDate: pdfData.uploadDate,
          isStored: true,
        },
      ]);

      setExtractedTexts([pdfData.extractedText]);
      setResponses([]);

      setProcessingStatus("PDF loaded successfully");
      setTimeout(() => setProcessingStatus(null), 2000);
    } catch (error) {
      console.error("Error loading stored PDF:", error);
      alert("Failed to load PDF: " + error.message);
      setProcessingStatus("Failed to load PDF");
      setTimeout(() => setProcessingStatus(null), 2000);
    } finally {
      setIsLoading(false);
    }
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

            {/* IndexedDB Support Warning */}
            {!isDBSupported && (
              <div className="warning-message">
                ⚠️ Local storage not available. Files will only be stored for
                this session.
              </div>
            )}

            <div className="upload-area">
              <input
                type="file"
                id="file-upload"
                multiple
                accept=".pdf"
                onChange={handleFileUpload}
                style={{ display: "none" }}
                disabled={isLoading}
              />
              <label
                htmlFor="file-upload"
                className={`upload-button ${isLoading ? "disabled" : ""}`}
              >
                + Add PDFs
              </label>
              <p className="upload-note">
                Upload up to 5 research papers (PDF)
                <br />
                <small>Processing happens locally in your browser</small>
              </p>
            </div>

            {/* Processing Status */}
            {processingStatus && (
              <div className="processing-status">
                <div className="status-text">{processingStatus}</div>
                {processingProgress.total > 0 && (
                  <div className="progress-info">
                    Processing: {processingProgress.current}/
                    {processingProgress.total} files
                  </div>
                )}
                {fileProgress.fileName && (
                  <div className="file-progress">
                    {fileProgress.fileName}: Page {fileProgress.page}/
                    {fileProgress.totalPages}
                  </div>
                )}
              </div>
            )}

            {/* Current Session Files */}
            {uploadedFiles.length > 0 && (
              <div className="uploaded-files">
                <div className="section-header">
                  <h3>Current Session:</h3>
                  <button
                    onClick={clearCurrentFiles}
                    className="clear-session-button"
                    title="Clear current files"
                  >
                    🗑️
                  </button>
                </div>
                {uploadedFiles.map((file, index) => (
                  <div key={file.id || index} className="file-item">
                    <div className="file-info">
                      <div className="file-number">
                        📄 Paper {index + 1} {file.isStored && "💾"}
                      </div>
                      <div className="file-name">{file.filename}</div>
                      <div className="file-details">
                        {file.totalPages} pages • {file.wordCount} words
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Stored PDFs Section */}
            {isDBSupported && storedPDFs.length > 0 && (
              <div className="stored-files">
                <div className="section-header">
                  <h3>Stored PDFs:</h3>
                  <button
                    onClick={handleClearAllStoredPDFs}
                    className="clear-all-button"
                    title="Delete all stored PDFs"
                  >
                    🗑️ All
                  </button>
                </div>
                <div className="stored-files-list">
                  {storedPDFs.slice(0, 10).map((pdf) => (
                    <div key={pdf.id} className="stored-file-item">
                      <div className="stored-file-info">
                        <div className="stored-file-name">{pdf.filename}</div>
                        <div className="stored-file-details">
                          {(pdf.size / 1024 / 1024).toFixed(1)}MB •
                          {new Date(pdf.uploadDate).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="stored-file-actions">
                        <button
                          onClick={() => loadStoredPDF(pdf.id)}
                          className="load-button"
                          title="Load this PDF"
                          disabled={isLoading}
                        >
                          📂
                        </button>
                        <button
                          onClick={() => handleDeleteStoredPDF(pdf.id)}
                          className="delete-button"
                          title="Delete this PDF"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                  {storedPDFs.length > 10 && (
                    <div className="more-files-note">
                      ... and {storedPDFs.length - 10} more files
                    </div>
                  )}
                </div>
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
                disabled={extractedTexts.length === 0 || isLoading}
              />
              <button
                onClick={handleCustomQuery}
                disabled={
                  extractedTexts.length === 0 ||
                  isLoading ||
                  !customQuery.trim()
                }
                className="send-button"
              >
                {isLoading ? "⏳" : "➤"}
              </button>
            </div>

            {/* Analysis Buttons */}
            <div className="analysis-buttons">
              <button
                onClick={() => handleAnalysis("research_gap")}
                disabled={extractedTexts.length === 0 || isLoading}
                className="analysis-btn"
              >
                🔍 Research Gap
              </button>
              <button
                onClick={() => handleAnalysis("methodology")}
                disabled={extractedTexts.length === 0 || isLoading}
                className="analysis-btn"
              >
                ⚙️ Compare Methods
              </button>
              <button
                onClick={() => handleAnalysis("key_findings")}
                disabled={extractedTexts.length === 0 || isLoading}
                className="analysis-btn"
              >
                📋 Key Findings
              </button>
              <button
                onClick={() => handleAnalysis("future_work")}
                disabled={extractedTexts.length === 0 || isLoading}
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
