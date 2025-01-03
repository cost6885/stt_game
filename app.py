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

# 추가: requests 라이브러리
import requests

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
        with open(audio_path, "rb") as audio_file:
            # 최신 버전(1.0.0 이상)에서의 Audio API
            transcript = openai.Audio.transcribe(
                model="whisper-1",
                file=audio_file
            )
        # transcript는 dict 형태를 반환한다고 가정
        return transcript.get("text", "")
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

# -----------------------------------------------------------------------------
# ★ 추가된 부분: /save_to_sheet 라우트
#  - 브라우저(script.js)에서 fetch('/save_to_sheet', {...}) 로 전송
#  - Flask가 Google Apps Script 웹 앱에 POST → 시트 기록
# -----------------------------------------------------------------------------
@app.route('/save_to_sheet', methods=['POST'])
def save_to_sheet():
    try:
        # 1) 클라이언트에서 보내 준 JSON
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        # 2) Google Apps Script 웹 앱 URL
        #    아래 URL은 예시이며, 실제 발급받은 exec URL로 교체
        script_url = "https://script.google.com/macros/s/AKfycbz78NlpEqFxpekPfMq_qunSav9LNT6I1S80HlwkGxG1vRgjBM3fj4ajpmjMCUdFGGFmrA/exec"

        # 3) Flask -> Apps Script로 POST
        #    requests 라이브러리 사용
        response = requests.post(script_url, json=data)

        # 4) Apps Script 응답
        if response.status_code == 200:
            # Apps Script에서 JSON을 반환한다고 가정
            return response.text, 200
        else:
            return jsonify({
                "error": "Apps Script returned error",
                "details": response.text
            }), response.status_code

    except Exception as e:
        print(f"Error in save_to_sheet: {e}")
        return jsonify({"error": str(e)}), 500

# -----------------------------------------------------------------------------

if __name__ == '__main__':
    # 배포 환경에 따라 포트, debug 설정
    app.run(host='0.0.0.0', port=5000, debug=os.getenv('FLASK_ENV') == 'development')
