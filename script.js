// DOM Elements
const videoElement = document.getElementById('video-input');
const drawingCanvas = document.getElementById('drawing-canvas');
const handCanvas = document.getElementById('hand-canvas');
const effectsCanvas = document.getElementById('effects-canvas');
const loadingSpinner = document.querySelector('.loading-spinner');
const gestureNotification = document.getElementById('gesture-notification');
const notificationText = document.getElementById('notification-text');
const colorPalette = document.querySelector('.color-palette');
const colorOptions = document.querySelectorAll('.color-option');
const currentColorRing = document.querySelector('.current-color-ring');
const currentColorName = document.querySelector('.current-color-name');
const toggleGuideBtn = document.getElementById('toggle-guide');
const closeGuideBtn = document.getElementById('close-guide');
const gestureGuide = document.querySelector('.gesture-guide');
const clearSound = document.getElementById('clear-sound');
const colorChangeSound = document.getElementById('color-change-sound');

// Add screen flash element for clear effect
const screenFlash = document.createElement('div');
screenFlash.className = 'screen-flash';
document.body.appendChild(screenFlash);

// Canvas Setup
const drawingCtx = drawingCanvas.getContext('2d');
const handCtx = handCanvas.getContext('2d');
const effectsCtx = effectsCanvas.getContext('2d');

// Initialize canvas size
function setupCanvasSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Set canvas sizes
    drawingCanvas.width = width;
    drawingCanvas.height = height;
    handCanvas.width = width;
    handCanvas.height = height;
    effectsCanvas.width = width;
    effectsCanvas.height = height;
}

// Set initial canvas size
setupCanvasSize();

// Re-size canvas on window resize
window.addEventListener('resize', setupCanvasSize);

// Colors with effects
const colors = {
    red: { 
        value: 'rgba(255, 51, 102, 1)', 
        glow: 'rgba(255, 51, 102, 0.4)', 
        size: 8, 
        effect: 'glow',
        name: 'Fire Magic'
    },
    blue: { 
        value: 'rgba(51, 102, 255, 1)', 
        glow: 'rgba(51, 102, 255, 0.4)', 
        size: 8, 
        effect: 'shimmer',
        name: 'Ice Magic'
    },
    green: { 
        value: 'rgba(51, 255, 102, 1)', 
        glow: 'rgba(51, 255, 102, 0.4)', 
        size: 8, 
        effect: 'pulse',
        name: 'Nature Magic'
    },
    yellow: { 
        value: 'rgba(255, 204, 51, 1)', 
        glow: 'rgba(255, 204, 51, 0.4)', 
        size: 8, 
        effect: 'sparkle',
        name: 'Light Magic'
    }
};

const colorNames = Object.keys(colors);

// Drawing state
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = colors.red;
let currentColorIndex = 0;
let brushSize = 8;
let points = [];
const maxPoints = 15; // For stroke smoothing

// Hand tracking state
let handTrails = []; // Store hand movement trails
const maxTrailPoints = 20;
let currentGesture = 'none';
let bothFistsTimer = null;
let bothFistsStartTime = null;
let fistClearThreshold = 1000; // Reduce to 1 second (was 1500ms)
let isPinching = false;
let lastPinchTime = 0;
let pinchCooldown = 500; // ms between pinch color changes
let lastPinchState = false; // Track previous pinch state

// UI state
let isColorPaletteVisible = false;

// MediaPipe Hands setup
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

hands.onResults(onHandResults);

// Camera setup
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 1280,
    height: 720
});

// Start camera
async function startCamera() {
    try {
        await camera.start();
        // Show splash screen for longer
        setTimeout(() => {
            // Add fade-out animation class
            loadingSpinner.classList.add('fade-out');
            
            // Hide completely after animation completes
            setTimeout(() => {
                loadingSpinner.style.display = 'none';
                
                // Show welcome notification
                showNotification('Welcome to AirBrush by AbdulRehman!', 'success');
            }, 1000);
        }, 3000); // Show splash for 3 seconds
    } catch (error) {
        console.error('Error starting camera:', error);
        showNotification('Camera access denied or not available', 'error');
    }
}

// Button event listeners
toggleGuideBtn.addEventListener('click', function(e) {
    e.preventDefault(); // Prevent default button behavior
    gestureGuide.classList.toggle('visible');
    console.log('Toggle guide button clicked'); // Debug log
    
    // Add visual feedback for button click
    this.classList.add('clicked');
    setTimeout(() => {
        this.classList.remove('clicked');
    }, 200);
});

