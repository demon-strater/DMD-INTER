import { FilesetResolver, HandLandmarker } from './vendor/mediapipe/vision_bundle.mjs';
import { HAND_CONFIG } from './hand/interaction-config.js';
import { GestureStateMachine } from './hand/gesture-state-machine.js';

// The camera feed is never shown. #handTrackerVideo only feeds the model; the panel draws what the
// model recognises: the camera's field, the part of it that maps onto the screen, and the hand.
const toggle = document.getElementById('handTrackerToggle');
const panel = document.getElementById('handTrackerPanel');
const stateLabel = document.getElementById('handTrackerState');
const hintLabel = document.getElementById('handTrackerHint');
const video = document.getElementById('handTrackerVideo');
const canvas = document.getElementById('handTrackerCanvas');
const handCursor = document.getElementById('handCursor');
const backButton = document.getElementById('backToShelf');
const context = canvas.getContext('2d');
const gestures = new GestureStateMachine(HAND_CONFIG);

const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];
const TONE_COLORS = {
    dim: 'rgba(214, 209, 199, 0.5)',
    warn: '#f0b46e',
    ready: '#f6f1e7',
    select: '#e7c27f',
    back: '#ef8a73'
};

let landmarker;
let stream;
let animationFrame;
let running = false;
let starting = false;
let lastVideoTime = -1;
let cursorX = null;
let cursorY = null;
let navigationX = null;
let handInRange = false;
let palmWindingSign = 0;
let palmCalibrationCandidate = 0;
let palmCalibrationFrames = 0;
let trackingLostSince = 0;
let lastStatus = '';
let errorTimer = 0;
// The recognition area in normalised camera coordinates (unmirrored); see updateArea().
let area = { left: 0.12, top: 0.135, width: 0.76, height: 0.57 };

function setStatus(tone, state, hint = '') {
    const key = `${tone}|${state}|${hint}`;
    if (key === lastStatus) return;
    lastStatus = key;
    panel.dataset.tone = tone;
    stateLabel.textContent = state;
    hintLabel.textContent = hint;
}

