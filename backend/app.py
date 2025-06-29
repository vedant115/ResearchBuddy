from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import fitz  # PyMuPDF
import google.generativeai as genai
from werkzeug.utils import secure_filename
import uuid
import shutil

app = Flask(__name__)
# Configure CORS to allow requests from Render domains
if os.environ.get('RENDER'):
    # Production CORS settings
    frontend_url = os.environ.get('FRONTEND_URL', 'https://research-buddy-frontend.onrender.com')
    CORS(app, resources={r"/api/*": {"origins": [frontend_url, "https://*.onrender.com"]}})
else:
    # Development CORS settings
    CORS(app)

# Configure upload settings
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Configure the Gemini API
try:
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
except AttributeError as e:
    print("The GOOGLE_API_KEY environment variable is not set. Please set it in your .env file.")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_gemini_response(prompt, pdf_texts, user_question=""):
    """
    Generates a response from the Gemini model based on a prompt, a list of PDF texts,
    and an optional user question.
    """
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        # Combine the main prompt, the content of all papers, and the specific user question
        combined_input = [prompt]
        for i, text in enumerate(pdf_texts):
            combined_input.append(f"\n--- Research Paper {i+1} ---\n")
            combined_input.append(text)
        if user_question:
            combined_input.append(f"\n--- User's Question ---\n")
            combined_input.append(user_question)

        response = model.generate_content(combined_input)
        return response.text
    except Exception as e:
        return f"Error generating response: {str(e)}"

def extract_text_from_pdf(file_path):
    """
    Extracts text from a PDF file.
    """
    try:
        document = fitz.open(file_path)
        text_parts = [page.get_text() for page in document]
        document.close()
        return " ".join(text_parts)
    except Exception as e:
        raise Exception(f"Error reading PDF: {str(e)}")

# Store uploaded files info in memory (in production, use a database)
uploaded_files_store = {}

@app.route('/api/upload', methods=['POST'])
def upload_files():
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
    
    files = request.files.getlist('files')
    
    if len(files) > 5:
        return jsonify({'error': 'Maximum 5 files allowed'}), 400
    
    uploaded_files = []
    session_id = str(uuid.uuid4())
    
    # Create session directory
    session_dir = os.path.join(UPLOAD_FOLDER, session_id)
    os.makedirs(session_dir, exist_ok=True)
    
    for file in files:
        if file and file.filename and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(session_dir, filename)
            file.save(file_path)
            
            uploaded_files.append({
                'filename': filename,
                'path': file_path,
                'size': os.path.getsize(file_path)
            })
    
    if uploaded_files:
        uploaded_files_store[session_id] = uploaded_files
        return jsonify({
            'session_id': session_id,
            'files': uploaded_files,
            'message': f'{len(uploaded_files)} file(s) uploaded successfully'
        })
    else:
        # Clean up empty directory
        shutil.rmtree(session_dir, ignore_errors=True)
        return jsonify({'error': 'No valid PDF files uploaded'}), 400

