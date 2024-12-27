// static/js/script.js

let mediaRecorder;
let audioChunks = [];
let currentRound = 1;
let totalScore = 0;
const totalRounds = 3;
let countdownInterval;
let micTestPassed = false;    // 마이크가 정상 작동 + 테스트 문구 정확 발화 확인
const requiredTestSentence = typeof testSentence !== 'undefined' ? testSentence : "인생을 맛있게";

// 페이지 요소
const landingPage = document.getElementById('landing-page');
const micTestPage = document.getElementById('mic-test-page');
const gameStartPage = document.getElementById('game-start-page');
const roundPage = document.getElementById('round-page');
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

const scoreForm = document.getElementById('score-form');
const retryBtnResults = document.getElementById('retry-btn-results');

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
        // 오디오 블롭 -> Base64
        const audioBlob = new Blob(audioChunks, { 'type': 'audio/wav; codecs=PCM' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
            const base64data = reader.result;
            // STT 전송 -> testSentence와 비교
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
            alert("마이크 테스트 실패!);
            micTestPassed = false;
            // 로직 테스트 용으로 삭제예정
            micTestPassed = false;            
            showPage(gameStartPage);
            startGameSequence();            
            return;
        }
        const { scores, difficulty } = data;
        if (!scores || typeof scores.Whisper !== 'number') {
            micStatus.innerText = "마이크 테스트 실패!";
            alert("마이크 테스트 결과가 올바르지 않습니다. 다시 시도해주세요.");
            micTestPassed = false;
            // 로직 테스트 용으로 삭제예정
            micTestPassed = false;            
            showPage(gameStartPage);
            startGameSequence();        
            return;
        }
        // 정확 발화 체크 (점수 기준 90% 이상 등)
        if (scores.Whisper > 90) {
            micStatus.innerText = "마이크 테스트 성공!";
            alert("마이크 테스트에 성공했습니다. 정확히 말했습니다!\n(점수: " + scores.Whisper.toFixed(2) + "%)");
            micTestPassed = true;
            // 테스트 통과 후 게임 시작 페이지
            showPage(gameStartPage);
            startGameSequence();
        } else {
            micStatus.innerText = "마이크 테스트 실패!";
            alert("문구를 정확히 말하지 못했습니다. + "%\n다시 시도하세요.");
            micTestPassed = false;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        micStatus.innerText = "마이크 테스트 실패! [네트워크/서버 오류]";
        alert("마이크 테스트에 실패했습니다.\n오류 메시지: " + error);
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

    // 2초 후 다음 단계
    setTimeout(() => {
        gameStartImage.style.display = 'none';
        currentRound = 1;    // 혹시 모르니 라운드 재설정
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
    gameText.classList.add('hidden'); // 문장 초기 숨김 처리

    // 5초 카운트다운
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

// 게임 문장 가져오기 및 녹음 시작
function fetchGameSentenceAndStartRecording() {
    fetch('/get_game_sentence')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error:', data.error);
                alert("게임 문장 가져오기 실패!\n오류 메시지: " + data.error);
                // 점수 0 처리 후 다음 라운드
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
            gameText.classList.remove('hidden'); // 문장 표시
            gameStatus.innerText = "녹음 중...";
            startRecording(gameSentence);
        })
        .catch(error => {
            console.error('Error fetching game sentence:', error);
            alert("게임 문장 가져오기 실패!\n오류 메시지: " + error);
            handleTranscriptionFail();
        });
}

// 녹음 시작 함수
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
            alert("녹음 실패!\n오류: " + error);
            handleTranscriptionFail();
        });
}

// 녹음 중지 함수
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
            alert("STT 변환 실패!\n오류 메시지: " + data.error);
            handleTranscriptionFail();
            return;
        }
        const { scores, difficulty } = data;
        if (!scores || typeof scores.Whisper !== 'number') {
            alert("STT 변환 실패: 점수 데이터가 유효하지 않습니다.");
            handleTranscriptionFail();
            return;
        }
        const whisperScore = scores.Whisper;
        console.log(`라운드 ${currentRound} 점수: ${whisperScore}%`);
        totalScore += whisperScore;
        currentRound++;
        setTimeout(() => {
            startRound(currentRound);
        }, 2000);
    })
    .catch(error => {
        console.error('Error:', error);
        alert("STT 변환 실패!\n네트워크 또는 서버 오류.\n오류 메시지: " + error);
        handleTranscriptionFail();
    });
}

// Transcription 실패 시 0점 처리 & 다음 라운드
function handleTranscriptionFail() {
    console.warn("Transcription failed, 0점 처리 후 다음 라운드 이동");
    currentRound++;
    setTimeout(() => {
        if (currentRound > totalRounds) {
            endGame();
        } else {
            startRound(currentRound);
        }
    }, 2000);
}

// 게임 종료
function endGame() {
    showPage(scorePage);
    document.getElementById('total-score').innerText = totalScore.toFixed(2);
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

// 다시하기 로직
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

retryBtnResults.addEventListener('click', () => {
    resetGame();
    showPage(landingPage);
});
