// static/js/script.js

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
const retryBtn = document.getElementById('retry-btn');
const retryBtnResults = document.getElementById('retry-btn-results');

// 초기화
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    page.classList.add('active');
}

// 게임 준비 버튼 클릭 시
startGameBtn.addEventListener('click', () => {
    showPage(micTestPage);
});

// 마이크 테스트 버튼 클릭 시
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

// 마이크 테스트 함수
function startMicTest(stream) {
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function visualize() {
        analyser.getByteFrequencyData(dataArray);
        // 시각화 로직 추가 가능
        requestAnimationFrame(visualize);
    }

    visualize();

    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        // 마이크 테스트 녹음이 필요하지 않다면 생략 가능
        audioChunks = [];
    };

    // 마이크 테스트 후 바로 녹음 중지
    setTimeout(() => {
        mediaRecorder.stop();
        micStatus.innerText = "마이크 테스트 완료!";
        showPage(gameStartPage);
        startGameSequence();
    }, 3000); // 3초 후 테스트 완료
}

// 게임 시작 시퀀스
function startGameSequence() {
    // 게임 시작 이미지 표시
    gameStartImage.style.display = 'block';

    // 2초 후 이미지 숨기기 및 첫 라운드 시작
    setTimeout(() => {
        gameStartImage.style.display = 'none';
        startRound(currentRound);
    }, 2000);
}

// 라운드 시작 함수
function startRound(round) {
    if (round > totalRounds) {
        endGame();
        return;
    }

    showPage(roundPage);
    roundTitle.innerText = `라운드 ${round}`;
    gameStatus.innerText = '';

    // 카운트다운 시작 (5초)
    let countdown = 5;
    countdownDisplay.innerText = countdown;
    countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            countdownDisplay.innerText = countdown;
        } else {
            clearInterval(countdownInterval);
            countdownDisplay.innerText = '';
            showSentenceAndStartRecording();
        }
    }, 1000);
}

// 문장 표시 및 녹음 시작
function showSentenceAndStartRecording() {
    gameText.innerText = referenceSentence;
    gameStatus.innerText = "녹음 중...";

    // 녹음 시작
    startRecording();

    // 10초 후 자동으로 녹음 종료
    setTimeout(() => {
        stopRecording();
    }, 10000);
}

// 녹음 시작 함수
function startRecording() {
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
                    sendAudio(base64data);
                };
                audioChunks = [];
            };
        })
        .catch(error => {
            console.error('Error accessing media devices.', error);
            alert("마이크 접근에 실패했습니다.");
        });
}

// 녹음 중지 함수
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        gameStatus.innerText = "녹음 중지됨.";
    }
}

// 오디오 데이터 서버로 전송
function sendAudio(audioData) {
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
        const { scores, difficulty } = data;
        totalScore += scores.Whisper;
        displayRoundResult(scores.Whisper, difficulty);
        currentRound++;
        // 다음 라운드 시작
        setTimeout(() => {
            startRound(currentRound);
        }, 2000); // 2초 후 다음 라운드
    })
    .catch(error => {
        console.error('Error:', error);
        gameStatus.innerText = "오류 발생!";
    });
}

// 라운드 결과 표시
function displayRoundResult(score, difficulty) {
    // 라운드 결과를 실시간으로 보여주고 싶다면 추가 로직 필요
    console.log(`라운드 ${currentRound} 점수: ${score}%`);
}

// 게임 종료 함수
function endGame() {
    showPage(scorePage);
    totalScoreDisplay.innerText = totalScore.toFixed(2);
}

// 점수 제출 폼 처리
scoreForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const company = document.getElementById('company').value;
    const employeeId = document.getElementById('employee-id').value;
    const name = document.getElementById('name').value;

    // 제출 로직 (서버로 전송 등) 추가 가능
    alert(`회사명: ${company}\n사번: ${employeeId}\n이름: ${name}\n총 점수: ${totalScore.toFixed(2)}%`);

    // 결과 페이지로 이동
    showPage(resultsPage);
    difficultyDisplay.innerText = calculateDifficulty();
    whisperScoreDisplay.innerText = totalScore.toFixed(2);
});

// 난이도 계산 함수
function calculateDifficulty() {
    if (totalScore > 90) {
        return "초급";
    } else if (totalScore > 70) {
        return "보통";
    } else {
        return "고급";
    }
}

// 다시하기 버튼 클릭 시 초기화
retryBtn.addEventListener('click', () => {
    resetGame();
    showPage(landingPage);
});

retryBtnResults.addEventListener('click', () => {
    resetGame();
    showPage(landingPage);
});

// 게임 초기화 함수
function resetGame() {
    currentRound = 1;
    totalScore = 0;
    gameText.innerText = '';
    gameStatus.innerText = '';
    countdownDisplay.innerText = '';
    difficultyDisplay.innerText = '';
    whisperScoreDisplay.innerText = '';
}
