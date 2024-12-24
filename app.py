# app.py

import os
import json
import random
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import openai
from difflib import SequenceMatcher

load_dotenv()

app = Flask(__name__)

# Load API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Set OpenAI API Key
openai.api_key = OPENAI_API_KEY

# Load sentences
with open('sentences.json', 'r', encoding='utf-8') as f:
    sentences = json.load(f)

def generate_sentence():
    return random.choice(sentences)

def compare_sentences(reference, user_input):
    matcher = SequenceMatcher(None, reference, user_input)
    return matcher.ratio() * 100  # Return similarity percentage

def transcribe_with_whisper(audio_path):
    # Whisper API는 OpenAI의 API로 가정
    audio_file = open(audio_path, "rb")
    transcript = openai.Audio.transcribe("whisper-1", audio_file)
    return transcript['text']

@app.route('/')
def index():
    sentence = generate_sentence()
    return render_template('index.html', sentence=sentence)

@app.route('/process', methods=['POST'])
def process():
    data = request.get_json()
    audio_data = data.get('audio')  # Base64 encoded audio
    reference_sentence = data.get('reference')

    # Save audio data to a file
    import base64
    from datetime import datetime

    audio_bytes = base64.b64decode(audio_data.split(',')[1])
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    audio_filename = f"audio_{timestamp}.wav"
    audio_path = os.path.join("static", "audio", audio_filename)

    # Ensure the directory exists
    os.makedirs(os.path.dirname(audio_path), exist_ok=True)

    with open(audio_path, "wb") as f:
        f.write(audio_bytes)

    # Transcribe using Whisper
    whisper_text = transcribe_with_whisper(audio_path)

    # Compare with reference
    whisper_score = compare_sentences(reference_sentence, whisper_text)

    # Determine difficulty based on score
    scores = {
        "Whisper": whisper_score
    }

    # Determine difficulty level
    difficulty = ""
    if whisper_score > 90:
        difficulty = "초급"
    elif 70 < whisper_score <= 90:
        difficulty = "보통"
    else:
        difficulty = "고급"

    response = {
        "scores": scores,
        "difficulty": difficulty
    }

    return jsonify(response)

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=False)