closeGuideBtn.addEventListener('click', function(e) {
    e.preventDefault(); // Prevent default button behavior
    gestureGuide.classList.remove('visible');
    console.log('Close guide button clicked'); // Debug log
});

// Color options event listeners
colorOptions.forEach(option => {
    option.addEventListener('click', () => {
        const colorName = option.getAttribute('data-color');
        setCurrentColor(colorName);
        colorPalette.classList.remove('visible');
        isColorPaletteVisible = false;
    });
});

// Start everything
startCamera();

// Handle hand tracking results
function onHandResults(results) {
    // Clear hand canvas for new frame
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Process each hand
        const handsData = results.multiHandLandmarks.map((landmarks, index) => {
            const handedness = results.multiHandedness[index].label;
            return { landmarks, handedness };
        });
        
        // Update hand trails
        updateHandTrails(handsData);
        
        // Draw hand landmarks and trails on canvases
        drawHandLandmarks(handsData);
        drawHandTrails();
        
        // Check gestures and handle drawing
        handleGestures(handsData);
    } else {
        // No hands detected, reset drawing state
        isDrawing = false;
        isPinching = false;
        resetBothFistsTimer();
    }
}

// Update hand movement trails
function updateHandTrails(handsData) {
    handsData.forEach(({ landmarks, handedness }) => {
        // Only track index finger tip for trails
        const indexTip = landmarks[8];
        
        // Get screen coordinates - fixed to match drawing coordinates
        const x = indexTip.x * handCanvas.width;
        const y = indexTip.y * handCanvas.height;
        
        // Add to trail
        if (!handTrails[handedness]) {
            handTrails[handedness] = [];
        }
        
        handTrails[handedness].push({ x, y, time: Date.now() });
        
        // Limit trail length
        if (handTrails[handedness].length > maxTrailPoints) {
            handTrails[handedness].shift();
        }
    });
    
    // Remove old trail points (older than 500ms)
    Object.keys(handTrails).forEach(hand => {
        const now = Date.now();
        handTrails[hand] = handTrails[hand].filter(point => now - point.time < 500);
    });
}

// Draw hand trails on the effects canvas
function drawHandTrails() {
    effectsCtx.save();
    
    Object.keys(handTrails).forEach(hand => {
        const trail = handTrails[hand];
        if (trail.length < 2) return;
        
        // Draw trail with gradient
        for (let i = 0; i < trail.length - 1; i++) {
            const point = trail[i];
            const nextPoint = trail[i + 1];
            const age = 1 - (Date.now() - point.time) / 500; // 0 to 1 based on age
            
            effectsCtx.beginPath();
            effectsCtx.moveTo(point.x, point.y);
            effectsCtx.lineTo(nextPoint.x, nextPoint.y);
            
            // Set color based on current magic color
            const trailColor = currentColor.value.replace('1)', `${age * 0.6})`);
            effectsCtx.strokeStyle = trailColor;
            effectsCtx.lineWidth = 4 * age;
            effectsCtx.stroke();
            
            // Add glow effect
            effectsCtx.shadowColor = currentColor.glow;
            effectsCtx.shadowBlur = 10;
            
            // Draw small particles along the trail
            if (i % 3 === 0) {
                effectsCtx.beginPath();
                effectsCtx.arc(point.x, point.y, 3 * age, 0, Math.PI * 2);
                effectsCtx.fillStyle = currentColor.glow.replace('0.4)', `${age})`);
                effectsCtx.fill();
            }
        }
    });
    
    effectsCtx.restore();
}

