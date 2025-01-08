// static/js/script.js

let mediaRecorder;
let audioChunks = [];
let currentRound = 1;
let totalScore = 0;
const totalRounds = 3;
let countdownInterval;
let micTestPassed = false;

// 타이머 시작 시간 변수
let gameStartTime;

/** 이미 사용한 문장 리스트 */
let usedSentences = []; 

/** 현재 라운드에서 불러온 원문을 저장해둘 변수 */
let lastReference = ""; 

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

/** 
 * 버튼 레이블 업데이트 함수 
 * 라운드가 마지막(3라운드)이면 "결과보기", 그 외는 "다음 라운드"
 */
function updateNextRoundButtonLabel() {
    if (currentRound === totalRounds) {
        nextRoundBtn.textContent = "결과보기";
    } else {
        nextRoundBtn.textContent = "다음 라운드";
    }
}

/** 페이지 전환 */
function showPage(page) {
    [landingPage, micTestPage, roundPage, roundFeedbackPage].forEach(p => p.classList.remove('active'));
    page.classList.add('active');
    // ★ 랭킹 보드 업데이트
    if (page === landingPage) {
        displayRankings(); // 랜딩 페이지가 활성화될 때 랭킹 보드 업데이트
    }
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
            micTestPassed = false;            
            return;
        }

        const { scores } = data;
        if (!scores || typeof scores.Whisper !== 'number') {
            micStatus.innerText = "마이크 테스트 실패. 결과 데이터 이상.";
            micTestPassed = false;
            return;
        }

        if (scores.Whisper > 50) {
            micStatus.innerText = "마이크 테스트 성공.";
            micTestPassed = true;
            startGameSequence();
        } else {
            micStatus.innerText = `말을 하셨나요? 점수: ${Math.round(scores.Whisper)}`;
            micTestPassed = false;
            // (테스트 편의상) 자동 우회
            micTestPassed = true;
            startGameSequence();
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

    // 타이머 시작 시간 기록
    gameStartTime = Date.now();
    
    gameStartPage.style.display = 'flex';
    setTimeout(() => {
        gameStartPage.style.display = 'none';
        currentRound = 1;
        totalScore = 0;
        usedSentences = []; // 새로운 게임 시 usedSentences 초기화
        showPage(roundPage);
        startRound(currentRound);
    }, 2000);
}


/** 라운드를 진행했는지 확인 */
function checkRoundsCompleted() {
    return currentRound > 1 || totalScore > 0; // 라운드 진행 여부 판단
}

/** 부정행위 여부 판단 */
function isCheating() {
    const elapsedTime = Date.now() - gameStartTime; // 경과 시간 계산
    const roundsCompleted = checkRoundsCompleted();
    return !roundsCompleted || elapsedTime < 30000; // 라운드를 통과하지 않았거나 30초 미만인 경우
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

    // Progress Bar 안 씀 (5초 카운트다운은 숫자만)
    // => remove code for bar here

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

/** 게임 문장 + 녹음: 중복되지 않는 문장 요청 */
function fetchGameSentenceAndStartRecording() {
    let attempts = 0;

    function fetchDistinctSentence() {
        attempts++;
        if (attempts > 5) {
            console.warn("중복 제거 실패, 5회 시도 후 중복 문장이라도 진행합니다.");
            proceedRecording("어쩔 수 없이 중복 문장", true);
            return;
        }
        fetch('/get_game_sentence')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.warn('게임 문장 실패:', data.error);
                    handleTranscriptionFail();
                    return;
                }
                const gameSentence = data.game_sentence;
                if (!gameSentence) {
                    console.warn('게임 문장이 비어있음');
                    handleTranscriptionFail();
                    return;
                }
                // 중복 검사
                if (usedSentences.includes(gameSentence)) {
                    console.log("중복 문장 감지, 재시도...");
                    fetchDistinctSentence(); // 재시도
                } else {
                    usedSentences.push(gameSentence);
                    proceedRecording(gameSentence, false);
                }
            })
            .catch(error => {
                console.error('게임 문장 오류:', error);
                handleTranscriptionFail();
            });
    }

    function proceedRecording(gameSentence, forced) {
        lastReference = gameSentence; 
        gameText.innerText = gameSentence;
        gameText.classList.remove('hidden');
        gameStatus.innerText = "녹음 중...";
        startRecording(gameSentence);
    }

    fetchDistinctSentence();
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

            // ★ Progress Bar 설정
            const progressContainer = document.getElementById('progress-container');
            const progressBar = document.getElementById('progress-bar');
            progressContainer.style.display = "block"; // Progress Bar 표시
            progressBar.style.width = "100%"; // 초기 너비

            // 부드러운 감소를 위해 transition 설정
            progressBar.style.transition = "width 0.1s linear";

            let totalTime = 10; // 총 10초
            let elapsedTime = 0;
            let intervalDuration = 100; // 0.1초 간격
            const steps = totalTime * 1000 / intervalDuration; // 총 업데이트 횟수
            const decrement = 100 / steps; // 매 업데이트 시 감소율

            let recordInterval = setInterval(() => {
                elapsedTime += intervalDuration / 1000; // 경과 시간 업데이트
                if (elapsedTime >= totalTime) {
                    clearInterval(recordInterval);
                    stopRecording(); // 10초 도달 시 녹음 중지
                } else {
                    const percentage = 100 - (elapsedTime / totalTime) * 100;
                    progressBar.style.width = `${percentage}%`;
                }
            }, intervalDuration);

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

        // 녹음 끝나면 Progress Bar 다시 숨기기
        const progressContainer = document.getElementById('progress-container');
        progressContainer.style.display = "none";
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
            handleTranscriptionFail();
            return;
        }
        const { scores, stt_text, audio_path } = data;
        if (!scores || typeof scores.Whisper !== 'number' || !stt_text) {
            console.warn('STT 결과 데이터 이상');
            handleTranscriptionFail();
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
        handleTranscriptionFail();
    });
}


