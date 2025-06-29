/**
 * IndexedDB utility for storing and managing PDF files locally
 * Provides a promise-based API for PDF storage operations
 */

const DB_NAME = "ResearchBuddyDB";
const DB_VERSION = 1;
const STORE_NAME = "pdfs";

/**
 * Initialize and open the IndexedDB database
 * @returns {Promise<IDBDatabase>} Database instance
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });

        // Create indexes for efficient querying
        store.createIndex("filename", "filename", { unique: false });
        store.createIndex("uploadDate", "uploadDate", { unique: false });
        store.createIndex("size", "size", { unique: false });
      }
    };
  });
}

/**
 * Store a PDF file in IndexedDB
 * @param {File} file - The PDF file to store
 * @param {string} extractedText - The extracted text content
 * @returns {Promise<string>} The generated ID for the stored file
 */
export async function storePDF(file, extractedText) {
  try {
    const db = await openDB();

    // Generate unique ID
    const id = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check file size - don't store very large files to avoid quota issues
    const maxFileSize = 50 * 1024 * 1024; // 50MB limit
    let fileData = null;

    if (file.size <= maxFileSize) {
      try {
        // Convert file to ArrayBuffer for storage
        fileData = await file.arrayBuffer();
      } catch (arrayBufferError) {
        console.warn(
          "Failed to convert file to ArrayBuffer, storing metadata only:",
          arrayBufferError
        );
        fileData = null;
      }
    } else {
      console.warn(
        `File ${file.name} is too large (${file.size} bytes), storing metadata only`
      );
    }

    const pdfData = {
      id,
      filename: file.name,
      size: file.size,
      type: file.type,
      uploadDate: new Date().toISOString(),
      fileData, // Will be null for large files or if conversion fails
      extractedText,
      lastAccessed: new Date().toISOString(),
      hasFileData: fileData !== null,
    };

    // Create transaction after all async operations are complete
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      // Set a timeout for the transaction
      const timeoutId = setTimeout(() => {
        transaction.abort();
        reject(new Error("Storage operation timed out"));
      }, 30000); // 30 second timeout

      // Handle transaction completion
      transaction.oncomplete = () => {
        clearTimeout(timeoutId);
      };

      // Handle transaction errors
      transaction.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error(`Transaction failed: ${transaction.error}`));
      };

      transaction.onabort = () => {
        clearTimeout(timeoutId);
        reject(new Error("Transaction was aborted"));
      };

      const request = store.add(pdfData);

      request.onsuccess = () => {
        clearTimeout(timeoutId);
        resolve(id);
      };

      request.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to store PDF: ${request.error}`));
      };
    });
  } catch (error) {
    throw new Error(`Error storing PDF: ${error.message}`);
  }
}

/**
 * Retrieve a PDF file from IndexedDB
 * @param {string} id - The ID of the PDF to retrieve
 * @returns {Promise<Object|null>} The PDF data object or null if not found
 */
export async function getPDF(id) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          // Update last accessed time
          updateLastAccessed(id).catch(console.warn);
        }
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to retrieve PDF: ${request.error}`));
      };
    });
  } catch (error) {
    throw new Error(`Error retrieving PDF: ${error.message}`);
  }
}

/**
 * Get all stored PDFs with metadata
 * @returns {Promise<Array>} Array of PDF metadata objects
 */
export async function getAllPDFs() {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        // Return metadata only (without file data for performance)
        const pdfs = request.result.map((pdf) => ({
          id: pdf.id,
          filename: pdf.filename,
          size: pdf.size,
          type: pdf.type,
          uploadDate: pdf.uploadDate,
          lastAccessed: pdf.lastAccessed,
          hasExtractedText: !!pdf.extractedText,
        }));
        resolve(pdfs);
      };

      request.onerror = () => {
        reject(new Error(`Failed to retrieve PDFs: ${request.error}`));
      };
    });
  } catch (error) {
    throw new Error(`Error retrieving PDFs: ${error.message}`);
  }
}

/**
 * Delete a PDF from IndexedDB
 * @param {string} id - The ID of the PDF to delete
 * @returns {Promise<boolean>} True if deleted successfully
 */
export async function deletePDF(id) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete PDF: ${request.error}`));
      };
    });
  } catch (error) {
    throw new Error(`Error deleting PDF: ${error.message}`);
  }
}

/**
 * Clear all stored PDFs
 * @returns {Promise<boolean>} True if cleared successfully
 */
export async function clearAllPDFs() {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(new Error(`Failed to clear PDFs: ${request.error}`));
      };
    });
  } catch (error) {
    throw new Error(`Error clearing PDFs: ${error.message}`);
  }
}

/**
 * Update the last accessed time for a PDF
 * @param {string} id - The ID of the PDF
 * @returns {Promise<boolean>} True if updated successfully
 */
async function updateLastAccessed(id) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const getRequest = store.get(id);

    return new Promise((resolve, reject) => {
      getRequest.onsuccess = () => {
        const pdf = getRequest.result;
        if (pdf) {
          pdf.lastAccessed = new Date().toISOString();
          const putRequest = store.put(pdf);

          putRequest.onsuccess = () => resolve(true);
          putRequest.onerror = () =>
            reject(
              new Error(`Failed to update last accessed: ${putRequest.error}`)
            );
        } else {
          resolve(false);
        }
      };

      getRequest.onerror = () => {
        reject(new Error(`Failed to get PDF for update: ${getRequest.error}`));
      };
    });
  } catch (error) {
    console.warn(`Error updating last accessed time: ${error.message}`);
    return false;
  }
}

/**
 * Get storage usage statistics
 * @returns {Promise<Object>} Storage statistics
 */
export async function getStorageStats() {
  try {
    const pdfs = await getAllPDFs();
    const totalSize = pdfs.reduce((sum, pdf) => sum + pdf.size, 0);

    return {
      totalFiles: pdfs.length,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      oldestFile:
        pdfs.length > 0
          ? Math.min(...pdfs.map((p) => new Date(p.uploadDate).getTime()))
          : null,
      newestFile:
        pdfs.length > 0
          ? Math.max(...pdfs.map((p) => new Date(p.uploadDate).getTime()))
          : null,
    };
  } catch (error) {
    throw new Error(`Error getting storage stats: ${error.message}`);
  }
}

/**
 * Check if IndexedDB is supported
 * @returns {boolean} True if IndexedDB is supported
 */
export function isIndexedDBSupported() {
  return "indexedDB" in window && indexedDB !== null;
}