function inHub() {
    return document.body.classList.contains('view-hub');
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFingerExtended(points, tip, pip) {
    return distance(points[tip], points[0]) > distance(points[pip], points[0]) * 1.16;
}

function visibleHandSize(points) {
    const xValues = points.map(point => point.x);
    const yValues = points.map(point => point.y);
    return Math.max(
        Math.max(...xValues) - Math.min(...xValues),
        Math.max(...yValues) - Math.min(...yValues)
    );
}

function palmWinding(points) {
    const wrist = points[0];
    const indexKnuckle = points[5];
    const littleKnuckle = points[17];
    const winding =
        (indexKnuckle.x - wrist.x) * (littleKnuckle.y - wrist.y) -
        (indexKnuckle.y - wrist.y) * (littleKnuckle.x - wrist.x);
    return Math.abs(winding) >= HAND_CONFIG.palm.windingThreshold ? Math.sign(winding) : 0;
}

function calibratePalm(points) {
    const windingSign = palmWinding(points);
    const extendedCount = [[8, 6], [12, 10], [16, 14], [20, 18]]
        .filter(([tip, pip]) => isFingerExtended(points, tip, pip)).length;

    if (!windingSign || extendedCount < 3) {
        palmCalibrationCandidate = 0;
        palmCalibrationFrames = 0;
        return false;
    }

    if (palmCalibrationCandidate === windingSign) palmCalibrationFrames += 1;
    else {
        palmCalibrationCandidate = windingSign;
        palmCalibrationFrames = 1;
    }

    if (palmCalibrationFrames >= HAND_CONFIG.palm.calibrationFrames) {
        palmWindingSign = windingSign;
    }
    return palmWindingSign !== 0;
}

// The camera's frame shape; a stream can report a placeholder size before its first real frame.
function frameSize() {
    const known = video.videoWidth >= 16 && video.videoHeight >= 16;
    return known ? { width: video.videoWidth, height: video.videoHeight } : { width: 640, height: 480 };
}

// The panel canvas takes the camera's shape at twice the panel's width, for crisp lines.
function sizeCanvas() {
    const { width, height } = frameSize();
    const cssWidth = canvas.clientWidth || 200;
    canvas.width = Math.round(cssWidth * 2);
    canvas.height = Math.round(cssWidth * 2 * height / width);
}

// Keep the recognition area at the screen's 16:9 whatever shape the camera delivers.
function updateArea() {
    const { width: frameWidth, height: frameHeight } = frameSize();
    const { width, centerY } = HAND_CONFIG.area;
    const height = Math.min(0.8, width * (frameWidth / frameHeight) * 9 / 16);
    area = {
        left: (1 - width) / 2,
        top: Math.min(Math.max(0.03, centerY - height / 2), 0.97 - height),
        width,
        height
    };
}

// Camera coordinates → screen pixels: mirrored, so moving the hand right moves the cursor right.
function toScreen(point) {
    const nx = Math.min(1, Math.max(0, (point.x - area.left) / area.width));
    const ny = Math.min(1, Math.max(0, (point.y - area.top) / area.height));
    return { x: (1 - nx) * window.innerWidth, y: ny * window.innerHeight };
}

function drawScene(points = null, tone = 'ready', fistProgress = 0) {
    const W = canvas.width;
    const H = canvas.height;
    const px = W / Math.max(1, canvas.clientWidth);
    context.clearRect(0, 0, W, H);

    // The camera's whole field: a faint dot grid.
    context.fillStyle = 'rgba(255, 255, 255, 0.13)';
    for (let gx = 1; gx < 10; gx++) {
        for (let gy = 1; gy < 8; gy++) {
            context.beginPath();
            context.arc(gx * W / 10, gy * H / 8, 1.1 * px, 0, Math.PI * 2);
            context.fill();
        }
    }

    // The part of the field that maps onto the screen, drawn mirrored like the screen itself.
    const ax = (1 - area.left - area.width) * W;
    const ay = area.top * H;
    const aw = area.width * W;
    const ah = area.height * H;
    context.fillStyle = 'rgba(255, 255, 255, 0.06)';
    context.fillRect(ax, ay, aw, ah);
    context.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    context.lineWidth = 1 * px;
    context.setLineDash([4 * px, 4 * px]);
    context.strokeRect(ax, ay, aw, ah);
    context.setLineDash([]);
    const corner = 12 * px;
    context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    context.lineWidth = 2 * px;
    context.beginPath();
    for (const [cx, cy, sx, sy] of [[ax, ay, 1, 1], [ax + aw, ay, -1, 1], [ax, ay + ah, 1, -1], [ax + aw, ay + ah, -1, -1]]) {
        context.moveTo(cx, cy + sy * corner);
        context.lineTo(cx, cy);
        context.lineTo(cx + sx * corner, cy);
    }
    context.stroke();

    if (!points) return;

    const color = TONE_COLORS[tone] || TONE_COLORS.ready;
    const p = points.map(point => ({ x: (1 - point.x) * W, y: point.y * H }));

    // How large the hand reads to the model (its distance from the camera): a thin box around it.
    const xs = p.map(point => point.x);
    const ys = p.map(point => point.y);
    const pad = 6 * px;
    context.strokeStyle = tone === 'dim' ? 'rgba(214, 209, 199, 0.35)' : 'rgba(255, 255, 255, 0.28)';
    context.lineWidth = 1 * px;
    context.strokeRect(Math.min(...xs) - pad, Math.min(...ys) - pad,
        Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2);

    context.strokeStyle = color;
    context.lineWidth = 2.4 * px;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    for (const [start, end] of CONNECTIONS) {
        context.moveTo(p[start].x, p[start].y);
        context.lineTo(p[end].x, p[end].y);
    }
    context.stroke();

    context.fillStyle = color;
    for (const point of p) {
        context.beginPath();
        context.arc(point.x, point.y, 2.6 * px, 0, Math.PI * 2);
        context.fill();
    }

    // Thumb and index tips: their gap is the pinch.
    if (tone === 'select') {
        context.strokeStyle = TONE_COLORS.select;
        context.lineWidth = 3 * px;
        context.beginPath();
        context.moveTo(p[4].x, p[4].y);
        context.lineTo(p[8].x, p[8].y);
        context.stroke();
    }

    // The index fingertip is the cursor.
    if (tone !== 'dim') {
        context.strokeStyle = tone === 'select' ? TONE_COLORS.select : '#ffffff';
        context.lineWidth = 2 * px;
        context.beginPath();
        context.arc(p[8].x, p[8].y, 8 * px, 0, Math.PI * 2);
        context.stroke();
    }

    // Holding a fist: a ring fills around the palm until it goes back.
    if (fistProgress > 0) {
        const radius = 22 * px;
        context.strokeStyle = 'rgba(239, 138, 115, 0.3)';
        context.lineWidth = 4 * px;
        context.beginPath();
        context.arc(p[9].x, p[9].y, radius, 0, Math.PI * 2);
        context.stroke();
        context.strokeStyle = TONE_COLORS.back;
        context.beginPath();
        context.arc(p[9].x, p[9].y, radius, -Math.PI / 2, -Math.PI / 2 + fistProgress * Math.PI * 2);
        context.stroke();
    }
}

function emitGestureFrame(points, handedness, now) {
    const target = toScreen(points[8]);
    const smoothing = HAND_CONFIG.cursor.smoothing;
    cursorX = cursorX === null ? target.x : cursorX * (1 - smoothing) + target.x * smoothing;
    cursorY = cursorY === null ? target.y : cursorY * (1 - smoothing) + target.y * smoothing;

    const palmSize = Math.max(distance(points[0], points[9]), 0.04);
    const pinchRatio = distance(points[4], points[8]) / palmSize;
    const extendedCount = [[8, 6], [12, 10], [16, 14], [20, 18]]
        .filter(([tip, pip]) => isFingerExtended(points, tip, pip)).length;
    const fist = extendedCount === 0 &&
        distance(points[4], points[9]) / palmSize < HAND_CONFIG.fist.thumbToPalmRatio;
    const result = gestures.update({ pinchRatio, x: cursorX, y: cursorY, fist, now });

    handCursor.style.left = `${cursorX}px`;
    handCursor.style.top = `${cursorY}px`;
    handCursor.classList.add('is-visible');
    handCursor.classList.toggle('is-pinching', result.pinching);
    handCursor.classList.toggle('is-dragging', result.dragging);
    handCursor.classList.remove('is-uncertain');

    const backEvent = result.events.find(event => event.type === 'back');
    const fistEvent = result.events.find(event => event.type === 'fist');
    if (backEvent && !inHub()) {
        window.dispatchEvent(new CustomEvent('handback'));
    }

    if (inHub() && !result.pinching && !fist) {
        const currentNavigationX = 1 - points[9].x;
        if (navigationX !== null) {
            const delta = currentNavigationX - navigationX;
            if (Math.abs(delta) >= HAND_CONFIG.cursor.navigationDeadZone) {
                window.dispatchEvent(new CustomEvent('handnavigate', {
                    detail: { delta: delta * HAND_CONFIG.cursor.navigationGain }
                }));
            }
        }
        navigationX = currentNavigationX;
    } else {
        navigationX = null;
    }

    window.dispatchEvent(new CustomEvent('handpointer', {
        detail: {
            x: cursorX,
            y: cursorY,
            events: result.events,
            pinching: result.pinching,
            dragging: result.dragging,
            fist,
            confidence: handedness?.score ?? 0.5
        }
    }));

    if (fist && !inHub()) {
        const progress = fistEvent?.progress ?? 0;
        drawScene(points, 'back', progress);
        setStatus('back', '주먹 · 뒤로 가기', progress >= 1 ? '뒤로 가는 중' : '주먹을 그대로\n쥐고 있으세요');
    } else if (fist) {
        drawScene(points, 'dim');
        setStatus('wait', '주먹', '손을 펴면 다시 움직여요');
    } else if (result.dragging) {
        drawScene(points, 'select');
        setStatus('select', '집어서 끄는 중', '손가락을 떼면 놓아요');
    } else if (result.pinching) {
        drawScene(points, 'select');
        setStatus('select', '집기 · 선택', inHub() ? '카드를 여는 중' : '손가락을 떼면\n다시 가리켜요');
    } else {
        drawScene(points, 'ready');
        setStatus('ready', '손 인식 중', inHub()
            ? '좌우로 움직여 넘기기\n집어서 열기'
            : '집어서 선택\n주먹을 쥐면 뒤로');
    }
}

function cancelInteraction() {
    gestures.cancel();
    window.dispatchEvent(new CustomEvent('handcancel'));
    cursorX = null;
    cursorY = null;
    navigationX = null;
    handCursor.classList.remove('is-visible', 'is-pinching', 'is-dragging', 'is-uncertain');
}

function handleTrackingLoss(now) {
    if (!trackingLostSince) trackingLostSince = now;
    if (now - trackingLostSince < HAND_CONFIG.tracking.lossGraceMs) {
        handCursor.classList.add('is-uncertain');
        setStatus('warn', '손을 다시 찾는 중');
        return;
    }
    handInRange = false;
    cancelInteraction();
    drawScene();
    setStatus('wait', '손을 찾고 있어요', '카메라 앞에\n손을 들어 보여 주세요');
}

function trackingLoop() {
    if (!running) return;
    const now = performance.now();

    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const result = landmarker.detectForVideo(video, now);
        const points = result.landmarks?.[0];
        const handedness = result.handedness?.[0]?.[0];

        if (!points) {
            handleTrackingLoss(now);
        } else {
            trackingLostSince = 0;
            const handSize = visibleHandSize(points);
            handInRange = handInRange
                ? handSize >= HAND_CONFIG.range.exitSize
                : handSize >= HAND_CONFIG.range.enterSize;

            if (!handInRange) {
                cancelInteraction();
                drawScene(points, 'dim');
                setStatus('warn', '손이 너무 멀어요', '카메라에\n조금 더 가까이 와 주세요');
            } else if (!palmWindingSign) {
                const calibrated = calibratePalm(points);
                cancelInteraction();
                drawScene(points, 'dim');
                setStatus('wait', calibrated ? '손바닥 확인 완료' : '손바닥 확인 중', '손가락을 펴고\n손바닥을 보여 주세요');
            } else if (palmWinding(points) !== palmWindingSign) {
                cancelInteraction();
                drawScene(points, 'warn');
                setStatus('warn', '손등이 보여요', '손바닥이\n카메라를 향하게 해 주세요');
            } else {
                emitGestureFrame(points, handedness, now);
            }
        }
    }

    animationFrame = requestAnimationFrame(trackingLoop);
}

