import os
import json
import random
from flask import Flask, render_template, request, jsonify, session
from dotenv import load_dotenv
import openai
from difflib import SequenceMatcher
from datetime import datetime
import base64
import uuid
import time  # time.time() 사용

# 추가: requests 라이브러리
import requests

load_dotenv()

app = Flask(__name__)

# # Flask 세션 쿠키 설정
# app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = False  # HTTPS 환경에서만 작동할거면 true, 개발환경에서는 false

app.secret_key = "ANY_RANDOM_SECRET_KEY_FOR_SESSION"  # 세션을 사용하려면 반드시 secret_key 설정 (임의 문자열)

TOTAL_ROUNDS = 1

# Load API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise EnvironmentError("OpenAI API Key is not set. Please check your .env file.")
openai.api_key = OPENAI_API_KEY

# Load sentences
with open('sentences.json', 'r', encoding='utf-8') as f:
    sentences_data = json.load(f)

test_sentences = sentences_data.get("test_sentences", ["인생을 맛있게"])
game_sentences = sentences_data.get("game_sentences", [])

def generate_sentence(sentence_list):
    return random.choice(sentence_list) if sentence_list else ""




def normalize_text(txt):
    import re
    # 소문자 변환
    lowered = txt.lower()
    # 구두점 제거 (영문/한글 자모 제외)
    lowered = re.sub(r"[^\w가-힣\s]", "", lowered)
    # 사전 치환
    for standard, variants in SYNONYM_MAP.items():
        for v in variants:
            lowered = lowered.replace(v, standard)
    return lowered.strip()

def compare_sentences(reference, user_input):
    ref_norm = normalize_text(reference)
    user_norm = normalize_text(user_input)
    matcher = SequenceMatcher(None, ref_norm, user_norm)
    return matcher.ratio() * 100

def transcribe_with_whisper(audio_path):
    try:
        with open(audio_path, "rb") as audio_file:
            # 최신 버전(1.0.0 이상)에서의 Audio API
            transcript = openai.Audio.transcribe(
                model="whisper-1",
                file=audio_file
            )
        return transcript.get("text", "")  # dict 형태에서 text 키 추출
    except Exception as e:
        print(f"Whisper API Error: {e}")
        return None


@app.route('/')
def index():
    test_sentence = generate_sentence(test_sentences)
    return render_template('index.html', test_sentence=test_sentence)


# -----------------------------------------
#  게임 시작 시각 기록 → 세션에 저장
# -----------------------------------------
@app.route('/start_game', methods=['POST'])
def start_game():
    # 기존: 세션에 시작 시간 기록
    session["game_start_time"] = time.time()

    # 추가: 임시 난수 토큰 생성 & 세션에 저장
    token = uuid.uuid4().hex
    session["auth_token"] = token

    return jsonify({
        "status": "ok",
        "message": "Game started",
        "serverTime": session["game_start_time"],
        "authToken": token  # ← 클라이언트에게도 보내줌
    })

@app.route('/get_game_sentence', methods=['GET'])
def get_game_sentence():
    game_sentence = generate_sentence(game_sentences)
    if not game_sentence:
        return jsonify({"error": "No game sentences available"}), 500
    return jsonify({"game_sentence": game_sentence})


@app.route('/process', methods=['POST'])
def process():
    data = request.get_json() or {}
    
    # 1) authToken 검사
    client_token = data.get("authToken", "")
    if "auth_token" not in session or session["auth_token"] != client_token:
        return jsonify({"error": "Unauthorized"}), 401
    
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

    # Compare text
    whisper_score = compare_sentences(reference_sentence, whisper_text)

    # ★ Pitch/Volume 제거 → 여기서는 단순히 Whisper 점수만으로 총점 계산
    total_score = whisper_score
    total_score = min(max(total_score, 0), 100)  # 점수는 0~100 사이로 제한

    response = {
        "scores": {
            "Whisper": whisper_score,
            "RoundScore": total_score
        },
        "stt_text": whisper_text,
        "audio_path": f"/static/audio/{audio_filename}"
    }
    return jsonify(response)


# -----------------------------------------
#  부정행위(시간) 체크 함수
# -----------------------------------------
def check_cheating_time(threshold=30):
    """
    세션에 저장된 game_start_time과 현재 시각을 비교해서
    threshold 초(기본 30초) 미만이면 부정행위로 간주.
    """
    if "game_start_time" not in session:
        # 아예 시작점이 없다면 게임을 시작하지 않았다고 간주
        return True, "No game session found."
    start_time = session["game_start_time"]
    elapsed = time.time() - start_time
    if elapsed < threshold:
        return True, f"부정행위 감지: 플레이 경과 {elapsed:.2f}초 (기준 {threshold}초)"
    return False, None


