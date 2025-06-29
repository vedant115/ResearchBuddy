from dotenv import load_dotenv

load_dotenv()

import streamlit as st
import os
import fitz  # PyMuPDF
import google.generativeai as genai

# Configure the Gemini API
try:
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
except AttributeError as e:
    st.error("The GOOGLE_API_KEY environment variable is not set. Please set it in your .env file.")
    st.stop()


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

def extract_text_from_pdfs(uploaded_files):
    """
    Extracts text from a list of uploaded PDF files.
    """
    if not uploaded_files:
        raise FileNotFoundError("No files uploaded")

    pdf_texts = []
    for file in uploaded_files:
        try:
            # To read the file in memory, we use a BytesIO object
            file.seek(0)
            document = fitz.open(stream=file.read(), filetype="pdf")
            text_parts = [page.get_text() for page in document]
            pdf_texts.append(" ".join(text_parts))
        except Exception as e:
            st.error(f"Error reading {file.name}: {e}")
            continue # Skip to the next file if one is corrupted
    return pdf_texts

# --- Streamlit App ---

st.set_page_config(page_title="AI Research Paper Analyzer", layout="wide")

st.title("🔬 AI Research Paper Analyzer")
st.subheader("Analyze multiple research papers to uncover insights with Gemini AI")

# --- Sidebar for Uploads and Options ---
with st.sidebar:
    st.header("Upload & Configure")
    # Restriction on the number of papers
    st.warning("You can upload up to 5 research papers for analysis with the free tier of Gemini.")
    uploaded_files = st.file_uploader(
        "Upload your Research Papers (PDF)...",
        type=["pdf"],
        accept_multiple_files=True
    )

    if uploaded_files:
        if len(uploaded_files) > 5:
            st.error("Please upload a maximum of 5 files.")
            uploaded_files = uploaded_files[:5] # Limit to the first 5 files

        st.success(f"{len(uploaded_files)} paper(s) uploaded successfully!")
        for file in uploaded_files:
            st.write(f"- {file.name}")

# Initialize session state for responses
if 'responses' not in st.session_state:
    st.session_state.responses = []

# --- Main Analysis Area ---
if uploaded_files:
    st.header("Analysis Prompts")

    # Pre-defined questions
    st.subheader("Common Analysis Questions")
    col1, col2 = st.columns(2)

    with col1:
        if st.button("Identify the Research Gap", use_container_width=True):
            with st.spinner('Synthesizing information to find the research gap...'):
                extracted_texts = extract_text_from_pdfs(uploaded_files)
                prompt = """
                You are a highly skilled research assistant. Based on the following research papers,
                analyze the collective body of work and identify the primary research gap.
                - What are the key unanswered questions?
                - Where does the current research fall short?
                - What is a logical next step or a new direction for future research in this area?
                Provide a concise summary of the gap.
                """
                response = get_gemini_response(prompt, extracted_texts)
                # Add response to session state
                st.session_state.responses.append({
                    'title': 'Research Gap Analysis',
                    'content': response
                })

        if st.button("Compare Methodologies", use_container_width=True):
            with st.spinner('Comparing the methodologies used in the papers...'):
                extracted_texts = extract_text_from_pdfs(uploaded_files)
                prompt = """
                As an expert academic reviewer, compare and contrast the methodologies used in the provided research papers.
                - What are the main approaches taken in each paper?
                - What are the strengths and weaknesses of each methodology?
                - Are the methodologies appropriate for the research questions they aim to answer?
                Present your analysis in a structured format, perhaps using a table or bullet points for clarity.
                """
                response = get_gemini_response(prompt, extracted_texts)
                # Add response to session state
                st.session_state.responses.append({
                    'title': 'Methodology Comparison',
                    'content': response
                })

    with col2:
        if st.button("Summarize Key Findings", use_container_width=True):
            with st.spinner('Summarizing the key findings from all papers...'):
                extracted_texts = extract_text_from_pdfs(uploaded_files)
                prompt = """
                You are an efficient academic summarizer. Provide a consolidated summary of the key findings from all the research papers provided.
                - What are the major conclusions of each paper?
                - Are there any conflicting or corroborating findings among the papers?
                - What is the overall contribution of this collection of papers to the field?
                Please synthesize the information into a coherent summary.
                """
                response = get_gemini_response(prompt, extracted_texts)
                # Add response to session state
                st.session_state.responses.append({
                    'title': 'Key Findings Summary',
                    'content': response
                })

        if st.button("Extract Future Work", use_container_width=True):
            with st.spinner('Extracting suggestions for future work...'):
                extracted_texts = extract_text_from_pdfs(uploaded_files)
                prompt = """
                As a research strategist, your task is to extract all explicit and implicit suggestions for future work mentioned in these papers.
                - Collate the "future work" or "conclusion" sections.
                - Infer potential next steps based on the limitations discussed.
                - Group similar suggestions and present a clear, actionable list of potential research projects.
                """
                response = get_gemini_response(prompt, extracted_texts)
                # Add response to session state
                st.session_state.responses.append({
                    'title': 'Future Work Suggestions',
                    'content': response
                })

    # Custom question text box
    st.subheader("Ask Your Own Question")
    user_question = st.text_area("Enter your specific question about the uploaded papers:", height=100)

    if st.button("Get Answer to My Question"):
        if not user_question:
            st.warning("Please enter a question to ask.")
        else:
            with st.spinner('Thinking...'):
                extracted_texts = extract_text_from_pdfs(uploaded_files)
                # This is a generic prompt that allows the user's question to guide the analysis
                generic_prompt = "You are a helpful research assistant. Answer the user's question based on the content of the provided research papers."
                response = get_gemini_response(generic_prompt, extracted_texts, user_question)
                # Add response to session state
                st.session_state.responses.append({
                    'title': f'Custom Query: {user_question[:50]}{"..." if len(user_question) > 50 else ""}',
                    'content': response
                })

    # --- Response Display Area ---
    if st.session_state.responses:
        st.markdown("---")
        st.header("📋 Analysis Results")

        # Add a clear button
        col_clear, col_empty = st.columns([1, 4])
        with col_clear:
            if st.button("Clear All Results", type="secondary"):
                st.session_state.responses = []
                st.rerun()

        # Display all responses
        for i, response_data in enumerate(st.session_state.responses):
            with st.expander(f"📊 {response_data['title']}", expanded=True):
                st.write(response_data['content'])

else:
    st.info("Please upload research papers in the sidebar to begin analysis.")


# --- Footer ---
st.markdown("---")
st.markdown("#### Built with Streamlit and Gemini AI")