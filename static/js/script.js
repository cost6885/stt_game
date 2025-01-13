// static/js/script.js

let mediaRecorder;
let audioChunks = [];
let currentRound = 1;

const totalRounds = 3;
let countdownInterval;
let micTestPassed = false;

// 라운드별 점수를 담는 임시 배열 (서버에서도 세션을 쓰므로, 여기선 참고용)
let roundScores = [];

// 타이머 시작 시간(프론트에서의 경과 시간 체크)
let gameStartTime;

/** 이미 사용한 문장 리스트 (중복 방지) */
let usedSentences = []; 

/** 현재 라운드에서 불러온 원문을 저장 */
let lastReference = ""; 

// 마이크 테스트용 문구 (index.html에서 {{ test_sentence }} 로 넘겨옴)
const requiredTestSentence = typeof testSentence !== 'undefined' ? testSentence : "인생을 맛있게";

// 주요 페이지 요소
const landingPage = document.getElementById('landing-page');
const micTestPage = document.getElementById('mic-test-page');
const gameStartPage = document.getElementById('game-start-page'); // 로딩 페이지 (2초)
gameStartPage.style.display = 'none';

const roundPage = document.getElementById('round-page');
const roundFeedbackPage = document.getElementById('round-feedback-page');

// 최종 점수 제출 폼
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
 * 라운드가 마지막(3라운드)이면 "결과보기", 아니면 "다음 라운드"
 */
function updateNextRoundButtonLabel() {
    if (currentRound === totalRounds) {
        nextRoundBtn.textContent = "결과보기";
    } else {
        nextRoundBtn.textContent = "다음 라운드";
    }
}

/** 페이지 전환 헬퍼 */
function showPage(page) {
    [landingPage, micTestPage, roundPage, roundFeedbackPage].forEach(p => p.classList.remove('active'));
    page.classList.add('active');

    // landingPage가 활성화될 때마다 랭킹 보드 갱신
    if (page === landingPage) {
        displayRankings();
    }
}

/** 폼 표시/숨김 */
function showFormContainer() {
    formContainer.style.display = "block";
}
function hideFormContainer() {
    formContainer.style.display = "none";
}

/** 시작 버튼 → 마이크 테스트 페이지로 */
startGameBtn.addEventListener('click', () => {
    showPage(micTestPage);

    // 랭킹 보드 숨기기
    const rankingBoard = document.getElementById('ranking-board-container');
    if (rankingBoard) {
        rankingBoard.style.display = 'none';
    }
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

/** 마이크 테스트 음성 전송 */
function sendAudioForTest(audioData, referenceSentence) {
    fetch('/mic_test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            audio: audioData,
            reference: referenceSentence,            
        })
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

        // Whisper 점수가 50 이상이면 통과
        if (scores.Whisper > 50) {
            micStatus.innerText = "마이크 테스트 성공.";
            micTestPassed = true;
            startGameSequence();
        } else {
            micStatus.innerText = `말을 하셨나요? 마이크 상태를 확인 해주세요.`;
            micTestPassed = false;
            // (테스트 편의를 위해 자동 우회하려면 주석 해제)
            // micTestPassed = true;
            // startGameSequence();
        }
    })
    .catch(error => {
        console.error('마이크 테스트 오류:', error);
        micStatus.innerText = "마이크 테스트 실패 (네트워크/서버 오류)";
        micTestPassed = false;
    });
}

/** 게임 시작 시퀀스 */
function startGameSequence() {
    if (!micTestPassed) {
        micStatus.innerText = "마이크 테스트 통과 필요.";
        return;
    }

    // 서버에 /start_game → 세션에 game_start_time 기록
    fetch('/start_game', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            console.log("서버에서 게임 시작 시간 설정 완료:", data);

            // 추가: data.authToken 수신 → 전역 변수나 어디든 저장
            window.authToken = data.authToken;

            gameStartTime = Date.now();

            // 로딩(게임시작) 페이지 2초 노출
            gameStartPage.style.display = 'flex';
            setTimeout(() => {
                gameStartPage.style.display = 'none';
                currentRound = 1;
                roundScores = [];  
                usedSentences = [];

                showPage(roundPage);
                startRound(currentRound);
            }, 2000);
        })
        .catch(err => {
            console.error("'/start_game' 호출 오류:", err);
            micStatus.innerText = "서버에 게임 시작 알리는 중 오류 발생";
        });
}

