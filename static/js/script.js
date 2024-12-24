// static/js/script.js

document.addEventListener("DOMContentLoaded", function() {
    let currentPageIndex = 0;  // 현재 활성화된 페이지 인덱스
    const pages = document.querySelectorAll('.page'); // 모든 페이지 요소 선택
    
    // 첫 번째 페이지를 표시
    pages[currentPageIndex].classList.add('active');

    // 버튼 클릭 시 페이지 전환 (예시)
    document.querySelector('#next-button').addEventListener('click', function() {
        pages[currentPageIndex].classList.remove('active'); // 현재 페이지 숨기기
        currentPageIndex = (currentPageIndex + 1) % pages.length; // 다음 페이지로 이동
        pages[currentPageIndex].classList.add('active'); // 새로운 페이지 보이기
    });
});

let mediaRecorder;
let audioChunks = [];
let currentRound = 1;
let totalScore = 0;
const totalRounds = 3;
let countdownInterval;
let gameSentence = "";

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

// 페이지 초기화 함수: 하나의 페이지만 활성화
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
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();

    micStatus.innerText = "마이크 테스트 중...";

    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        // 만약 audioChunks에 데이터가 없으면 마이크 테스트 완료하지 않음
        if (audioChunks.length === 0) {
            micStatus.innerText = "입력이 감지되지 않았습니다. 다시 시도해주세요.";
        } else {
            micStatus.innerText = "마이크 테스트 완료!";
            showPage(gameStartPage);
            startGameSequence();
        }
    };

    // 마이크 테스트 녹음 3초 후 자동 중지
    setTimeout(() => {
        mediaRecorder.stop();
    }, 3000);
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
            fetchGameSentenceAndStartRecording();
        }
    }, 1000);
}

// 게임 문장 가져오기 및 녹음 시작
function fetchGameSentenceAndStartRecording() {
    fetch('/get_game_sentence')
        .then(response => response.json())
        .then(data => {
            gameSentence = data.game_sentence;
            if (!gameSentence) {
                gameStatus.innerText = "게임 문장이 없습니다.";
                return;
            }
            gameText.innerText = gameSentence;
            gameStatus.innerText = "녹음 중...";
            startRecording();
        })
        .catch(error => {
            console.error('Error fetching game sentence:', error);
            alert("게임 문장 가져오기 실패!");
            gameStatus.innerText = "오류 발생!";
        });
}

// 녹음 시작 함수
function startRecording() {
    audioChunks = [];
    let isRecording = false;

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
            isRecording = true;

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { 'type': 'audio/wav; codecs=PCM' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64data = reader.result;
                    sendAudio(base64data, gameSentence);
                };
                audioChunks = [];
            };

            // 타이머 설정 (10초 동안 녹음이 없으면 자동으로 실패)
            const timeout = setTimeout(() => {
                if (!isRecording || audioChunks.length === 0) {
                    gameStatus.innerText = "입력 없음! 다음 라운드로 넘어갑니다.";
                    stopRecording();
                    nextRound();
                }
            }, 10000); // 10초 후 자동으로 실패

            // 10초 후 자동으로 녹음 중지
            setTimeout(() => {
                stopRecording();
                clearTimeout(timeout); // 타임아웃 해제
            }, 10000); // 10초
        })
        .catch(error => {
            console.error('Error accessing media devices.', error);
            alert("마이크 접근에 실패했습니다.");
            gameStatus.innerText = "오류 발생!";
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
function sendAudio(audioData, referenceSentence) {
    fetch('/process', {
        method: 'POST',
        body: JSON.stringify({ audio_data: audioData, reference_sentence: referenceSentence }),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        processResult(data);
    })
    .catch(error => {
        console.error('Error sending audio:', error);
    });
}

// 게임 결과 처리 함수
function processResult(data) {
    const score = data.score;
    totalScore += score;
    totalScoreDisplay.innerText = totalScore;
    whisperScoreDisplay.innerText = score;
    
    nextRound();
}

// 라운드 종료 후 처리
function nextRound() {
    if (currentRound >= totalRounds) {
        endGame();
    } else {
        currentRound++;
        startRound(currentRound);
    }
}

// 게임 종료
function endGame() {
    showPage(scorePage);
    totalScoreDisplay.innerText = totalScore;
    difficultyDisplay.innerText = "쉬움"; // 난이도는 예시로 '쉬움'으로 설정
}

// 결과 페이지로 전환
retryBtnResults.addEventListener('click', () => {
    currentRound = 1;
    totalScore = 0;
    showPage(landingPage);
});