def fetch_from_google_script(endpoint: str = "", payload: dict = None):
    try:
        script_url = (
            "https://script.google.com/macros/s/AKfycbz78NlpEqFxpekPfMq_qunSav9LNT6I1S80HlwkGxG1vRgjBM3fj4ajpmjMCUdFGGFmrA/exec"
            + endpoint
        )
        if payload:
            response = requests.post(script_url, json=payload)
        else:
            response = requests.get(script_url)

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Google Script Error: {response.text}")
    except Exception as e:
        raise Exception(f"Error communicating with Google Apps Script: {e}")


# -----------------------------------------
#  /save_to_sheet : 구글 시트 기록
# -----------------------------------------
@app.route('/save_to_sheet', methods=['POST'])
def save_to_sheet():
    # 1) 체크
    is_cheat, reason = check_cheating_time(threshold=30)

    # 2) 요청 데이터 파싱
    data = request.get_json() or {}
    if not data:
        return jsonify({"error": "No data provided"}), 400

    # 3) 부정행위 여부에 따라 status 필드
    if is_cheat:
        data["status"] = "부정행위"
    else:
        data["status"] = "정상"

    # 4) 구글 Apps Script로 POST
    try:
        response = fetch_from_google_script(payload=data)
        return jsonify(response), 200
    except Exception as e:
        print(f"Error in save_to_sheet: {e}")
        return jsonify({"error": str(e)}), 500