/** 라운드를 진행했는지 여부 */
function checkRoundsCompleted() {
    return currentRound > 1 || roundScores.length > 0;
}

/** 부정행위 여부 판단 */
function isCheating() {
    const elapsedTime = Date.now() - gameStartTime; // ms
    const roundsCompleted = checkRoundsCompleted();
    return !roundsCompleted || elapsedTime < 30000; 
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

    let countdown = 3;
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

/** 게임 문장 + 녹음(중복 방지) */
function fetchGameSentenceAndStartRecording() {
    let attempts = 0;

    function fetchDistinctSentence() {
        attempts++;
        if (attempts > 5) {
            console.warn("중복 제거 실패(5회). 어쩔 수 없이 중복 문장 사용");
            proceedRecording("중복 문장 (임시)", true);
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
                if (usedSentences.includes(gameSentence)) {
                    console.log("중복 문장 감지, 재시도");
                    fetchDistinctSentence();
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

/** 녹음 시작 → 10초 후 자동 종료 */
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

            const progressContainer = document.getElementById('progress-container');
            const progressBar = document.getElementById('progress-bar');
            progressContainer.style.display = "block";
            progressBar.style.width = "100%";
            progressBar.style.transition = "width 0.1s linear";

            let totalTime = 10; 
            let elapsedTime = 0;
            let intervalDuration = 100; // 0.1초

            let recordInterval = setInterval(() => {
                elapsedTime += intervalDuration / 1000;
                if (elapsedTime >= totalTime) {
                    clearInterval(recordInterval);
                    stopRecording();
                } else {
                    const percentage = 100 - (elapsedTime / totalTime) * 100;
                    progressBar.style.width = `${percentage}%`;
                }
            }, intervalDuration);

        })
        .catch(error => {
            console.error('녹음 접근 오류:', error);
            handleTranscriptionFail();
        });
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        gameStatus.innerText = "녹음 중지됨.";

        const progressContainer = document.getElementById('progress-container');
        progressContainer.style.display = "none";
    }
}

/** STT 처리 (RoundScore 사용) */
function sendAudio(audioData, referenceSentence) {
  fetch('/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        audio: audioData,
        reference: referenceSentence,
        authToken: window.authToken  // ← 추가
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
      // ★ RoundScore 검사
      if (!scores || typeof scores.RoundScore !== 'number' || !stt_text) {
        console.warn('STT 결과 데이터 이상');
        handleTranscriptionFail();
        return;
      }

      // 클라이언트 임시로 roundScores 배열에 push
      roundScores.push(scores.RoundScore);

      // 콘솔 표시 (RoundScore만 사용)
      console.log(`라운드 ${currentRound} 점수: ${Math.round(scores.RoundScore)}점`);

      // 라운드 피드백
      showRoundFeedback(referenceSentence, stt_text, scores.RoundScore, audio_path);
    })
    .catch(error => {
      console.error('STT 변환 오류:', error);
      handleTranscriptionFail();
    });
}

/** 점수별 이미지 */
function getScoreImage(score) {
    if (score === 0) return "ya.gif";
    else if (score > 0 && score <= 10) return "jjugul.gif";
    else if (score > 10 && score <= 20) return "myom.gif";
    else if (score > 20 && score <= 30) return "shower.gif";
    else if (score > 30 && score <= 40) return "whatdo.gif";
    else if (score > 40 && score <= 60) return "youcandoit.gif";
    else if (score > 60 && score <= 70) return "thismakes.gif";
    else if (score > 70 && score <= 80) return "party.gif";
    else if (score > 80 && score <= 90) return "thumbup.gif";
    else if (score === 100) return "welldone.gif";
    else if (score > 90 && score < 100) return "thumbup.gif"; 
    return null;
}

