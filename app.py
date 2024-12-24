# app.py

import os
import json
import random
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import openai
from difflib import SequenceMatcher
from datetime import datetime
import base64

load_dotenv()

app = Flask(__name__)

# Load API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Set OpenAI API Key
openai.api_key = OPENAI_API_KEY

# Load sentences
with open('sentences.json', 'r', encoding='utf-8') as f:
    sentences_data = json.load(f)

test_sentences = sentences_data.get("test_sentences", ["인생을 맛있게"])
game_sentences = sentences_data.get("game_sentences", [])

def generate_sentence(sentence_list):
    return random.choice(sentence_list) if sentence_list else ""

def compare_sentences(reference, user_input):
    matcher = SequenceMatcher(None, reference, user_input)
    return matcher.ratio() * 100  # Return similarity percentage

def transcribe_with_whisper(audio_path):
    try:
        transcript = openai.Audio.transcribe("whisper-1", open(audio_path, "rb"))
        return transcript['text']
    except Exception as e:
        print(f"Whisper API Error: {e}")
        return None

@app.route('/')
def index():
    test_sentence = generate_sentence(test_sentences)
    return render_template('index.html', test_sentence=test_sentence)

@app.route('/get_game_sentence', methods=['GET'])
def get_game_sentence():
    game_sentence = generate_sentence(game_sentences)
    return jsonify({"game_sentence": game_sentence})

@app.route('/process', methods=['POST'])
def process():
    data = request.get_json()
    audio_data = data.get('audio')  # Base64 encoded audio
    reference_sentence = data.get('reference')

    if not audio_data or not reference_sentence:
        return jsonify({"error": "Invalid data"}), 400

    # Save audio data to a file
    try:
        audio_bytes = base64.b64decode(audio_data.split(',')[1])
    except Exception as e:
        print(f"Audio Decoding Error: {e}")
        return jsonify({"error": "Invalid audio data"}), 400

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    audio_filename = f"audio_{timestamp}.wav"
    audio_path = os.path.join("static", "audio", audio_filename)

    # Ensure the directory exists
    os.makedirs(os.path.dirname(audio_path), exist_ok=True)

    with open(audio_path, "wb") as f:
        f.write(audio_bytes)

    # Transcribe using Whisper
    whisper_text = transcribe_with_whisper(audio_path)
    if whisper_text is None:
        return jsonify({"error": "Transcription failed"}), 500

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
    app.run(host='0.0.0.0', port=5000, debug=False)
