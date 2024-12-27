// static/js/script.js

let mediaRecorder;
let audioChunks = [];
let currentRound = 1;
let totalScore = 0;
const totalRounds = 3;
let countdownInterval;
let micTestPassed = false;

// 기존 필드 or 문구
const requiredTestSentence = typeof testSentence !== 'undefined' ? testSentence : "인생을 맛있게";

// 페이지 요소
const landingPage = document.getElementById('landing-page');
const micTestPage = document.getElementById('mic-test-page');

// 게임 시작 페이지
const gameStartPage = document.getElementById('game-start-page');
gameStartPage.style.display = 'none';  // 초기에는 숨김

// 라운드 / 피드백
const roundPage = document.getElementById('round-page');
const roundFeedbackPage = document.getElementById('round-feedback-page');

// 폼 컨테이너
const formContainer = document.getElementById('formContainer');
const finalScoreDisplay = document.getElementById('final-score');

// 버튼 / 요소
const startGameBtn = document.getElementById('start-game-btn');
const testMicBtn = document.getElementById('test-mic-btn');
const micStatus = document.getElementById('mic-status');
const gameStartImage = document.getElementById('game-start-image');
const roundTitle = document.getElementById('round-title');
const countdownDisplay = document.getElementById('countdown');
const gameText = document.getElementById('game-text');
const gameStatus = document.getElementById('game-status');

// 라운드 피드백
const recordedAudioEl = document.getElementById('recorded-audio');
const originalTextEl = document.getElementById('original-text');
const recognizedTextEl = document.getElementById('recognized-text');
const scoreFeedbackTextEl = document.getElementById('score-feedback-text');
const nextRoundBtn = document.getElementById('next-round-btn');

/** 페이지 전환: 라운드, 피드백 전용 */
function showPage(page) {
    [landingPage, micTestPage, roundPage, roundFeedbackPage].forEach(p => p.classList.remove('active'));
    page.classList.add('active');
}

/** 폼 컨테이너 표시/숨김 */
function showFormContainer() {
    formContainer.style.display = "block";
}
function hideFormContainer() {
    formContainer.style.display = "none";
}

/** 시작 버튼 */
startGameBtn.addEventListener('click', () => {
    showPage(micTestPage);
});

/** 마이크 테스트 버튼 */
testMicBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStatus.innerText = "마이크 연결 성공! 문장을 말해보세요...";
        startMicTest(stream);
    } catch (error) {
        console.error('마이크 접근 실패:', error);
        micStatus.innerText = "마이크 접근 실패. 브라우저 권한 확인 요망.";
    }
});

/** 마이크 테스트 (5초) */
function startMicTest(stream) {
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();
    audioChunks = [];

    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav; codecs=PCM' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
            const base64data = reader.result;
            sendAudioForTest(base64data, requiredTestSentence);
        };
    };

    // 5초 후 자동 중지
    setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }, 5000);
}

/** 마이크 테스트 문장 전송 */
function sendAudioForTest(audioData, referenceSentence) {
    fetch('/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: audioData, reference: referenceSentence })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.error('마이크 테스트 실패:', data.error);
            micStatus.innerText = "마이크 테스트 실패: " + data.error;

            // (테스트 편의를 위해) 자동 우회
            micTestPassed = true;
            startGameSequence();
            return;
        }

        const { scores } = data;
        if (!scores || typeof scores.Whisper !== 'number') {
            micStatus.innerText = "마이크 테스트 실패. 결과 데이터 이상.";
            micTestPassed = false;
            return;
        }

        if (scores.Whisper > 90) {
            micStatus.innerText = "마이크 테스트 성공.";
            micTestPassed = true;
            startGameSequence();
        } else {
            micStatus.innerText = `정확 발화 실패. 점수: ${scores.Whisper.toFixed(2)}`;
            micTestPassed = false;
        }
    })
    .catch(error => {
        console.error('마이크 테스트 중 오류:', error);
        micStatus.innerText = "마이크 테스트 실패 (네트워크/서버 오류)";
        micTestPassed = false;
    });
}

/** 게임 시작 시퀀스 */
function startGameSequence() {
    if (!micTestPassed) {
        micStatus.innerText = "마이크 테스트를 통과해야 게임 시작 가능.";
        return;
    }
    // 게임 시작 페이지 (전면) 2초 표시
    gameStartPage.style.display = 'flex';
    setTimeout(() => {
        gameStartPage.style.display = 'none';
        currentRound = 1;
        totalScore = 0;
        showPage(roundPage);
        startRound(currentRound);
    }, 2000);
}

