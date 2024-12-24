# app.py

import os
import json
import random
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import openai
from google.cloud import speech_v1p1beta1 as speech
import azure.cognitiveservices.speech as speechsdk
from difflib import SequenceMatcher

load_dotenv()

app = Flask(__name__)

# Load API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION")

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

def transcribe_with_google(audio_path):
    client = speech.SpeechClient.from_service_account_json(GOOGLE_APPLICATION_CREDENTIALS)
    with open(audio_path, "rb") as audio_file:
        content = audio_file.read()
    audio = speech.RecognitionAudio(content=content)
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        language_code="ko-KR",
    )
    response = client.recognize(config=config, audio=audio)
    transcripts = [result.alternatives[0].transcript for result in response.results]
    return " ".join(transcripts)

def transcribe_with_azure(audio_path):
    speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
    audio_input = speechsdk.AudioConfig(filename=audio_path)
    speech_recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, language="ko-KR", audio_config=audio_input)
    result = speech_recognizer.recognize_once()
    if result.reason == speechsdk.ResultReason.RecognizedSpeech:
        return result.text
    else:
        return ""

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

    # Transcribe using Google
    google_text = transcribe_with_google(audio_path)

    # Transcribe using Azure
    azure_text = transcribe_with_azure(audio_path)

    # Compare with reference
    whisper_score = compare_sentences(reference_sentence, whisper_text)
    google_score = compare_sentences(reference_sentence, google_text)
    azure_score = compare_sentences(reference_sentence, azure_text)

    # Determine difficulty based on scores
    scores = {
        "Whisper": whisper_score,
        "Google": google_score,
        "Azure": azure_score
    }

    # Determine difficulty level
    # Assume Whisper is best, Google is moderate, Azure is challenging
    difficulty = ""
    if whisper_score > google_score and whisper_score > azure_score:
        difficulty = "초급"
    elif google_score > whisper_score and google_score > azure_score:
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