/** 라운드 피드백 표시 */
function showRoundFeedback(reference, recognized, roundScore, audioPath) {
    roundPage.classList.remove('active');
    roundFeedbackPage.classList.add('active');

    recordedAudioEl.src = audioPath || "";
    recordedAudioEl.load();

    originalTextEl.innerHTML = reference;
    recognizedTextEl.innerHTML = highlightDifferences(reference, recognized);

    let feedbackClass = "bad";
    let feedbackText = "BAD";
    if (roundScore > 70) {
        feedbackClass = "good";
        feedbackText = "GOOD";
    } else if (roundScore > 50) {
        feedbackClass = "normal";
        feedbackText = "NORMAL";
    }

    scoreFeedbackTextEl.className = "score-feedback " + feedbackClass;
    scoreFeedbackTextEl.textContent = `${feedbackText} ( ${Math.round(roundScore)}% )`;

    // 점수 기준에 따라 버튼 설정
    if (roundScore <= 80) { // 80점 이하일 경우
        nextRoundBtn.textContent = "다시하기";
        nextRoundBtn.onclick = prapare;
    } else {
        updateNextRoundButtonLabel();
        nextRoundBtn.onclick = handleNextRound;
    }

    const scoreImageFile = getScoreImage(roundScore);
    const scoreImageWrapper = document.getElementById('score-image-wrapper');
    if (scoreImageFile) {
        scoreImageWrapper.innerHTML = `<img src="/static/images/${scoreImageFile}" alt="scoreImage">`;
        scoreImageWrapper.style.display = "block";
    } else {
        scoreImageWrapper.style.display = "none";
    }
}

/** 다음 라운드 */
function handleNextRound() {
    roundFeedbackPage.classList.remove('active');
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

/** 오류(음성 없는 등) → 0점 처리 */
function handleTranscriptionFail() {
    console.warn("Transcription failed or no speech -> 0점 처리.");
    showRoundFeedback(lastReference, "", 0, "");
}

/** 모든 라운드 끝나면 → 서버가 최종 점수 계산 & 저장 */
function endGame() {
    // 1) UI 정리
    const scoreImageWrapper = document.getElementById('score-image-wrapper');
    scoreImageWrapper.style.display = "none";

    // ★ 추가: 클라이언트 roundScores를 평균내어 #final-score에 표시 (표면적 점수)
    if (roundScores.length > 0) {
      const sum = roundScores.reduce((a, b) => a + b, 0);
      const avg = sum / roundScores.length;
      const displayScore = Math.round(avg);
      document.getElementById('final-score').innerText = displayScore;
    } else {
      document.getElementById('final-score').innerText = '0';
    }

    // 2) 회사/사번/이름 입력 폼 표시
    showFormContainer();
}


/** 원문 vs 인식문 차이 하이라이트 */
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

/** 최종 점수 제출(서버가 /finish_game에서 계산) */
function sendToGoogleSheets() {
    const company = document.getElementById('company').value.trim();
    const employeeId = document.getElementById('employeeId').value.trim();
    const name = document.getElementById('name').value.trim();

    if (!company || !employeeId || !name) {
        console.warn("모든 정보를 입력해주세요!");
        return;
    }

    // 부정행위 체크
    if (isCheating()) {
        alert("부정행위가 감지되었습니다. 다시 진행해주세요.");
        prapare();
        return;
    }

    // 서버에 회사/사번/이름만 전달
    fetch('/finish_game', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
                company,
                employeeId,
                name,
                authToken: window.authToken,
                roundScores: roundScores  // ← 추가
              })
    })
    .then(res => res.json())
    .then(data => {
        console.log("finish_game 응답:", data);

        if (data.error) {
            alert("오류 발생: " + data.error);
            return;
        }

        // localResult, sheetResult 가 success 인지 체크
        if (data.localResult?.status === "success" && data.sheetResult?.status === "success") {
            alert(`응모 완료! 최종점수: ${data.finalScore}`);
            prapare(); // 초기화
        } else {
            alert("저장 중 일부 에러 발생");
            console.warn("localResult:", data.localResult, "sheetResult:", data.sheetResult);
        }
    })
    .catch(err => {
        console.error("finish_game 호출 오류:", err);
        alert("저장 중 오류 발생");
    });
}

