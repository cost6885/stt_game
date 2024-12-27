// static/js/script.js

let mediaRecorder;
let audioChunks = [];
let currentRound = 1;
let totalScore = 0;
const totalRounds = 3;
let countdownInterval;
let micTestPassed = false;

const requiredTestSentence = typeof testSentence !== 'undefined' ? testSentence : "인생을 맛있게";

// 페이지 요소
const landingPage = document.getElementById('landing-page');
const micTestPage = document.getElementById('mic-test-page');
const gameStartPage = document.getElementById('game-start-page');
const roundPage = document.getElementById('round-page');
const roundFeedbackPage = document.getElementById('round-feedback-page');
const scorePage = document.getElementById('score-page');
const resultsPage = document.getElementById('results-page');

const startGameBtn = document.getElementById('start-game-btn');
const testMicBtn = document.getElementById('test-mic-btn');
const micStatus = document.getElementById('mic-status');
const gameStartImage = document.getElementById('game-start-image');
const roundTitle = document.getElementById('round-title');
const countdownDisplay = document.getElementById('countdown');
const gameText = document.getElementById('game-text');
const gameStatus = document.getElementById('game-status');
const totalScoreDisplay = document.getElementById('total-score');
const difficultyDisplay = document.getElementById('difficulty');
const whisperScoreDisplay = document.getElementById('whisper-score');

// 새로 추가된 피드백 페이지 요소
const roundFeedbackPageEl = document.getElementById('round-feedback-page');
const recordedAudioEl = document.getElementById('recorded-audio');
const originalTextEl = document.getElementById('original-text');
const recognizedTextEl = document.getElementById('recognized-text');
const scoreFeedbackTextEl = document.getElementById('score-feedback-text');
const nextRoundBtn = document.getElementById('next-round-btn');

const scoreForm = document.getElementById('score-form');

// 초기화 함수: 하나의 페이지만 active
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    page.classList.add('active');
}

// 게임 준비 버튼
startGameBtn.addEventListener('click', () => {
    showPage(micTestPage);
});

// 마이크 테스트 버튼
testMicBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStatus.innerText = "마이크 연결 성공! 문장을 말해보세요...";
        startMicTest(stream);
    } catch (error) {
        console.error('Error accessing media devices.', error);
        alert("마이크 접근에 실패했습니다. 브라우저에서 마이크 권한을 허용했는지 확인해주세요.");
    }
});

// 마이크 테스트 (5초)
function startMicTest(stream) {
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();
    audioChunks = [];

    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { 'type': 'audio/wav; codecs=PCM' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
            const base64data = reader.result;
            sendAudioForTest(base64data, requiredTestSentence);
        };
    };

    // 5초 후 마이크 테스트 종료
    setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }, 5000);
}

// 마이크 테스트 문장 전송
function sendAudioForTest(audioData, referenceSentence) {
    fetch('/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: audioData, reference: referenceSentence })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.error('Error:', data.error);
            micStatus.innerText = "마이크 테스트 실패!";
            alert("마이크 테스트 실패!\n오류 메시지: " + data.error);
            micTestPassed = false;
            return;
        }
        const { scores, difficulty } = data;
        if (!scores || typeof scores.Whisper !== 'number') {
            micStatus.innerText = "마이크 테스트 실패!";
            alert("마이크 테스트 결과가 올바르지 않습니다. 다시 시도해주세요.");
            micTestPassed = false;
            return;
        }
        if (scores.Whisper > 90) {
            micStatus.innerText = "마이크 테스트 성공!";
            alert(`마이크 테스트에 성공했습니다!\n(점수: ${scores.Whisper.toFixed(2)}%)`);
            micTestPassed = true;
            showPage(gameStartPage);
            startGameSequence();
        } else {
            micStatus.innerText = "마이크 테스트 실패!";
            alert(`문구를 정확히 말하지 못했습니다.\n점수: ${scores.Whisper.toFixed(2)}%\n다시 시도하세요.`);
            micTestPassed = false;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        micStatus.innerText = "마이크 테스트 실패! [네트워크/서버 오류]";
        alert(`마이크 테스트에 실패했습니다.\n오류 메시지: ${error}`);
        micTestPassed = false;
    });
}

