/**
 * Client-side PDF text extraction utility using PDF.js
 * Handles PDF processing with progress tracking and error handling
 */

import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker with multiple fallback options
function configurePDFWorker() {
  // Try different worker configurations in order of preference
  const workerOptions = [
    // Option 1: Use worker from public directory (most reliable)
    () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
    },
    // Option 2: Use local worker from node_modules (correct .mjs extension)
    () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
    },
    // Option 3: Use CDN with HTTPS
    () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    },
    // Option 4: Use jsdelivr CDN as backup
    () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
    },
    // Option 5: Disable worker (slower but more compatible)
    () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = null;
      console.warn("PDF.js worker disabled - processing will be slower");
    },
  ];

  for (let i = 0; i < workerOptions.length; i++) {
    try {
      workerOptions[i]();
      console.log(`PDF.js worker configured with option ${i + 1}`);
      break;
    } catch (error) {
      console.warn(`PDF.js worker option ${i + 1} failed:`, error);
      if (i === workerOptions.length - 1) {
        console.error("All PDF.js worker options failed");
      }
    }
  }
}

// Initialize worker configuration
configurePDFWorker();

/**
 * Extract text from a single PDF file
 * @param {File} file - The PDF file to process
 * @param {Function} onProgress - Progress callback function (page, totalPages)
 * @returns {Promise<Object>} Object containing extracted text and metadata
 */
export async function extractTextFromPDF(file, onProgress = null) {
  try {
    // Validate file type
    if (!file.type.includes("pdf")) {
      throw new Error("File must be a PDF");
    }

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      // Remove cMap dependencies for better reliability
      // Most PDFs will work without character maps
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    let fullText = "";
    const pageTexts = [];

    // Extract text from each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Combine text items with proper spacing
        const pageText = textContent.items
          .map((item) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        pageTexts.push({
          pageNumber: pageNum,
          text: pageText,
          length: pageText.length,
        });

        fullText += pageText + "\n\n";

        // Report progress
        if (onProgress) {
          onProgress(pageNum, totalPages);
        }

        // Clean up page resources
        page.cleanup();
      } catch (pageError) {
        console.warn(`Error processing page ${pageNum}:`, pageError);
        pageTexts.push({
          pageNumber: pageNum,
          text: "",
          length: 0,
          error: pageError.message,
        });
      }
    }

    // Clean up PDF resources
    pdf.cleanup();

    return {
      filename: file.name,
      size: file.size,
      totalPages,
      extractedText: fullText.trim(),
      pageTexts,
      wordCount: fullText.trim().split(/\s+/).length,
      characterCount: fullText.length,
      extractionDate: new Date().toISOString(),
      success: true,
    };
  } catch (error) {
    // Provide more specific error messages
    let errorMessage = error.message;

    if (error.message.includes("worker")) {
      errorMessage =
        "PDF.js worker failed to load. Please check your internet connection or try refreshing the page.";
    } else if (error.message.includes("Invalid PDF")) {
      errorMessage = "The PDF file appears to be corrupted or invalid.";
    } else if (error.message.includes("fetch")) {
      errorMessage =
        "Failed to load PDF processing resources. Please check your internet connection.";
    }

    console.error("PDF extraction error:", error);
    throw new Error(`Failed to extract text from PDF: ${errorMessage}`);
  }
}

/**
 * Process multiple PDF files sequentially
 * @param {FileList|Array} files - Array of PDF files to process
 * @param {Function} onFileProgress - Progress callback for individual files (fileIndex, fileName, page, totalPages)
 * @param {Function} onOverallProgress - Progress callback for overall processing (completedFiles, totalFiles)
 * @returns {Promise<Array>} Array of extraction results
 */
export async function processMultiplePDFs(
  files,
  onFileProgress = null,
  onOverallProgress = null
) {
  const results = [];
  const totalFiles = files.length;

  if (totalFiles === 0) {
    throw new Error("No files provided for processing");
  }

  if (totalFiles > 5) {
    throw new Error("Maximum 5 files allowed for processing");
  }

  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];

    try {
      // Progress callback for individual file
      const fileProgressCallback = onFileProgress
        ? (page, totalPages) => onFileProgress(i, file.name, page, totalPages)
        : null;

      const result = await extractTextFromPDF(file, fileProgressCallback);
      results.push({
        ...result,
        fileIndex: i,
        processingOrder: i + 1,
      });

      // Report overall progress
      if (onOverallProgress) {
        onOverallProgress(i + 1, totalFiles);
      }
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error);
      results.push({
        filename: file.name,
        size: file.size,
        fileIndex: i,
        processingOrder: i + 1,
        success: false,
        error: error.message,
        extractionDate: new Date().toISOString(),
      });

      // Report overall progress even for failed files
      if (onOverallProgress) {
        onOverallProgress(i + 1, totalFiles);
      }
    }
  }

  return results;
}

/**
 * Validate PDF file before processing
 * @param {File} file - The file to validate
 * @returns {Object} Validation result with isValid and error message
 */
export function validatePDFFile(file) {
  const maxSize = 50 * 1024 * 1024; // 50MB limit

  if (!file) {
    return { isValid: false, error: "No file provided" };
  }

  if (!file.type.includes("pdf")) {
    return { isValid: false, error: "File must be a PDF" };
  }

  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(
        1
      )}MB) exceeds maximum limit of 50MB`,
    };
  }

  if (file.size === 0) {
    return { isValid: false, error: "File appears to be empty" };
  }

  return { isValid: true, error: null };
}

/**
 * Validate multiple PDF files
 * @param {FileList|Array} files - Files to validate
 * @returns {Object} Validation result with overall validity and individual file results
 */
export function validateMultiplePDFs(files) {
  if (!files || files.length === 0) {
    return {
      isValid: false,
      error: "No files provided",
      fileResults: [],
    };
  }

  if (files.length > 5) {
    return {
      isValid: false,
      error: "Maximum 5 files allowed",
      fileResults: [],
    };
  }

  const fileResults = Array.from(files).map((file, index) => ({
    index,
    filename: file.name,
    ...validatePDFFile(file),
  }));

  const invalidFiles = fileResults.filter((result) => !result.isValid);

  return {
    isValid: invalidFiles.length === 0,
    error:
      invalidFiles.length > 0
        ? `${invalidFiles.length} invalid file(s) found`
        : null,
    fileResults,
    validFiles: fileResults.filter((result) => result.isValid),
    invalidFiles,
  };
}

/**
 * Get estimated processing time for files
 * @param {FileList|Array} files - Files to estimate processing time for
 * @returns {Object} Estimation details
 */
export function estimateProcessingTime(files) {
  if (!files || files.length === 0) {
    return { estimatedSeconds: 0, estimatedMinutes: 0 };
  }

  // Rough estimation: 1MB = ~10 seconds processing time
  const totalSizeMB = Array.from(files).reduce(
    (sum, file) => sum + file.size / 1024 / 1024,
    0
  );
  const estimatedSeconds = Math.ceil(totalSizeMB * 10);
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

  return {
    totalSizeMB: totalSizeMB.toFixed(1),
    estimatedSeconds,
    estimatedMinutes,
    estimatedTimeString:
      estimatedMinutes > 1
        ? `~${estimatedMinutes} minute(s)`
        : `~${estimatedSeconds} second(s)`,
  };
}

/**
 * Check if PDF.js is properly loaded and configured
 * @returns {boolean} True if PDF.js is ready
 */
export function isPDFJSReady() {
  return (
    typeof pdfjsLib !== "undefined" && pdfjsLib.GlobalWorkerOptions.workerSrc
  );
}