# -----------------------------------------
#  /save_to_local : ranking_data.json 기록
# -----------------------------------------
@app.route('/save_to_local', methods=['POST'])
def save_to_local():
    # 1) 체크
    is_cheat, reason = check_cheating_time(threshold=30)

    data = request.get_json() or {}
    if not data:
        return jsonify({"status": "error", "message": "No data provided"}), 400

    # 2) 부정행위 여부
    if is_cheat:
        data["status"] = "부정행위"
    else:
        data["status"] = "정상"

    try:
        company = data.get("company", "")
        employeeId = data.get("employeeId", "")
        name = data.get("name", "")
        newScore = float(data.get("totalScore", 0.0))

        local_file_path = "ranking_data.json"
        try:
            with open(local_file_path, "r", encoding="utf-8") as f:
                local_data = json.load(f)  # { "rankings": [...] }
        except FileNotFoundError:
            local_data = { "rankings": [] }

        if "rankings" not in local_data:
            local_data["rankings"] = []

        existingEntry = None
        for entry in local_data["rankings"]:
            # 회사 + 사번으로 식별
            if entry.get("company") == company and entry.get("employeeId") == employeeId:
                existingEntry = entry
                break

        currentTimeStr = datetime.now().strftime("%Y. M. d %p %I:%M:%S")  # 예: 2025. 1. 7 오후 5:53:38

        if existingEntry:
            oldScore = float(existingEntry.get("score", 0.0))
            existingEntry["score"] = max(oldScore, newScore)
            existingEntry["participationCount"] = existingEntry.get("participationCount", 1) + 1
            existingEntry["responseTime"] = currentTimeStr
            existingEntry["name"] = name
            existingEntry["status"] = data["status"]  # 부정행위 여부 반영
        else:
            newEntry = {
                "rank": 0,
                "company": company,
                "employeeId": employeeId,
                "name": name,
                "score": newScore,
                "participationCount": 1,
                "responseTime": currentTimeStr,
                "status": data["status"]  # "부정행위" or "정상"
            }
            local_data["rankings"].append(newEntry)

        with open(local_file_path, "w", encoding="utf-8") as f:
            json.dump(local_data, f, ensure_ascii=False, indent=2)

        return jsonify({
            "status": "success",
            "message": "Data saved/updated to local ranking_data.json",
            "cheatInfo": reason if is_cheat else ""
        }), 200

    except Exception as e:
        print(f"Error in save_to_local: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/get_rankings', methods=['GET'])
def get_rankings():
    try:
        local_file_path = "ranking_data.json"
        with open(local_file_path, "r", encoding="utf-8") as file:
            local_data = json.load(file)
        return jsonify(local_data), 200
    except Exception as local_error:
        print(f"Local file error: {local_error}")
        # 로컬 파일 실패하면 → Google Apps Script에서 불러오기
        try:
            return jsonify(fetch_from_google_script("?action=getRankings")), 200
        except Exception as script_error:
            return jsonify({"error": str(script_error)}), 500


@app.route('/test_local_rankings', methods=['GET'])
def test_local_rankings():
    try:
        local_file_path = "ranking_data.json"
        with open(local_file_path, "r", encoding="utf-8") as file:
            local_data = json.load(file)
        print("Local file data:", local_data)
        return jsonify(local_data), 200
    except Exception as e:
        print(f"Error loading local file: {e}")
        return jsonify({"error": str(e)}), 500



@app.route('/finish_game', methods=['POST'])
def finish_game():
    """
    1) 부정행위 체크 (세션 시간 or authToken)
    2) 프론트엔드에서 전달받은 roundScores[] 로 최종 평균 계산
    3) 랭킹/로컬 파일/구글 시트 저장
    4) 응답
    """
    # 간단한 세션 시간(부정행위) 체크
    is_cheat, reason = check_cheating_time(threshold=30)

    data = request.get_json() or {}
    client_token = data.get("authToken", "")
    if "auth_token" not in session or session["auth_token"] != client_token:
        return jsonify({"error": "Unauthorized"}), 401

    if not data:
        return jsonify({"error": "No data provided"}), 400

    company = data.get("company", "")
    employeeId = data.get("employeeId", "")
    name = data.get("name", "")
    # ★ 클라이언트에서 roundScores 배열 통째로 보내도록
    round_scores = data.get("roundScores", [])

    if not isinstance(round_scores, list) or len(round_scores) == 0:
        return jsonify({"error": "roundScores is empty or invalid"}), 400

    # 2) 최종점수(서버 기준)
    avg_score = sum(round_scores) / len(round_scores)
    final_score = round(avg_score)

    # 3) 랭킹 저장 (로컬 + 구글)
    status_value = "부정행위" if is_cheat else "정상"

    # --- (A) save to local
    try:
        local_file_path = "ranking_data.json"
        try:
            with open(local_file_path, "r", encoding="utf-8") as f:
                local_data = json.load(f)
        except FileNotFoundError:
            local_data = {"rankings": []}

        if "rankings" not in local_data:
            local_data["rankings"] = []

        existingEntry = None
        for entry in local_data["rankings"]:
            if entry.get("company") == company and entry.get("employeeId") == employeeId:
                existingEntry = entry
                break

        currentTimeStr = datetime.now().strftime("%Y. M. d %p %I:%M:%S")
        if existingEntry:
            oldScore = float(existingEntry.get("score", 0.0))
            existingEntry["score"] = max(oldScore, final_score)
            existingEntry["participationCount"] = existingEntry.get("participationCount", 1) + 1
            existingEntry["responseTime"] = currentTimeStr
            existingEntry["name"] = name
            existingEntry["status"] = status_value
        else:
            newEntry = {
                "rank": 0,
                "company": company,
                "employeeId": employeeId,
                "name": name,
                "score": final_score,
                "participationCount": 1,
                "responseTime": currentTimeStr,
                "status": status_value
            }
            local_data["rankings"].append(newEntry)

        with open(local_file_path, "w", encoding="utf-8") as f:
            json.dump(local_data, f, ensure_ascii=False, indent=2)

        local_response = {
            "status": "success",
            "message": "Data saved/updated to local ranking_data.json",
            "cheatInfo": reason if is_cheat else ""
        }
    except Exception as e:
        print(f"Error saving to local: {e}")
        local_response = {"status": "error", "message": str(e)}

    # --- (B) save to Google
    try:
        payload_for_sheet = {
            "company": company,
            "employeeId": employeeId,
            "name": name,
            "totalScore": final_score,
            "time": datetime.now().isoformat(),
            "status": status_value
        }
        response_sheet = fetch_from_google_script(payload=payload_for_sheet)
        sheet_response = response_sheet
    except Exception as e:
        print(f"Error saving to Google Sheet: {e}")
        sheet_response = {"status": "error", "message": str(e)}

    # 토큰 폐기 (원하면)
    session.pop("auth_token", None)
    session.pop("auth_token_expiry", None)
    session.pop("game_start_time", None)

    return jsonify({
        "finalScore": final_score,
        "localResult": local_response,
        "sheetResult": sheet_response
    }), 200


@app.route('/mic_test', methods=['POST'])
def mic_test():
    """
    마이크 테스트 전용 라우트.
    - authToken 없이
    - 세션 round_scores 등에 기록하지 않음
    """
    data = request.get_json() or {}
    audio_data = data.get('audio')
    reference_sentence = data.get('reference')

    if not audio_data or not reference_sentence:
        return jsonify({"error": "Invalid data"}), 400

    # 1) base64 디코딩
    try:
        audio_bytes = base64.b64decode(audio_data.split(',')[1])
    except Exception as e:
        print(f"Audio Decoding Error: {e}")
        return jsonify({"error": "Invalid audio data"}), 400

    # 2) 파일 저장
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    audio_filename = f"micTest_{uuid.uuid4().hex}.wav"
    audio_path = os.path.join("static", "audio", audio_filename)

    os.makedirs(os.path.dirname(audio_path), exist_ok=True)
    with open(audio_path, "wb") as f:
        f.write(audio_bytes)

    # 3) STT
    whisper_text = transcribe_with_whisper(audio_path)
    if whisper_text is None:
        return jsonify({"error": "Transcription failed"}), 500

    # 4) (필요시) 유사도 비교
    whisper_score = compare_sentences(reference_sentence, whisper_text)

    # 5) 응답 (세션엔 기록X)
    return jsonify({
        "scores": {
            "Whisper": whisper_score
        },
        "stt_text": whisper_text,
        "audio_path": f"/static/audio/{audio_filename}"
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=os.getenv('FLASK_ENV') == 'development')
