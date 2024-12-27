import os
import json
import random
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import openai
from difflib import SequenceMatcher
from datetime import datetime
import base64
import uuid

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
        # OpenAI Audio API
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
    if not game_sentence:
        return jsonify({"error": "No game sentences available"}), 500
    return jsonify({"game_sentence": game_sentence})

@app.route('/process', methods=['POST'])
def process():
    data = request.get_json()
    audio_data = data.get('audio')
    reference_sentence = data.get('reference')

    if not audio_data or not reference_sentence:
        return jsonify({"error": "Invalid data"}), 400

    # Decode base64 audio
    try:
        audio_bytes = base64.b64decode(audio_data.split(',')[1])
    except Exception as e:
        print(f"Audio Decoding Error: {e}")
        return jsonify({"error": "Invalid audio data"}), 400

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    audio_filename = f"audio_{uuid.uuid4().hex}.wav"
    audio_path = os.path.join("static", "audio", audio_filename)

    # Save audio file
    os.makedirs(os.path.dirname(audio_path), exist_ok=True)
    with open(audio_path, "wb") as f:
        f.write(audio_bytes)

    # STT
    whisper_text = transcribe_with_whisper(audio_path)
    if whisper_text is None:
        return jsonify({"error": "Transcription failed"}), 500

    # Compare
    whisper_score = compare_sentences(reference_sentence, whisper_text)

    scores = {
        "Whisper": whisper_score
    }

    # 점수 등급
    difficulty = ""
    if whisper_score > 90:
        difficulty = "초급"
    elif 70 < whisper_score <= 90:
        difficulty = "보통"
    else:
        difficulty = "고급"

    response = {
        "scores": scores,
        "difficulty": difficulty,
        "stt_text": whisper_text,  # 인식된 텍스트도 함께 반환
        "audio_path": f"/static/audio/{audio_filename}"  # 클라이언트에서 재생 가능하도록
    }

    return jsonify(response)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=os.getenv('FLASK_ENV') == 'development')