// Draw hand landmarks on the hand canvas
function drawHandLandmarks(handsData) {
    handCtx.save();
    
    handsData.forEach(({ landmarks, handedness }) => {
        // Draw connections between landmarks
        drawConnectors(handCtx, landmarks, HAND_CONNECTIONS, { 
            color: 'rgba(255, 255, 255, 0.5)', 
            lineWidth: 3 
        });
        
        // Draw landmarks
        drawLandmarks(handCtx, landmarks, {
            color: 'rgba(138, 43, 226, 0.8)',
            fillColor: 'rgba(255, 255, 255, 1)',
            lineWidth: 1,
            radius: (landmark) => {
                // Make finger tips larger
                if ([4, 8, 12, 16, 20].includes(landmark.index)) return 6;
                return 4;
            }
        });
        
        // Draw magic glow around index fingertip (landmark 8)
        if (landmarks[8]) {
            const x = landmarks[8].x * handCanvas.width;
            const y = landmarks[8].y * handCanvas.height;
            
            // Outer glow
            handCtx.beginPath();
            handCtx.arc(x, y, 15, 0, Math.PI * 2);
            const gradient = handCtx.createRadialGradient(x, y, 5, x, y, 15);
            gradient.addColorStop(0, currentColor.value.replace('1)', '0.8)'));
            gradient.addColorStop(1, currentColor.value.replace('1)', '0)'));
            handCtx.fillStyle = gradient;
            handCtx.fill();
            
            // Inner circle
            handCtx.beginPath();
            handCtx.arc(x, y, 8, 0, Math.PI * 2);
            handCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            handCtx.strokeStyle = currentColor.value;
            handCtx.lineWidth = 2;
            handCtx.fill();
            handCtx.stroke();
            
            // Check if pinching
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            const distance = calculateDistance(thumbTip, indexTip);
            
            // If thumb and index finger are close together
            const isPinchingNow = distance < 0.1; // Increased threshold for easier detection (was 0.05)
            
            if (isPinchingNow) {
                // Draw pinch visual indicator
                handCtx.beginPath();
                handCtx.arc(x, y, 20, 0, Math.PI * 2);
                handCtx.strokeStyle = 'white';
                handCtx.lineWidth = 3;
                handCtx.stroke();
                
                // Draw additional pinch feedback
                handCtx.beginPath();
                handCtx.arc(x, y, 25, 0, Math.PI * 2);
                handCtx.strokeStyle = currentColor.value;
                handCtx.lineWidth = 2;
                handCtx.setLineDash([5, 5]);
                handCtx.stroke();
                handCtx.setLineDash([]);
                
                // Handle pinch gesture - only trigger on pinch start
                if (!lastPinchState) {
                    handlePinchGesture();
                }
                lastPinchState = true;
            } else {
                lastPinchState = false;
                isPinching = false;
            }
        }
    });
    
    handCtx.restore();
}

// Calculate distance between two landmarks
function calculateDistance(landmark1, landmark2) {
    const dx = landmark1.x - landmark2.x;
    const dy = landmark1.y - landmark2.y;
    const dz = landmark1.z - landmark2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Handle pinch gesture for color selection
function handlePinchGesture() {
    const now = Date.now();
    
    // Change color immediately on pinch
    currentColorIndex = (currentColorIndex + 1) % colorNames.length;
    setCurrentColor(colorNames[currentColorIndex]);
    isPinching = true;
    lastPinchTime = now;
    
    // Show color palette and keep it visible longer
    colorPalette.classList.add('visible');
    isColorPaletteVisible = true;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        colorPalette.classList.remove('visible');
        isColorPaletteVisible = false;
    }, 5000);
    
    // Play color change sound
    colorChangeSound.currentTime = 0;
    colorChangeSound.play().catch(e => console.log('Sound play error:', e));
    
    // Add visual feedback for color change
    screenFlash.style.backgroundColor = currentColor.value;
    screenFlash.style.opacity = '0.3';
    setTimeout(() => {
        screenFlash.style.opacity = '0';
    }, 300);
}

// Handle gestures for drawing and clear canvas
function handleGestures(handsData) {
    // Count fists
    let fistCount = 0;
    
    // Process hand gestures
    handsData.forEach(({ landmarks, handedness }) => {
        // Improved fist detection
        if (isFist(landmarks)) {
            fistCount++;
        }
        
        // Drawing with index finger (use primary hand if available)
        if (handedness === 'Right' || handsData.length === 1) {
            // Get index fingertip position (landmark 8)
            const indexTip = landmarks[8];
            // Fixed drawing coordinates - use direct mapping without flipping X
            const x = indexTip.x * drawingCanvas.width; 
            const y = indexTip.y * drawingCanvas.height;
            
            // Check if index finger is extended
            if (isIndexFingerExtended(landmarks) && !isPinching) {
                handleDrawing(x, y, true);
            } else {
                isDrawing = false;
            }
        }
    });
    
    // Handle both fists gesture for clearing canvas
    if (fistCount === 2) {
        handleBothFists();
    } else {
        resetBothFistsTimer();
    }
}

// Improved fist detection
function isFist(landmarks) {
    // Get finger tips and bases
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    
    const wrist = landmarks[0];
    const indexMcp = landmarks[5]; // Base of index finger
    const middleMcp = landmarks[9]; // Base of middle finger
    const ringMcp = landmarks[13]; // Base of ring finger
    const pinkyMcp = landmarks[17]; // Base of pinky finger
    
    // Check if all fingertips are curled in (closer to wrist than their bases)
    const thumbCurled = thumbTip.x > indexMcp.x; // Different check for thumb
    const indexCurled = indexTip.y > indexMcp.y;
    const middleCurled = middleTip.y > middleMcp.y;
    const ringCurled = ringTip.y > ringMcp.y;
    const pinkyCurled = pinkyTip.y > pinkyMcp.y;
    
    // Consider it a fist if at least 4 fingers are curled
    const curledCount = [thumbCurled, indexCurled, middleCurled, ringCurled, pinkyCurled]
        .filter(curled => curled).length;
    
    return curledCount >= 4;
}