/** 라운드 시작 */
function startRound(round) {
    if (!micTestPassed) {
        micStatus.innerText = "마이크 테스트 통과 후 라운드 진행 가능.";
        return;
    }
    if (round > totalRounds) {
        endGame();
        return;
    }
    showPage(roundPage);
    roundTitle.innerText = `라운드 ${round}`;
    gameStatus.innerText = '';
    gameText.classList.add('hidden');

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

/** 게임 문장 + 녹음 */
function fetchGameSentenceAndStartRecording() {
    fetch('/get_game_sentence')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.warn('게임 문장 실패:', data.error);
                handleTranscriptionFail(); // 0점 처리
                return;
            }
            const gameSentence = data.game_sentence;
            if (!gameSentence) {
                console.warn('게임 문장이 비어있음');
                handleTranscriptionFail(); // 0점 처리
                return;
            }
            gameText.innerText = gameSentence;
            gameText.classList.remove('hidden');
            gameStatus.innerText = "녹음 중...";
            startRecording(gameSentence);
        })
        .catch(error => {
            console.error('게임 문장 오류:', error);
            handleTranscriptionFail(); // 0점 처리
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
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav; codecs=PCM' });
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
            console.error('녹음 접근 오류:', error);
            handleTranscriptionFail(); // 0점
        });
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        gameStatus.innerText = "녹음 중지됨.";
    }
}

/** STT 처리 */
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
            console.error('STT 변환 실패:', data.error);
            handleTranscriptionFail(); // 0점
            return;
        }
        const { scores, stt_text, audio_path } = data;
        if (!scores || typeof scores.Whisper !== 'number' || !stt_text) {
            console.warn('STT 결과 데이터 이상');
            handleTranscriptionFail(); // 0점
            return;
        }
        const whisperScore = scores.Whisper;
        console.log(`라운드 ${currentRound} 점수: ${whisperScore}%`);
        totalScore += whisperScore;

        // 라운드 피드백
        showRoundFeedback(referenceSentence, stt_text, whisperScore, audio_path);
    })
    .catch(error => {
        console.error('STT 변환 오류:', error);
        handleTranscriptionFail(); // 0점
    });
}

/** 라운드 피드백 표시 */
function showRoundFeedback(reference, recognized, score, audioPath) {
    // 라운드 페이지 숨기고 피드백 페이지 활성화
    roundPage.classList.remove('active');
    roundFeedbackPage.classList.add('active');

    // 오디오
    recordedAudioEl.src = audioPath || "";
    originalTextEl.innerHTML = reference;
    recognizedTextEl.innerHTML = highlightDifferences(reference, recognized);

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

/** "다음 라운드" 버튼 */
nextRoundBtn.addEventListener('click', () => {
    // 피드백 페이지 숨기고 다음 라운드
    roundFeedbackPage.classList.remove('active');
    currentRound++;
    if (currentRound > totalRounds) {
        endGame();
    } else {
        showPage(roundPage);
        startRound(currentRound);
    }
});

/** 오류 발생 시 0점 처리 & 피드백 페이지 표시 → 수동으로 "다음 라운드" 누르게 */
function handleTranscriptionFail() {
    console.warn("Transcription failed or no speech. 0점 처리.");
    // 현 라운드를 0점 처리
    const whisperScore = 0;
    // 토탈 점수 += 0
    // totalScore = totalScore + 0 -> 그대로
    // BAD 피드백
    showRoundFeedback("", "", whisperScore, "");
    // **주의**: 여기서 currentRound++ 하지 않음
}

/** 게임 종료 → formContainer로 이동하여 최종 점수 제출 */
function endGame() {
    document.getElementById('final-score').innerText = totalScore.toFixed(2);
    showFormContainer();
}

/** Differences 하이라이팅 */
function highlightDifferences(original, recognized) {
    const maxLen = Math.max(original.length, recognized.length);
    let resultHtml = "";
    for (let i = 0; i < maxLen; i++) {
        const oChar = original[i] || "";
        const rChar = recognized[i] || "";
        if (oChar === rChar) {
            resultHtml += rChar;
        } else {
            if (rChar) {
                resultHtml += `<span class="mismatch">${rChar}</span>`;
            }
        }
    }
    return resultHtml;
}

/** sendToGoogleSheets */
function sendToGoogleSheets() {
    let company = document.getElementById('company').value.trim();
    let employeeId = document.getElementById('employeeId').value.trim();
    let name = document.getElementById('name').value.trim();

    if (!company || !employeeId || !name) {
        console.warn("모든 정보를 입력해주세요!");
        return;
    }

    let data = {
        company,
        employeeId,
        name,
        totalScore: totalScore.toFixed(2),
        time: new Date().toLocaleString()
    };

    fetch('https://script.google.com/macros/s/AKfycbXYZ/exec', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        mode: 'cors'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
        return response.text();
    })
    .then(res => {
        console.log("응모 완료:", res);
        hideFormContainer();
    })
    .catch(error => {
        console.error("응모 실패:", error);
    });
}

/** "다시하기" */
function prapare() {
    hideFormContainer();
    resetGame();  
    showPage(landingPage);
}

/** resetGame */
function resetGame() {
    currentRound = 1;
    totalScore = 0;
    countdownDisplay.innerText = '';
    gameText.innerText = '';
    gameText.classList.add('hidden');
    gameStatus.innerText = '';
    micStatus.innerText = '';
    micTestPassed = false;

    document.getElementById('final-score').innerText = '0';
    document.getElementById('company').value = '';
    document.getElementById('employeeId').value = '';
    document.getElementById('name').value = '';
}