/** 랭킹 보드: 상위 5명 */
function displayRankings() {
    const rankingBoard = document.getElementById('ranking-board-container');
    const rankingList = document.getElementById('ranking-list');
    const rankmoreBtn = document.getElementById('rankmore');

    if (!rankingBoard || !rankingList) return;

    rankingList.innerHTML = '<div>로딩 중...</div>';
    rankingBoard.style.display = 'block';

    fetch('/get_rankings?timestamp=' + Date.now())
        .then(response => response.json())
        .then(data => {
            if (!data.rankings || data.rankings.length === 0) {
                throw new Error("No rankings available from server");
            }

            // 부정행위 제외
            let filteredRankings = data.rankings.filter(entry => entry.status !== "부정행위");
            if (filteredRankings.length === 0) {
                throw new Error("No valid (non-cheater) rankings available");
            }

            // 정렬: 참여횟수(desc) → responseTime(asc) → score(desc)
            filteredRankings.sort((a, b) => {
                if (b.participationCount !== a.participationCount) {
                    return b.participationCount - a.participationCount;
                }
                const aTime = new Date(a.responseTime).getTime();
                const bTime = new Date(b.responseTime).getTime();
                if (aTime !== bTime) {
                    return aTime - bTime;
                }
                return b.score - a.score;
            });

            rankingList.innerHTML = '';

            // 상위 5명만 표시
            const topFive = filteredRankings.slice(0, 5);
            topFive.forEach((entry, index) => {
                const rankItem = document.createElement('div');
                const displayScore = Math.min(entry.score, 100); // 최고점수를 100으로 제한
                const rankText = `${entry.name} (${entry.company}) - 참여: ${entry.participationCount}회(최고점수: ${displayScore})`;

                if (index === 0) {
                    rankItem.innerHTML = `<span class="name" style="font-weight:bold; color: rgba(0,0,0,1);">1등🥇 ${rankText}</span>`;
                } else if (index === 1) {
                    rankItem.innerHTML = `<span class="name" style="font-weight:bold; color: rgba(0,0,0,0.8);">2등🥈 ${rankText}</span>`;
                } else if (index === 2) {
                    rankItem.innerHTML = `<span class="name" style="font-weight:bold; color: rgba(0,0,0,0.6);">3등🥉 ${rankText}</span>`;
                } else {
                    const alpha = Math.max(0.4, 1 - index * 0.1);
                    rankItem.innerHTML = `<span class="name" style="color: rgba(0,0,0,${alpha});">${index + 1}등🙄 ${rankText}</span>`;
                }
                rankingList.appendChild(rankItem);
            });

            // rankmore 버튼
            if (filteredRankings.length > 5) {
                rankmoreBtn.style.display = 'block';
            } else {
                rankmoreBtn.style.display = 'none';
            }
        })
        .catch(error => {
            console.error('랭킹 로드 오류:', error);
            rankingList.innerHTML = '<div>랭킹 데이터를 불러올 수 없습니다.</div>';
            if (rankmoreBtn) {
                rankmoreBtn.style.display = 'none';
            }
        });
}


