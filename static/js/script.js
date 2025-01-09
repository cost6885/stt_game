// static/js/script.js

let mediaRecorder;
let audioChunks = [];
let currentRound = 1;

const totalRounds = 3;
let countdownInterval;
let micTestPassed = false;

// 기존: let totalScore = 0; 
// 대신 라운드별 점수를 담을 배열 => 필요하다면 유지, 
// 혹은 서버가 점수를 관리하는 방식이면 굳이 안 써도 됨.
let roundScores = [];

// 타이머 시작 시간(프론트에서의 경과 시간 체크)
let gameStartTime;

/** 이미 사용한 문장 리스트 */
let usedSentences = []; 

/** 현재 라운드에서 불러온 원문을 저장 */
let lastReference = ""; 

// 기존 필드 or 문구
const requiredTestSentence = typeof testSentence !== 'undefined' ? testSentence : "인생을 맛있게";

// 페이지 요소
const landingPage = document.getElementById('landing-page');
const micTestPage = document.getElementById('mic-test-page');

// 게임 시작 로딩 페이지
const gameStartPage = document.getElementById('game-start-page');
gameStartPage.style.display = 'none';  // 초기 숨김

// 라운드 / 피드백 페이지
const roundPage = document.getElementById('round-page');
const roundFeedbackPage = document.getElementById('round-feedback-page');

// 폼 컨테이너 (최종 점수 입력)
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
    // 랭킹 보드 업데이트 (landingPage일 때만)
    if (page === landingPage) {
        displayRankings();
    }
}

/** 폼 컨테이너 표시/숨김 */
function showFormContainer() {
    formContainer.style.display = "block";
}
function hideFormContainer() {
    formContainer.style.display = "none";
}

