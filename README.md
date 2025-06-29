# 🔬 AI Research Paper Analyzer

A simple React frontend with Flask API backend for analyzing research papers using Google's Gemini AI.

## Project Structure

```
ResearchBuddy/
├── backend/                 # Flask API backend
│   ├── app.py              # Main Flask application
│   ├── requirements.txt    # Python dependencies
│   ├── .env               # Environment variables (create this)
│   └── uploads/           # Local PDF storage (auto-created)
├── frontend/              # React frontend
│   ├── src/
│   │   ├── App.jsx        # Main React component
│   │   ├── App.css        # Styling
│   │   └── index.css      # Global styles
│   ├── package.json       # Node.js dependencies
│   └── ...               # Other Vite/React files
└── README.md             # This file
```

## Features

- **Left Sidebar**: PDF upload and file management
- **Right Side**: Response area with custom query input and analysis buttons
- **Analysis Types**:
  - 🔍 Research Gap Analysis
  - ⚙️ Methodology Comparison
  - 📋 Key Findings Summary
  - 🚀 Future Work Suggestions
  - 💬 Custom Questions

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Create a virtual environment:

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file with your Google API key:

   ```
   GOOGLE_API_KEY=your_gemini_api_key_here
   ```

5. Run the Flask server:
   ```bash
   python app.py
   ```
   The API will be available at `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   The frontend will be available at `http://localhost:5173`

## Usage

1. Start both backend and frontend servers
2. Open `http://localhost:5173` in your browser
3. Upload PDF research papers (max 5 files)
4. Use analysis buttons or ask custom questions
5. View responses in the dedicated response area

## API Endpoints

- `POST /api/upload` - Upload PDF files
- `POST /api/analyze` - Analyze papers with different types
- `GET /api/files/<session_id>` - Get uploaded files
- `DELETE /api/files/<session_id>` - Delete session files
- `GET /api/health` - Health check

## Technologies Used

- **Frontend**: React (Vite), ES6 JavaScript, CSS
- **Backend**: Flask, Python
- **AI**: Google Gemini API
- **PDF Processing**: PyMuPDF
- **File Storage**: Local filesystem

## Future Enhancements

- AWS S3 integration for file storage
- User authentication
- Response history persistence
- Export functionality
- Advanced PDF processing
