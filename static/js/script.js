// static/js/script.js

let mediaRecorder;
let audioChunks = [];

const startBtn = document.getElementById('start-record-btn');
const stopBtn = document.getElementById('stop-record-btn');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');
const referenceSentence = document.getElementById('reference-sentence').innerText;

startBtn.addEventListener('click', async () => {
    if (!navigator.mediaDevices) {
        alert("Media Devices API not supported in your browser.");
        return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();

    statusDiv.innerText = "녹음 중...";
    startBtn.disabled = true;
    stopBtn.disabled = false;

    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { 'type' : 'audio/wav; codecs=PCM' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
            const base64data = reader.result;
            sendAudio(base64data);
        };
        audioChunks = [];
    };
});

stopBtn.addEventListener('click', () => {
    mediaRecorder.stop();
    statusDiv.innerText = "녹음 중지됨.";
    startBtn.disabled = false;
    stopBtn.disabled = true;
});

function sendAudio(audioData) {
    statusDiv.innerText = "STT 변환 중...";
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
        displayResults(data);
        statusDiv.innerText = "처리 완료!";
    })
    .catch(error => {
        console.error('Error:', error);
        statusDiv.innerText = "오류 발생!";
    });
}

function displayResults(data) {
    const { scores, difficulty } = data;
    resultsDiv.innerHTML = `
        <h2>결과</h2>
        <p><strong>난이도:</strong> ${difficulty}</p>
        <h3>점수:</h3>
        <ul>
            <li>Whisper: ${scores.Whisper.toFixed(2)}%</li>
            <li>Google Speech-to-Text: ${scores.Google.toFixed(2)}%</li>
            <li>Azure Speech Services: ${scores.Azure.toFixed(2)}%</li>
        </ul>
    `;
}
