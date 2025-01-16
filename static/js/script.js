        const gameStartImage = document.querySelector('#game-start-image');
        if (gameStartImage) {
            gameStartImage.style.width = '300px'; // 모바일에 맞게 이미지 크기 조정
        }
    } else {
        console.log("데스크톱 디바이스로 감지됨");
        document.body.classList.add('desktop-layout');
    }
}

// DOMContentLoaded 이벤트에 디바이스 감지 로직 추가
document.addEventListener('DOMContentLoaded', () => {
    adjustLayoutForDevice();
});

 // 클릭 이벤트 추가 (숨기기 기능)
        scoreImageWrapper.onclick = () => {
            scoreImageWrapper.style.display = "none";
        };
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


function handleRoundRetry() {
    // 라운드 피드백 페이지를 닫고
    roundFeedbackPage.classList.remove('active');

    // 점수 이미지를 숨기고 (필요시)
    const scoreImageWrapper = document.getElementById('score-image-wrapper');
    scoreImageWrapper.style.display = "none";

    // 현재 라운드를 다시 시작
    showPage(roundPage);
    startRound(currentRound);
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
                // 정렬: 참여횟수(desc) → score(desc) → responseTime(asc)
            filteredRankings.sort((a, b) => {
                if (b.participationCount !== a.participationCount) {
                    return b.participationCount - a.participationCount; // 참여횟수 내림차순
                }
                if (b.score !== a.score) {
                    return b.score - a.score; // 점수 내림차순
                }
                const aTime = new Date(a.responseTime).getTime();
                const bTime = new Date(b.responseTime).getTime();

                return aTime - bTime; // 시간 오름차순
            });

            rankingList.innerHTML = '';

            // 상위 5명만 표시
            const topFive = filteredRankings.slice(0, 5);
            topFive.forEach((entry, index) => {
                const rankItem = document.createElement('div');
                const displayScore = Math.min(entry.score, 100); // 최고점수를 100으로 제한

                const rankText = `${entry.name} (${entry.company}) - 참여 ${entry.participationCount}회(최고점수 ${displayScore})`;

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