/** rankmore → 전체 랭킹 팝업 */
function rankmore() {
    const popup = window.open("", "RankPopup", "width=600,height=800");
    if (!popup) {
        alert("팝업이 차단되었습니다. 해제 후 다시 시도!");
        return;
    }

    popup.document.write(`
        <html>
        <head>
            <title>전체 랭킹</title>
            <style>
                body {
                    font-family: 'Nanum Gothic', sans-serif;
                    background-color: #f9f9f9;
                    text-align: center;
                    margin: 0; padding: 20px;
                }
                #popup-ranking-board {
                    margin: 0 auto; padding: 20px;
                    border-radius: 10px;
                    background-color: rgba(255, 255, 0, 0.5);
                    color: black; font-weight: bold;
                    line-height: 1.6; width: 80%;
                    max-width: 500px;
                }
                .rank-entry {
                    margin: 10px 0; font-size: 16px; text-align: left;
                }
                .ranking-info {
                    font-size: 14px; /* 전체 랭킹 제목보다 작게 설정 */
                    color: #666; /* 안내 문구를 흐릿한 회색으로 */
                    margin-bottom: 10px; /* 제목과 간격 추가 */
                }
            </style>
        </head>
        <body>
            <div class="ranking-info">랭킹은 참여횟수를 기준으로 하며, 참여횟수가 동일한 경우 먼저 참여한 순서로 선정됩니다.</div>
            <h2>🏆 전체 랭킹 🏆</h2>
            <div id="popup-ranking-board">불러오는 중...</div>
            <div class="ranking-info">부정행위를 통한 참여 시 상품지급이 제한됩니다.</div>
        </body>
        </html>
    `);


    const popupDoc = popup.document;
    fetch('/get_rankings?all=true')
        .then(res => {
            if (!res.ok) {
                throw new Error('랭킹 데이터를 불러오지 못했습니다.');
            }
            return res.json();
        })
        .then(data => {
            let entireRankings = data.rankings || [];

            // 부정행위자 제외
            entireRankings = entireRankings.filter(entry => entry.status !== "부정행위");
            if (entireRankings.length === 0) {
                throw new Error("No valid (non-cheater) rankings available");
            }

            // 정렬 동일
            entireRankings.sort((a, b) => {
                if (b.participationCount !== a.participationCount) {
                    return b.participationCount - a.participationCount;
                }
                const aTime = new Date(a.responseTime).getTime();
                const bTime = new Date(b.responseTime).getTime();
                if (aTime !== bTime) {
                    return aTime - bTime;
                }
                return b.score - a.score;
            });

            const container = popupDoc.getElementById('popup-ranking-board');
            container.innerHTML = '';

            entireRankings.forEach((entry, index) => {
                const div = popupDoc.createElement('div');
                div.className = 'rank-entry';

                const rankText = `${entry.name} (${entry.company}) - 점수: ${entry.score}, 참여: ${entry.participationCount}회`;

                if (index === 0) {
                    div.innerHTML = `<span style="font-weight:bold; color: rgba(0,0,0,1);">1등🥇 ${rankText}</span>`;
                } else if (index === 1) {
                    div.innerHTML = `<span style="font-weight:bold; color: rgba(0,0,0,0.8);">2등🥈 ${rankText}</span>`;
                } else if (index === 2) {
                    div.innerHTML = `<span style="font-weight:bold; color: rgba(0,0,0,0.6);">3등🥉 ${rankText}</span>`;
                } else {
                    const alpha = Math.max(0.4, 1 - index * 0.1);
                    div.innerHTML = `<span style="color: rgba(0,0,0,${alpha});">${index+1}등🙄 ${rankText}</span>`;
                }

                container.appendChild(div);
            });
        })
        .catch(err => {
            console.error(err);
            const container = popupDoc.getElementById('popup-ranking-board');
            container.innerHTML = `<p style="color:red;">오류 발생: ${err.message}</p>`;
        });
}

/** DOMContentLoaded → 랭킹 초기 표시 */
document.addEventListener('DOMContentLoaded', () => {
    displayRankings();
    const rankmoreBtn = document.getElementById('rankmore');
    if (rankmoreBtn) {
        rankmoreBtn.addEventListener('click', rankmore);
    }
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
    usedSentences = []; 
    countdownDisplay.innerText = '';
    gameText.innerText = '';
    gameText.classList.add('hidden');
    gameStatus.innerText = '';
    micStatus.innerText = '';
    micTestPassed = false;

    // 점수 이미지 숨기기
    const scoreImageWrapper = document.getElementById('score-image-wrapper');
    scoreImageWrapper.style.display = "none";

    document.getElementById('final-score').innerText = '0';
    document.getElementById('company').value = '';
    document.getElementById('employeeId').value = '';
    document.getElementById('name').value = '';

    // 클라이언트 임시 roundScores 배열도 비움
    roundScores = [];
    // (원한다면 server 세션도 초기화 가능, 여기선 생략)
}