@app.route('/api/analyze', methods=['POST'])
def analyze_papers():
    data = request.get_json()
    session_id = data.get('session_id')
    analysis_type = data.get('analysis_type')
    custom_question = data.get('custom_question', '')
    
    if not session_id or session_id not in uploaded_files_store:
        return jsonify({'error': 'Invalid session ID or no files uploaded'}), 400
    
    try:
        # Extract text from all uploaded PDFs
        pdf_texts = []
        for file_info in uploaded_files_store[session_id]:
            text = extract_text_from_pdf(file_info['path'])
            pdf_texts.append(text)
        
        # Define prompts for different analysis types
        prompts = {
            'research_gap': """
            You are a highly skilled research assistant. Based on the following research papers,
            analyze the collective body of work and identify the primary research gap.
            - What are the key unanswered questions?
            - Where does the current research fall short?
            - What is a logical next step or a new direction for future research in this area?
            Provide a concise summary of the gap.
            """,
            'methodology': """
            As an expert academic reviewer, compare and contrast the methodologies used in the provided research papers.
            - What are the main approaches taken in each paper?
            - What are the strengths and weaknesses of each methodology?
            - Are the methodologies appropriate for the research questions they aim to answer?
            Present your analysis in a structured format, perhaps using a table or bullet points for clarity.
            """,
            'key_findings': """
            You are an efficient academic summarizer. Provide a consolidated summary of the key findings from all the research papers provided.
            - What are the major conclusions of each paper?
            - Are there any conflicting or corroborating findings among the papers?
            - What is the overall contribution of this collection of papers to the field?
            Please synthesize the information into a coherent summary.
            """,
            'future_work': """
            As a research strategist, your task is to extract all explicit and implicit suggestions for future work mentioned in these papers.
            - Collate the "future work" or "conclusion" sections.
            - Infer potential next steps based on the limitations discussed.
            - Group similar suggestions and present a clear, actionable list of potential research projects.
            """,
            'custom': """
            You are a helpful research assistant. Answer the user's question based on the content of the provided research papers.
            """
        }
        
        if analysis_type not in prompts:
            return jsonify({'error': 'Invalid analysis type'}), 400
        
        prompt = prompts[analysis_type]
        response = get_gemini_response(prompt, pdf_texts, custom_question)
        
        return jsonify({
            'response': response,
            'analysis_type': analysis_type,
            'custom_question': custom_question if analysis_type == 'custom' else None
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-text', methods=['POST'])
def analyze_text():
    """
    Analyze extracted text directly without file upload
    Accepts pre-extracted text from client-side PDF processing
    """
    data = request.get_json()

    # Validate required fields
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    pdf_texts = data.get('pdf_texts', [])
    analysis_type = data.get('analysis_type')
    custom_question = data.get('custom_question', '')
    file_metadata = data.get('file_metadata', [])

    # Validation
    if not pdf_texts or not isinstance(pdf_texts, list):
        return jsonify({'error': 'pdf_texts must be a non-empty array'}), 400

    if len(pdf_texts) > 5:
        return jsonify({'error': 'Maximum 5 documents allowed'}), 400

    if not analysis_type:
        return jsonify({'error': 'analysis_type is required'}), 400

    # Filter out empty texts
    valid_texts = [text.strip() for text in pdf_texts if text and text.strip()]

    if not valid_texts:
        return jsonify({'error': 'No valid text content found in provided documents'}), 400

    try:
        # Define prompts for different analysis types (same as original endpoint)
        prompts = {
            'research_gap': """
            You are a highly skilled research assistant. Based on the following research papers,
            analyze the collective body of work and identify the primary research gap.
            - What are the key unanswered questions?
            - Where does the current research fall short?
            - What is a logical next step or a new direction for future research in this area?
            Provide a concise summary of the gap.
            """,
            'methodology': """
            As an expert academic reviewer, compare and contrast the methodologies used in the provided research papers.
            - What are the main approaches taken in each paper?
            - What are the strengths and weaknesses of each methodology?
            - Are the methodologies appropriate for the research questions they aim to answer?
            Present your analysis in a structured format, perhaps using a table or bullet points for clarity.
            """,
            'key_findings': """
            You are an efficient academic summarizer. Provide a consolidated summary of the key findings from all the research papers provided.
            - What are the major conclusions of each paper?
            - Are there any conflicting or corroborating findings among the papers?
            - What is the overall contribution of this collection of papers to the field?
            Please synthesize the information into a coherent summary.
            """,
            'future_work': """
            As a research strategist, your task is to extract all explicit and implicit suggestions for future work mentioned in these papers.
            - Collate the "future work" or "conclusion" sections.
            - Infer potential next steps based on the limitations discussed.
            - Group similar suggestions and present a clear, actionable list of potential research projects.
            """,
            'custom': """
            You are a helpful research assistant. Answer the user's question based on the content of the provided research papers.
            """
        }

        if analysis_type not in prompts:
            return jsonify({'error': 'Invalid analysis type'}), 400

        prompt = prompts[analysis_type]
        response = get_gemini_response(prompt, valid_texts, custom_question)

        return jsonify({
            'response': response,
            'analysis_type': analysis_type,
            'custom_question': custom_question if analysis_type == 'custom' else None,
            'documents_processed': len(valid_texts),
            'file_metadata': file_metadata
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/files/<session_id>', methods=['GET'])
def get_uploaded_files(session_id):
    if session_id in uploaded_files_store:
        return jsonify({'files': uploaded_files_store[session_id]})
    else:
        return jsonify({'error': 'Session not found'}), 404

@app.route('/api/files/<session_id>', methods=['DELETE'])
def delete_session_files(session_id):
    if session_id in uploaded_files_store:
        # Delete files from disk
        session_dir = os.path.join(UPLOAD_FOLDER, session_id)
        shutil.rmtree(session_dir, ignore_errors=True)
        
        # Remove from store
        del uploaded_files_store[session_id]
        
        return jsonify({'message': 'Files deleted successfully'})
    else:
        return jsonify({'error': 'Session not found'}), 404

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'message': 'Research Buddy API is running',
        'features': {
            'file_upload': True,
            'text_analysis': True,
            'client_side_processing': True
        }
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)