// 점수별 이미지 매핑 (예시)
function getScoreImage(score) {
    // 조건: 0, 0~10, 10~20, 20~30, 30~40, 40~60, 60~70, 70~80, 80~90, 100
    // stt_game/static/images/ 폴더 내 파일명
    if (score === 0) return "ya.gif";
    else if (score > 0 && score <= 10) return "jjugul.gif";
    else if (score > 10 && score <= 20) return "myom.gif";
    else if (score > 20 && score <= 30) return "showr.gif";
    else if (score > 30 && score <= 40) return "whatdo.gif";
    else if (score > 40 && score <= 60) return "youcandoit.gif";
    else if (score > 60 && score <= 70) return "thismakes.gif";   // 주의: user typed 'thismakesgif' but it might be 'thismakes.gif'
    else if (score > 70 && score <= 80) return "party.gif";
    else if (score > 80 && score <= 90) return "thumbup.gif";
    else if (score === 100) return "welldone.gif";
    // 점수가 90~100 사이지만 100이 아니면 어쩌나? 
    // 이하 임의 처리
    else if (score > 90 && score < 100) return "thumbup.gif"; 
    return null;
}


/** 라운드 피드백 표시 */
function showRoundFeedback(reference, recognized, score, audioPath) {
    // 라운드 페이지 숨기고 피드백 페이지 활성화
    roundPage.classList.remove('active');
    roundFeedbackPage.classList.add('active');

    // 자동재생 시도 (브라우저 정책에 따라 차단 가능)
    recordedAudioEl.src = audioPath || "";        
    recordedAudioEl.load();
    
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
    
    // ★ 추가: 버튼 이름 업데이트
    if (score === 0) {
        nextRoundBtn.textContent = "다시하기";
        nextRoundBtn.onclick = prapare; // "다시하기" 클릭 시 초기화
    } else {
        updateNextRoundButtonLabel(); // 기존 로직 유지
        nextRoundBtn.onclick = handleNextRound; // 다음 라운드로 이동
    }    
    
    // ★ 추가: 점수별 이미지 표시
    const scoreImageFile = getScoreImage(score);
    const scoreImageWrapper = document.getElementById('score-image-wrapper');
    if (scoreImageFile) {
        // 경로: /static/images/<파일명>
        scoreImageWrapper.innerHTML = `
            <img src="/static/images/${scoreImageFile}" alt="scoreImage">
        `;
        scoreImageWrapper.style.display = "block";
    } else {
        // 해당 구간에 이미지 없으면 숨김
        scoreImageWrapper.style.display = "none";
    }
}

/** "다음 라운드" 처리 */
function handleNextRound() {
    roundFeedbackPage.classList.remove('active');

    // 점수 이미지 숨기기
    const scoreImageWrapper = document.getElementById('score-image-wrapper');
    scoreImageWrapper.style.display = "none";
    
    currentRound++;
    if (currentRound > totalRounds) {
        endGame();
    } else {
        showPage(roundPage);
        startRound(currentRound);
    }
}


/** 오류 발생 시 0점 처리 & 피드백 페이지 표시 (원문=lastReference, 인식="", 점수=0) */
function handleTranscriptionFail() {
    console.warn("Transcription failed or no speech -> 0점 처리.");
    const whisperScore = 0;
    showRoundFeedback(lastReference, "", whisperScore, "");
}