// Check if index finger is extended
function isIndexFingerExtended(landmarks) {
    const indexTip = landmarks[8];
    const indexPip = landmarks[6]; // Middle joint of index finger
    const indexMcp = landmarks[5]; // Base of index finger
    
    return indexTip.y < indexPip.y && indexPip.y < indexMcp.y;
}

// Handle drawing on canvas
function handleDrawing(x, y, shouldDraw) {
    if (shouldDraw) {
        if (!isDrawing) {
            // Start a new path
            isDrawing = true;
            lastX = x;
            lastY = y;
            points = [{ x, y }];
        } else {
            // Add point to our collection for smoothing
            points.push({ x, y });
            if (points.length > maxPoints) {
                points.shift();
            }
            
            // Draw a smooth line
            drawSmoothLine();
        }
    } else {
        isDrawing = false;
        points = [];
    }
}

// Draw a smooth line using the collected points
function drawSmoothLine() {
    if (points.length < 2) return;
    
    // Get the latest point
    const currentPoint = points[points.length - 1];
    
    // Draw a line from the last position to the current position
    drawingCtx.beginPath();
    
    // Line style based on current color
    drawingCtx.strokeStyle = currentColor.value;
    drawingCtx.lineWidth = currentColor.size;
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';
    
    // Shadow for glow effect
    drawingCtx.shadowColor = currentColor.glow;
    drawingCtx.shadowBlur = 20;
    
    // Draw from last position to current
    drawingCtx.moveTo(lastX, lastY);
    drawingCtx.lineTo(currentPoint.x, currentPoint.y);
    drawingCtx.stroke();
    
    // Apply special effects based on current color
    applyStrokeEffect(lastX, lastY, currentPoint.x, currentPoint.y);
    
    // Update last position
    lastX = currentPoint.x;
    lastY = currentPoint.y;
}

// Apply special effects to the stroke based on the current color
function applyStrokeEffect(x1, y1, x2, y2) {
    switch (currentColor.effect) {
        case 'glow':
            // Enhanced glow effect
            drawingCtx.beginPath();
            drawingCtx.arc(x2, y2, 3, 0, Math.PI * 2);
            drawingCtx.fillStyle = currentColor.value;
            drawingCtx.fill();
            break;
            
        case 'shimmer':
            // Add small particles along the path
            const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            const particleCount = Math.ceil(distance / 8);
            
            for (let i = 0; i < particleCount; i++) {
                const ratio = i / particleCount;
                const x = x1 + (x2 - x1) * ratio;
                const y = y1 + (y2 - y1) * ratio;
                
                // Random offset
                const offsetX = (Math.random() - 0.5) * 8;
                const offsetY = (Math.random() - 0.5) * 8;
                
                // Draw shimmer particle
                drawingCtx.beginPath();
                drawingCtx.arc(x + offsetX, y + offsetY, Math.random() * 2 + 1, 0, Math.PI * 2);
                drawingCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                drawingCtx.fill();
            }
            break;
            
        case 'pulse':
            // Add pulse waves at intervals
            if (Math.random() < 0.05) {
                createPulseWave(x2, y2);
            }
            break;
            
        case 'sparkle':
            // Add sparkle particles at the end point
            for (let i = 0; i < 3; i++) {
                const size = Math.random() * 4 + 1;
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * 15 + 5;
                const sparkleX = x2 + Math.cos(angle) * distance;
                const sparkleY = y2 + Math.sin(angle) * distance;
                
                // Draw sparkle
                drawingCtx.beginPath();
                drawingCtx.arc(sparkleX, sparkleY, size, 0, Math.PI * 2);
                drawingCtx.fillStyle = 'rgba(255, 235, 128, 0.8)';
                drawingCtx.fill();
            }
            break;
    }
}

// Create a pulse wave effect
function createPulseWave(x, y) {
    let radius = 5;
    let opacity = 0.7;
    
    function animatePulse() {
        if (opacity <= 0) return;
        
        drawingCtx.beginPath();
        drawingCtx.arc(x, y, radius, 0, Math.PI * 2);
        drawingCtx.strokeStyle = currentColor.value.replace('1)', `${opacity})`);
        drawingCtx.lineWidth = 2;
        drawingCtx.stroke();
        
        radius += 2;
        opacity -= 0.05;
        
        requestAnimationFrame(animatePulse);
    }
    
    animatePulse();
}

