export const HAND_CONFIG = Object.freeze({
    range: {
        enterSize: 0.16,
        exitSize: 0.13
    },
    palm: {
        windingThreshold: 0.008,
        calibrationFrames: 12
    },
    cursor: {
        smoothing: 0.36,
        navigationDeadZone: 0.0025,
        navigationGain: 5.0
    },
    pinch: {
        enterRatio: 0.46,
        exitRatio: 0.60,
        dragThresholdPx: 14
    },
    fist: {
        thumbToPalmRatio: 1.15,
        holdMs: 700
    },
    targeting: {
        hoverDwellMs: 120,
        magnetRadiusPx: 56
    },
    tracking: {
        lossGraceMs: 180
    },
    // The middle of the camera's view, kept at the screen's 16:9, maps onto the whole screen so the
    // index fingertip can reach every edge without the hand leaving the camera.
    area: {
        width: 0.76,
        centerY: 0.42
    },
    scroll: {
        travelPx: 54,
        resetTravelPx: 32,
        wheelDelta: 260
    }
});