/** 시작 버튼 클릭 → 마이크 테스트 페이지로 */
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

        // Whisper 점수가 50 이상이면 통과, 아니면 실패
        if (scores.Whisper > 50) {
            micStatus.innerText = "마이크 테스트 성공.";
            micTestPassed = true;
            startGameSequence();
        } else {
            micStatus.innerText = `말을 하셨나요? 점수: ${Math.round(scores.Whisper)}`;
            micTestPassed = false;
            // (테스트 편의를 위해 자동 우회)
            // micTestPassed = true;
            // startGameSequence();
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

    // 서버에 /start_game → 세션에 game_start_time 기록
    fetch('/start_game', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            console.log("서버에서 게임 시작 시간 설정 완료:", data);

            // 로컬 측에서도 타이머 시작 시간 기록
            gameStartTime = Date.now();

            // 로딩 페이지 2초 노출
            gameStartPage.style.display = 'flex';
            setTimeout(() => {
                gameStartPage.style.display = 'none';
                currentRound = 1;
                // 새 게임 시작이므로 roundScores 비우기
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

/** 라운드를 진행했는지 확인 */
function checkRoundsCompleted() {
    // 기존 totalScore 없이, 간단히 currentRound>1 인지로만 판단
    // 또는 roundScores.length > 0 여부 등
    return currentRound > 1 || roundScores.length > 0;
}

/** 부정행위 여부 판단 */
function isCheating() {
    const elapsedTime = Date.now() - gameStartTime; // ms
    const roundsCompleted = checkRoundsCompleted();
    // 30초 미만이거나, 라운드 하나도 안 했으면 부정행위
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

/** 게임 문장 + 녹음: 중복되지 않는 문장 요청 */
function fetchGameSentenceAndStartRecording() {
    let attempts = 0;

    function fetchDistinctSentence() {
        attempts++;
        if (attempts > 5) {
            console.warn("중복 제거 실패(5회), 중복 문장이라도 진행");
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
                    console.log("중복 문장 → 재시도");
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

            // Progress Bar
            const progressContainer = document.getElementById('progress-container');
            const progressBar = document.getElementById('progress-bar');
            progressContainer.style.display = "block";
            progressBar.style.width = "100%";

            progressBar.style.transition = "width 0.1s linear";

            let totalTime = 10; // 녹음 10초
            let elapsedTime = 0;
            let intervalDuration = 100; // 0.1초
            const steps = totalTime * 1000 / intervalDuration; 
            const decrement = 100 / steps; 

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

/** STT 처리 */
function sendAudio(audioData, referenceSentence) {
  fetch('/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: audioData, reference: referenceSentence })
  })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        console.error('STT 변환 실패:', data.error);
        handleTranscriptionFail();
        return;
      }
      const { scores, stt_text, audio_path } = data;
      if (!scores || typeof scores.Total !== 'number' || !stt_text) {
        console.warn('STT 결과 데이터 이상');
        handleTranscriptionFail();
        return;
      }

      // 클라이언트 단에 임시로 라운드별 점수 저장 (필요 없으면 제거 가능)
      roundScores.push(scores.Total);

      console.log(`라운드 ${currentRound} 점수: ${Math.round(scores.Total)}점`);

      // 라운드 피드백
      showRoundFeedback(referenceSentence, stt_text, scores.Total, audio_path);
    })
    .catch(error => {
      console.error('STT 변환 오류:', error);
      handleTranscriptionFail();
    });
}

/** 점수별 이미지 매핑 */
function getScoreImage(score) {
    if (score === 0) return "ya.gif";
    else if (score > 0 && score <= 10) return "jjugul.gif";
    else if (score > 10 && score <= 20) return "myom.gif";
    else if (score > 20 && score <= 30) return "showr.gif";
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
    if (roundScore > 90) {
        feedbackClass = "good";
        feedbackText = "GOOD";
    } else if (roundScore > 70) {
        feedbackClass = "normal";
        feedbackText = "NORMAL";
    }

    scoreFeedbackTextEl.className = "score-feedback " + feedbackClass;
    scoreFeedbackTextEl.textContent = `${feedbackText} ( ${Math.round(roundScore)}% )`;

    // 버튼 업데이트
    if (roundScore === 0) {
        nextRoundBtn.textContent = "다시하기";
        nextRoundBtn.onclick = prapare;
    } else {
        updateNextRoundButtonLabel();
        nextRoundBtn.onclick = handleNextRound;
    }

    // 점수별 이미지 표시
    const scoreImageFile = getScoreImage(roundScore);
    const scoreImageWrapper = document.getElementById('score-image-wrapper');
    if (scoreImageFile) {
        scoreImageWrapper.innerHTML = `<img src="/static/images/${scoreImageFile}" alt="scoreImage">`;
        scoreImageWrapper.style.display = "block";
    } else {
        scoreImageWrapper.style.display = "none";
    }
}

/** "다음 라운드" */
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

/** 오류 발생 시 0점 처리 */
function handleTranscriptionFail() {
    console.warn("Transcription failed or no speech -> 0점 처리.");
    showRoundFeedback(lastReference, "", 0, "");
}

/** 게임 종료 → 서버가 최종 점수 계산 & 저장 */
function endGame() {
    // 1) UI 정리
    const scoreImageWrapper = document.getElementById('score-image-wrapper');
    scoreImageWrapper.style.display = "none";

    // 2) 회사/사번/이름 정보를 입력받기 위해 폼 표시 (혹은 모달)
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
    const company = document.getElementById('company').value.trim();
    const employeeId = document.getElementById('employeeId').value.trim();
    const name = document.getElementById('name').value.trim();

    if (!company || !employeeId || !name) {
        console.warn("모든 정보를 입력해주세요!");
        return;
    }

    // 부정행위 체크
    if (isCheating()) {
        alert("부정행위가 감지되었습니다. 게임을 다시 진행해주세요.");
        prapare();
        return;
    }

    // (A) 서버로 회사/사번/이름만 보냄 (점수 X)
    fetch('/finish_game', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            company,
            employeeId,
            name
            // totalScore는 보내지 않음!
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log("finish_game 응답:", data);

        if (data.error) {
            alert("오류 발생: " + data.error);
            return;
        }

        // finalScore, localResult, sheetResult 등
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


/** 랭킹 보드 표시 (상위 5명 제한) */
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

            // ★ 상위 5명만 표시 (rankmore 버튼 있을 경우를 대비)
            const topFive = filteredRankings.slice(0, 5);

            topFive.forEach((entry, index) => {
                const rankItem = document.createElement('div');
                const rankText = `${entry.name} (${entry.company}) - 최고점수: ${entry.score}, 참여: ${entry.participationCount}회`;

                if (index === 0) {
                    rankItem.innerHTML = `<span class="name" style="font-weight:bold; color: rgba(0, 0, 0, 1);">1등🥇 ${rankText}</span>`;
                } else if (index === 1) {
                    rankItem.innerHTML = `<span class="name" style="font-weight:bold; color: rgba(0, 0, 0, 0.8);">2등🥈 ${rankText}</span>`;
                } else if (index === 2) {
                    rankItem.innerHTML = `<span class="name" style="font-weight:bold; color: rgba(0, 0, 0, 0.6);">3등🥉 ${rankText}</span>`;
                } else {
                    const alpha = Math.max(0.4, 1 - index * 0.1);
                    rankItem.innerHTML = `<span class="name" style="color: rgba(0, 0, 0, ${alpha});">${index + 1}등🙄 ${rankText}</span>`;
                }
                rankingList.appendChild(rankItem);
            });

            // 만약 전체 데이터가 5명 이하라면 rankmoreBtn 안 보이게
            if (filteredRankings.length > 5) {
                rankmoreBtn.style.display = 'block';
            } else {
                rankmoreBtn.style.display = 'none';
            }
        })
        .catch(error => {
            console.error('랭킹 데이터를 가져오는 중 오류 발생:', error);
            rankingList.innerHTML = '<div>랭킹 데이터를 불러올 수 없습니다.</div>';
            if (rankmoreBtn) {
                rankmoreBtn.style.display = 'none';
            }
        });
}

/** rankmore → 전체 랭킹 팝업 */
function rankmore() {
    // 팝업
    const popup = window.open("", "RankPopup", "width=600,height=800");
    if (!popup) {
        alert("팝업이 차단되었습니다. 팝업 차단 해제 후 다시 시도!");
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
            </style>
        </head>
        <body>
            <h2>🏆 전체 랭킹 🏆</h2>
            <div id="popup-ranking-board">불러오는 중...</div>
        </body>
        </html>
    `);

    const popupDoc = popup.document;

    // 전체 랭킹(제한 없이) 불러오기 → 별도 파라미터 all=true
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

    // 폼 초기화
    document.getElementById('final-score').innerText = '0';
    document.getElementById('company').value = '';
    document.getElementById('employeeId').value = '';
    document.getElementById('name').value = '';

    // 클라이언트 임시 roundScores 배열도 비움
    roundScores = [];
    
    // (원한다면 server 세션도 초기화 가능하지만 여기선 생략)
}