// Handle both fists gesture for clearing canvas
function handleBothFists() {
    if (bothFistsStartTime === null) {
        bothFistsStartTime = Date.now();
        bothFistsTimer = setTimeout(() => {
            clearCanvas();
        }, fistClearThreshold);
        
        // Show notification
        showNotification('Hold both fists to clear canvas... 0%', 'info');
    } else {
        const elapsedTime = Date.now() - bothFistsStartTime;
        const progress = Math.min(elapsedTime / fistClearThreshold, 1);
        
        // Update notification with progress
        if (progress < 1) {
            showNotification(`Hold both fists to clear canvas... ${Math.round(progress * 100)}%`, 'info');
        }
    }
}

// Reset both fists timer
function resetBothFistsTimer() {
    if (bothFistsTimer !== null) {
        clearTimeout(bothFistsTimer);
        bothFistsTimer = null;
        bothFistsStartTime = null;
        hideNotification();
    }
}

// Clear the canvas with animation
function clearCanvas() {
    // Get canvas data
    const ctx = drawingCtx;
    const canvas = drawingCanvas;
    const width = canvas.width;
    const height = canvas.height;
    
    // Play clear sound
    clearSound.currentTime = 0;
    clearSound.play().catch(e => console.log('Sound play error:', e));
    
    // Show notification
    showNotification('Canvas cleared with magic!', 'success');
    
    // Screen flash effect
    screenFlash.style.animation = 'flash 0.6s forwards';
    setTimeout(() => {
        screenFlash.style.animation = '';
    }, 600);
    
    // Prepare burn away particles
    const particles = [];
    const particleCount = 200;
    
    // Create particles from different points on screen
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 10 + 5,
            speedX: (Math.random() - 0.5) * 10,
            speedY: (Math.random() - 0.5) * 10,
            opacity: 1,
            color: getRandomColor()
        });
    }
    
    // Clear canvas immediately
    ctx.clearRect(0, 0, width, height);
    
    // Animate particles
    let frame = 0;
    function animateParticles() {
        ctx.clearRect(0, 0, width, height);
        
        // Draw and update particles
        particles.forEach(particle => {
            particle.x += particle.speedX;
            particle.y += particle.speedY;
            particle.opacity -= 0.02;
            particle.size -= 0.1;
            
            if (particle.opacity > 0 && particle.size > 0) {
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fillStyle = particle.color.replace('1)', `${particle.opacity})`);
                ctx.shadowColor = particle.color;
                ctx.shadowBlur = 10;
                ctx.fill();
            }
        });
        
        frame++;
        if (frame < 60) {
            requestAnimationFrame(animateParticles);
        }
    }
    
    // Start animation
    animateParticles();
    
    // Reset drawing state
    isDrawing = false;
    points = [];
    resetBothFistsTimer();
}

// Get random color from our color palette
function getRandomColor() {
    const colorKeys = Object.keys(colors);
    const randomColor = colors[colorKeys[Math.floor(Math.random() * colorKeys.length)]];
    return randomColor.value;
}

// Set current color and update UI
function setCurrentColor(colorName) {
    if (!colors[colorName]) return;
    
    // Only update if the color is changing
    if (currentColor !== colors[colorName]) {
        // Update current color
        currentColor = colors[colorName];
        currentColorIndex = colorNames.indexOf(colorName);
        
        // Update color ring
        currentColorRing.style.backgroundColor = currentColor.value;
        currentColorRing.style.boxShadow = `0 0 15px ${currentColor.value}`;
        
        // Update color name
        currentColorName.textContent = currentColor.name;
        
        // Update active state in palette
        colorOptions.forEach(option => {
            const optionColor = option.getAttribute('data-color');
            if (optionColor === colorName) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
        
        // Show notification
        showNotification(`Color changed to ${currentColor.name}`, 'color');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    notificationText.textContent = message;
    gestureNotification.className = ''; // Reset classes
    gestureNotification.classList.add('visible');
    
    // Add type-specific class
    gestureNotification.classList.add(`notification-${type}`);
    
    // Hide after 2 seconds for normal messages
    if (type !== 'info') {
        setTimeout(hideNotification, 2000);
    }
}

// Hide notification
function hideNotification() {
    gestureNotification.classList.remove('visible');
}

// Set initial active color
setCurrentColor('red'); 