// 게임 시작 시퀀스
function startGameSequence() {
    if (!micTestPassed) {
        alert("마이크 테스트를 통과해야 게임을 시작할 수 있습니다.");
        showPage(micTestPage);
        return;
    }
    gameStartImage.style.display = 'block';
    setTimeout(() => {
        gameStartImage.style.display = 'none';
        currentRound = 1;
        totalScore = 0;
        startRound(currentRound);
    }, 2000);
}

// 라운드 시작
function startRound(round) {
    if (!micTestPassed) {
        alert("마이크 테스트를 통과해야 게임을 진행할 수 있습니다.");
        showPage(micTestPage);
        return;
    }
    if (round > totalRounds) {
        endGame();
        return;
    }
    showPage(roundPage);
    roundTitle.innerText = `라운드 ${round}`;
    gameStatus.innerText = '';
    gameText.classList.add('hidden'); // 문장 숨김

    let countdown = 5;
    countdownDisplay.innerText = countdown;
    countdownInterval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            countdownDisplay.innerText = '';
            fetchGameSentenceAndStartRecording();
        } else {
            countdownDisplay.innerText = countdown;
        }
    }, 1000);
}

// 게임 문장 가져오기 + 녹음
function fetchGameSentenceAndStartRecording() {
    fetch('/get_game_sentence')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error:', data.error);
                alert("게임 문장 가져오기 실패!\n오류 메시지: " + data.error);
                handleTranscriptionFail();
                return;
            }
            const gameSentence = data.game_sentence;
            if (!gameSentence) {
                alert("게임 문장이 비어있습니다.");
                handleTranscriptionFail();
                return;
            }
            gameText.innerText = gameSentence;
            gameText.classList.remove('hidden'); 
            gameStatus.innerText = "녹음 중...";
            startRecording(gameSentence);
        })
        .catch(error => {
            console.error('Error fetching game sentence:', error);
            alert(`게임 문장 가져오기 실패!\n오류 메시지: ${error}`);
            handleTranscriptionFail();
        });
}

function startRecording(referenceSentence) {
    audioChunks = [];
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { 'type': 'audio/wav; codecs=PCM' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64data = reader.result;
                    sendAudio(base64data, referenceSentence);
                };
                audioChunks = [];
            };

            // 10초 후 녹음 종료
            setTimeout(() => {
                stopRecording();
            }, 10000);
        })
        .catch(error => {
            console.error('Error accessing media devices.', error);
            alert(`녹음 실패!\n오류: ${error}`);
            handleTranscriptionFail();
        });
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        gameStatus.innerText = "녹음 중지됨.";
    }
}

// 서버로 오디오 전송
function sendAudio(audioData, referenceSentence) {
    fetch('/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            audio: audioData,
            reference: referenceSentence
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.error('Error:', data.error);
            alert(`STT 변환 실패!\n오류 메시지: ${data.error}`);
            handleTranscriptionFail();
            return;
        }
        const { scores, difficulty, stt_text, audio_path } = data;
        if (!scores || typeof scores.Whisper !== 'number' || !stt_text) {
            alert("STT 변환 실패: 데이터가 유효하지 않습니다.");
            handleTranscriptionFail();
            return;
        }
        const whisperScore = scores.Whisper;
        console.log(`라운드 ${currentRound} 점수: ${whisperScore}%`);
        totalScore += whisperScore;

        // 라운드 피드백 페이지로 이동 (음성 재생, 인식 결과 표시 등)
        showRoundFeedback(referenceSentence, stt_text, whisperScore, audio_path);
    })
    .catch(error => {
        console.error('Error:', error);
        alert(`STT 변환 실패!\n네트워크 또는 서버 오류.\n오류 메시지: ${error}`);
        handleTranscriptionFail();
    });
}

