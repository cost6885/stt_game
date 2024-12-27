
let mediaRecorder;
let audioChunks = [];
let currentRound = 1;
let totalScore = 0;
const totalRounds = 3;
let countdownInterval;

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

// 마이크 테스트 문구 (index.html에서 전달)
const testSentence = typeof testSentence !== 'undefined' ? testSentence : "인생을 맛있게";

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
        micStatus.innerText = "마이크 연결 성공!";
        startMicTest(stream);
    } catch (error) {
        console.error('Error accessing media devices.', error);
        alert("마이크 접근에 실패했습니다.");
    }
});

// 마이크 테스트 (3초)
function startMicTest(stream) {
    micStatus.innerText = "마이크 테스트 중...";
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();

    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        audioChunks = [];
        micStatus.innerText = "마이크 테스트 완료!";
        showPage(gameStartPage);
        startGameSequence();
    };

    // 3초 후 마이크 테스트 종료
    setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }, 3000);
}

// 게임 시작
function startGameSequence() {
    gameStartImage.style.display = 'block';

    // 2초 후 다음 단계
    setTimeout(() => {
        gameStartImage.style.display = 'none';
        startRound(currentRound);
    }, 2000);
}

// 라운드 시작
function startRound(round) {
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

// 게임 문장 가져오기
function fetchGameSentenceAndStartRecording() {
    fetch('/get_game_sentence')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error:', data.error);
                alert("게임 문장 가져오기 실패!");
                return;
            }
            const gameSentence = data.game_sentence;
            // 문장 표시
            gameText.innerText = gameSentence;
            gameText.classList.remove('hidden'); // 문장 표시
            gameStatus.innerText = "녹음 중...";
            startRecording(gameSentence);
        })
        .catch(error => {
            console.error('Error fetching game sentence:', error);
            alert("게임 문장 가져오기 실패!");
            gameStatus.innerText = "오류 발생!";
        });
}

// 녹음 시작
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
            alert("마이크 접근에 실패했습니다.");
            gameStatus.innerText = "오류 발생!";
        });
}

// 녹음 중지
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
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            audio: audioData,
            reference: referenceSentence
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.error('Error:', data.error);
            gameStatus.innerText = "오류 발생!";
            return;
        }
        const { scores, difficulty } = data;
        if (scores && typeof scores.Whisper === 'number') {
            totalScore += scores.Whisper;
        }
        console.log(`라운드 ${currentRound} 점수: ${scores.Whisper}%`);
        currentRound++;

        // 2초 후 다음 라운드
        setTimeout(() => {
            startRound(currentRound);
        }, 2000);
    })
    .catch(error => {
        console.error('Error:', error);
        gameStatus.innerText = "오류 발생!";
    });
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

// 난이도 계산
function calculateDifficulty() {
    // 전체 라운드 평균 점수로 난이도 계산 (예시)
    const averageScore = totalScore / totalRounds;
    if (averageScore > 90) {
        return "초급";
    } else if (averageScore > 70) {
        return "보통";
    } else {
        return "고급";
    }
}

// "다시하기" 로직
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
    // 입력 폼 초기화
    document.getElementById('company').value = '';
    document.getElementById('employee-id').value = '';
    document.getElementById('name').value = '';
}

// 결과 페이지의 "다시하기" 버튼
document.getElementById('retry-btn-results').addEventListener('click', () => {
    resetGame();
    showPage(landingPage);
});