async function createLandmarker() {
    if (landmarker) return;
    setStatus('wait', '준비 중', '손 인식 모델을\n불러오고 있어요');
    const wasmRoot = new URL('./vendor/mediapipe/wasm/', window.location.href).href;
    const vision = await FilesetResolver.forVisionTasks(wasmRoot);
    const modelAssetPath = new URL('./vendor/mediapipe/hand_landmarker.task', window.location.href).href;
    const options = {
        baseOptions: { modelAssetPath, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.58,
        minHandPresenceConfidence: 0.58,
        minTrackingConfidence: 0.52
    };

    try {
        landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch (gpuError) {
        console.warn('GPU hand tracking unavailable; using CPU.', gpuError);
        options.baseOptions = { modelAssetPath, delegate: 'CPU' };
        landmarker = await HandLandmarker.createFromOptions(vision, options);
    }
}

function resetSession() {
    gestures.reset();
    cursorX = null;
    cursorY = null;
    navigationX = null;
    handInRange = false;
    palmWindingSign = 0;
    palmCalibrationCandidate = 0;
    palmCalibrationFrames = 0;
    trackingLostSince = 0;
    lastVideoTime = -1;
}

function setToggleState(on) {
    toggle.setAttribute('aria-pressed', String(on));
    const label = on ? '손 인식 끄기' : '손 인식 켜기';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    document.body.classList.toggle('hand-tracking-on', on);
}

async function start() {
    if (running || starting) return;
    starting = true;
    clearTimeout(errorTimer);
    panel.hidden = false;
    toggle.classList.add('is-starting');
    sizeCanvas();
    drawScene();
    try {
        await createLandmarker();
        setStatus('wait', '카메라 연결 중', '카메라 사용을 묻는 창이\n뜨면 허용해 주세요');
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        });
        video.srcObject = stream;
        await video.play();
        sizeCanvas();
        updateArea();
        resetSession();
        running = true;
        setToggleState(true);
        drawScene();
        setStatus('wait', '손을 찾고 있어요', '카메라 앞에\n손바닥을 펴서 보여 주세요');
        trackingLoop();
    } catch (error) {
        console.error('Hand tracking failed:', error);
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
        setToggleState(false);
        setStatus('warn', '카메라를 쓸 수 없어요', error.name === 'NotAllowedError'
            ? '주소창 왼쪽에서 카메라를\n허용한 뒤 다시 눌러 주세요'
            : '카메라가 연결되어 있는지\n확인해 주세요');
        errorTimer = setTimeout(() => { if (!running) panel.hidden = true; }, 6000);
    } finally {
        starting = false;
        toggle.classList.remove('is-starting');
    }
}

function stop() {
    running = false;
    cancelAnimationFrame(animationFrame);
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    cancelInteraction();
    resetSession();
    setToggleState(false);
    panel.hidden = true;
    lastStatus = '';
}

// The toggle wears the same ink as the Home icon of whatever scene is open (dark on the light hub).
function matchSceneInk() {
    const insideScene = !inHub() && backButton;
    toggle.style.color = insideScene ? getComputedStyle(backButton).color : '';
}

toggle.addEventListener('click', event => {
    event.stopPropagation();
    if (running) stop();
    else start();
});
toggle.addEventListener('pointerdown', event => event.stopPropagation());
video.addEventListener('resize', () => { sizeCanvas(); updateArea(); });
window.addEventListener('pagehide', stop);
setInterval(matchSceneInk, 250);
matchSceneInk();