// 라운드 피드백 표시
function showRoundFeedback(reference, recognized, score, audioPath) {
    showPage(roundFeedbackPage);

    // 오디오 재생 설정
    recordedAudioEl.src = audioPath; // 서버에서 반환된 오디오 파일 경로

    // 원문 vs 인식문 비교 → 빨간색 표시
    originalTextEl.innerHTML = reference;
    recognizedTextEl.innerHTML = highlightDifferences(reference, recognized);

    // GOOD / NORMAL / BAD 판단
    let feedbackClass = "bad";
    let feedbackText = "BAD";
    if (score > 90) {
        feedbackClass = "good";
        feedbackText = "GOOD";
    } else if (score > 70) {
        feedbackClass = "normal";
        feedbackText = "NORMAL";
    }

    scoreFeedbackTextEl.className = "score-feedback " + feedbackClass;
    scoreFeedbackTextEl.textContent = `${feedbackText} ( ${score.toFixed(2)}% )`;
}

// 다음 라운드 버튼 클릭 시
nextRoundBtn.addEventListener('click', () => {
    currentRound++;
    if (currentRound > totalRounds) {
        endGame();
    } else {
        startRound(currentRound);
    }
});

// Transcription 실패 시 0점 처리 후 다음 라운드
function handleTranscriptionFail() {
    console.warn("Transcription failed, 0점 처리 후 다음 라운드로 이동");
    currentRound++;
    setTimeout(() => {
        if (currentRound > totalRounds) {
            endGame();
        } else {
            startRound(currentRound);
        }
    }, 1000); // 1초 후 다음 라운드
}

// 게임 종료
function endGame() {
    showPage(scorePage);
    totalScoreDisplay.innerText = totalScore.toFixed(2);
}

// 점수 폼 제출
scoreForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const company = document.getElementById('company').value;
    const employeeId = document.getElementById('employee-id').value;
    const name = document.getElementById('name').value;

    alert(`회사명: ${company}\n사번: ${employeeId}\n이름: ${name}\n총 점수: ${totalScore.toFixed(2)}%`);

    showPage(resultsPage);
    difficultyDisplay.innerText = calculateDifficulty();
    whisperScoreDisplay.innerText = totalScore.toFixed(2);
});

function calculateDifficulty() {
    const averageScore = totalScore / totalRounds;
    if (averageScore > 90) {
        return "초급";
    } else if (averageScore > 70) {
        return "보통";
    } else {
        return "고급";
    }
}

function resetGame() {
    currentRound = 1;
    totalScore = 0;
    countdownDisplay.innerText = '';
    gameText.innerText = '';
    gameText.classList.add('hidden');
    gameStatus.innerText = '';
    difficultyDisplay.innerText = '';
    whisperScoreDisplay.innerText = '';
    document.getElementById('total-score').innerText = '0';
    document.getElementById('company').value = '';
    document.getElementById('employee-id').value = '';
    document.getElementById('name').value = '';
    micStatus.innerText = '';
    micTestPassed = false;
}

// 라운드, 결과 페이지에서 "다시하기" 클릭 시 → landingPage
retryBtnResults.addEventListener('click', () => {
    resetGame();
    showPage(landingPage);
});

/** 
 * 원문 vs 인식문을 비교해, 다른 부분은 빨간색으로 표시
 * 간단한 방법: 두 문장을 글자 단위로 비교
 * (더 정교하게 단어 단위, 공백/마침표 처리 등 가능)
 */
function highlightDifferences(original, recognized) {
    const maxLen = Math.max(original.length, recognized.length);
    let resultHtml = "";

    for (let i = 0; i < maxLen; i++) {
        const oChar = original[i] || "";
        const rChar = recognized[i] || "";
        if (oChar === rChar) {
            // 같으면 그대로 표시
            resultHtml += rChar;
        } else {
            // 다르면 빨간색 처리
            if (rChar) {
                resultHtml += `<span class="mismatch">${rChar}</span>`;
            }
        }
    }
    return resultHtml;
}