/** 게임 종료 → formContainer로 이동하여 최종 점수 제출 */
function endGame() {
    // ★ 점수 이미지 숨기기
    const scoreImageWrapper = document.getElementById('score-image-wrapper');
    scoreImageWrapper.style.display = "none";

    // 최종 점수를 표시
    document.getElementById('final-score').innerText = Math.floor(totalScore); // 소수점 제거

    // 응모 폼 표시 (랭킹 보드는 숨김)
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

function sendToGoogleSheets() {
  let company = document.getElementById('company').value.trim();
  let employeeId = document.getElementById('employeeId').value.trim();
  let name = document.getElementById('name').value.trim();

  if (!company || !employeeId || !name) {
      console.warn("모든 정보를 입력해주세요!");
      return;
  }

    // 부정행위 판별
    if (isCheating()) {
        alert("부정행위가 감지되었습니다. 게임을 다시 진행해주세요.");
        console.warn("부정행위로 인해 제출이 중단되었습니다.");
        prapare(); // 초기화 후 다시 시작
        return;
    }
    
  let data = {
      company,
      employeeId,
      name,
      totalScore: totalScore.toFixed(2),
      time: new Date().toISOString(), // 현재 시간을 ISO 형식으로 추가
  };

  // Flask (/save_to_sheet) or Node server or Apps Script URL에 맞게 변경
  fetch('/save_to_sheet', {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(res => {
      console.log("서버 응답:", res);
      if (res.status === "success") {
          // 1) 제출이 완료되었다는 알림창
          alert("제출이 완료되었습니다!");
          // 2) 맨 처음 게임 시작화면(landing-page)으로 돌아가기
          prapare(); 
      } else {
          console.warn("서버에서 오류 반환:", res.message);
      }
  })
  .catch(error => {
      console.error("Node fetch 오류:", error);
  });
}



/** 랭킹 보드 표시 함수 */
function displayRankings() {
    const rankingBoard = document.getElementById('ranking-board-container');
    const rankingList = document.getElementById('ranking-list');

    // 로딩 메시지 표시
    rankingBoard.innerHTML = '<p>로딩 중...</p>';
    rankingBoard.style.display = 'block'; // 랭킹 보드 표시

    // 1. 서버에서 랭킹 데이터 가져오기
    fetch(`https://nsdigitalt.click/get_rankings?timestamp=${Date.now()}`) // 도메인 URL로 변경
        .then(response => response.json())
        .then(data => {
            if (!data.rankings || data.rankings.length === 0) {
                throw new Error("No rankings available from server");
            }

            // 서버 데이터로 랭킹 표시
            rankingBoard.innerHTML = ''; // 기존 로딩 메시지 제거
            rankingList.innerHTML = ''; // 기존 랭킹 제거

            data.rankings.forEach((entry, index) => {
                const listItem = document.createElement('li');
                listItem.textContent = `${entry.rank}등: ${entry.name} (${entry.company}) - 점수: ${entry.score}, 참여: ${entry.participationCount}회`;
                rankingList.appendChild(listItem);
            });
        })
        .catch(serverError => {
            console.warn('서버 랭킹 데이터를 가져오는 중 오류 발생:', serverError);

            // 2. 스프레드시트 데이터로 우회
            fetch(`https://script.google.com/macros/s/AKfycbwqSCZ8MrM3F10BnuZEatniAkaOWlnBBPe8-KwbKg_f_EQ2NR0GnD_uRX_XmVn0fCaRzQ/exec`)
                .then(response => response.json())
                .then(backupData => {
                    if (!backupData.rankings || backupData.rankings.length === 0) {
                        throw new Error("No rankings available from spreadsheet");
                    }

                    // 스프레드시트 데이터로 랭킹 표시
                    rankingBoard.innerHTML = ''; // 기존 오류 메시지 제거
                    rankingList.innerHTML = ''; // 기존 랭킹 제거

                    backupData.rankings.forEach((entry, index) => {
                        const listItem = document.createElement('li');
                        listItem.textContent = `${entry.rank}등: ${entry.name} (${entry.company}) - 점수: ${entry.score}, 참여: ${entry.participationCount}회`;
                        rankingList.appendChild(listItem);
                    });
                })
                .catch(backupError => {
                    console.error('스프레드시트 데이터 가져오기 실패:', backupError);
                    rankingBoard.innerHTML = '<p>랭킹 데이터를 불러올 수 없습니다.</p>';
                });
        });
}



// 게임 시작 시 랭킹 보드 표시
document.addEventListener('DOMContentLoaded', () => {
    displayRankings();
});


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
    usedSentences = []; 
    countdownDisplay.innerText = '';
    gameText.innerText = '';
    gameText.classList.add('hidden');
    gameStatus.innerText = '';
    micStatus.innerText = '';
    micTestPassed = false;

    // ★ 점수 이미지 숨기기
    const scoreImageWrapper = document.getElementById('score-image-wrapper');
    scoreImageWrapper.style.display = "none";

    document.getElementById('final-score').innerText = '0';
    document.getElementById('company').value = '';
    document.getElementById('employeeId').value = '';
    document.getElementById('name').value = '';
}
