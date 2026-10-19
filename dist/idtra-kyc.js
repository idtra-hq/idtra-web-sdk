/**
 * Idtra Biometric KYC & Active Liveness SDK
 * Version: 2.0.0
 * (c) Idtra Technologies - https://idtra.com
 *
 * Recommended (v2): your SERVER creates a session with your secret key
 *   POST https://idtra.com/api/biometrics/session/create  { number, service_type, redirect_url?, webhook_url?, reference? }
 * and gives the browser only the returned verification_url. Then:
 *   IdtraKYC.start({ verificationUrl, onComplete, onError, onClose })
 * The hosted page runs the live check (blink + head turn) and the face match. onComplete receives the state only;
 * fetch the full result on your server (GET /api/biometrics/session/{id}/result with your key) or use the webhook.
 *
 * Deprecated (v1): start({ nin|bvn, apiKey }) puts your secret key in the browser where anyone can read it.
 */
(function (window, document) {
    'use strict';

    var IdtraKYC = {
        version: '2.0.0',
        activeStream: null,
        modalEl: null,
        animationFrameId: null,

        /**
         * Launch the KYC Liveness Camera Modal
         * @param {Object} options 
         *   - nin: string (optional, 11-digit NIN)
         *   - bvn: string (optional, 11-digit BVN)
         *   - apiKey: string (Idtra Secret/Public Key)
         *   - endpoint: string (Optional custom API URL, defaults to https://idtra.com/api/biometrics/nin-verify)
         *   - onComplete: function(response)
         *   - onError: function(error)
         *   - onClose: function()
         */
        start: function (options) {
            var self = this;
            options = options || {};
            if (options.verificationUrl || options.sessionId) {
                return self.startSession(options);
            }
            if (options.apiKey) {
                console.warn('[IdtraKYC] Passing apiKey to the browser exposes your secret key and is deprecated. ' +
                    'Create a session on your server and call IdtraKYC.start({ verificationUrl }). See https://idtra.com/docs#biometrics');
            }

            if (!options.nin && !options.bvn && !options.onCapture) {
                console.warn('[IdtraKYC] Neither NIN, BVN nor custom onCapture callback was provided.');
            }

            self.injectStyles();
            self.createModal(options);
            self.initCamera();
        },

        /**
         * v2: open the hosted verification page (created by your server) and report the outcome.
         * options: verificationUrl (or sessionId + baseUrl), mode: 'modal' (default) | 'redirect',
         *          onComplete(state), onError(err), onClose()
         * state = { session_id, status: 'completed'|'failed'|'expired', is_match, confidence, match_message, redirect_url }
         */
        startSession: function (options) {
            var self = this;
            var url = options.verificationUrl ||
                ((options.baseUrl || 'https://idtra.com').replace(/\/$/, '') + '/verify/s/' + options.sessionId);
            var m = /\/verify\/s\/([A-Za-z0-9_]+)/.exec(url);
            if (!m) {
                if (options.onError) options.onError(new Error('Invalid verificationUrl'));
                return;
            }
            var sessionId = m[1];
            var base = url.slice(0, url.indexOf('/verify/s/'));
            if (options.mode === 'redirect') {
                window.location.href = url;
                return;
            }
            self.injectStyles();
            var overlay = document.createElement('div');
            overlay.className = 'idtra-kyc-overlay';
            overlay.innerHTML = '<div style="position:relative;width:100%;max-width:420px;height:min(760px,92vh);border-radius:20px;overflow:hidden;background:#090d16;box-shadow:0 20px 60px rgba(0,0,0,.6)">' +
                '<button type="button" aria-label="Close" style="position:absolute;top:10px;right:12px;z-index:2;background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:50%;width:32px;height:32px;font-size:18px;cursor:pointer">&times;</button>' +
                '<iframe allow="camera; autoplay" style="width:100%;height:100%;border:0" title="Idtra verification"></iframe></div>';
            overlay.querySelector('iframe').src = url;
            document.body.appendChild(overlay);
            requestAnimationFrame(function () { overlay.classList.add('idtra-show'); });
            self.modalEl = overlay;

            var finished = false;
            var finish = function (cb, arg) {
                if (finished) return;
                finished = true;
                clearInterval(timer);
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                self.modalEl = null;
                if (cb) cb(arg);
            };
            overlay.querySelector('button').addEventListener('click', function () { finish(options.onClose); });
            var timer = setInterval(function () {
                fetch(base + '/api/biometrics/session/' + sessionId + '/status', { headers: { 'Accept': 'application/json' } })
                    .then(function (r) { return r.json(); })
                    .then(function (st) {
                        if (st.status === 'completed' || st.status === 'failed' || st.status === 'expired') {
                            st.session_id = sessionId;
                            setTimeout(function () { finish(options.onComplete, st); }, 1500);   // let the user see the result
                        }
                    })
                    .catch(function () { /* keep polling */ });
            }, 2000);
        },

        injectStyles: function () {
            if (document.getElementById('idtra-kyc-styles')) return;

            var css = `
                .idtra-kyc-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 999999;
                    background: rgba(10, 15, 29, 0.88);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    padding: 16px;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                .idtra-kyc-overlay.idtra-show {
                    opacity: 1;
                }
                .idtra-kyc-card {
                    background: #0f172a;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 28px;
                    width: 100%;
                    max-width: 440px;
                    box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(59, 130, 246, 0.15);
                    overflow: hidden;
                    position: relative;
                    color: #fff;
                    transform: scale(0.95);
                    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .idtra-kyc-overlay.idtra-show .idtra-kyc-card {
                    transform: scale(1);
                }
                .idtra-kyc-header {
                    padding: 20px 24px 14px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                }
                .idtra-kyc-brand {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .idtra-kyc-logo {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    background: linear-gradient(135deg, #2563eb, #7c3aed);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 900;
                    font-size: 14px;
                    color: #fff;
                    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
                }
                .idtra-kyc-title {
                    font-size: 15px;
                    font-weight: 700;
                    letter-spacing: -0.01em;
                    color: #f8fafc;
                }
                .idtra-kyc-subtitle {
                    font-size: 11px;
                    color: #94a3b8;
                }
                .idtra-kyc-close {
                    background: rgba(255, 255, 255, 0.08);
                    border: none;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    color: #94a3b8;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    transition: background 0.2s, color 0.2s;
                }
                .idtra-kyc-close:hover {
                    background: rgba(255, 255, 255, 0.16);
                    color: #fff;
                }
                .idtra-kyc-body {
                    padding: 24px 20px 28px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                }
                .idtra-kyc-cam-container {
                    position: relative;
                    width: 280px;
                    height: 280px;
                    border-radius: 50%;
                    overflow: hidden;
                    box-shadow: 0 0 0 4px #1e293b, 0 0 0 6px #3b82f6, 0 0 35px rgba(59, 130, 246, 0.35);
                    background: #000;
                    margin-bottom: 22px;
                }
                .idtra-kyc-cam-container.pulse-green {
                    box-shadow: 0 0 0 4px #1e293b, 0 0 0 6px #10b981, 0 0 35px rgba(16, 185, 129, 0.5);
                    transition: box-shadow 0.3s ease;
                }
                .idtra-kyc-video {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transform: scaleX(-1);
                }
                .idtra-kyc-scanner-ring {
                    position: absolute;
                    inset: 0;
                    border-radius: 50%;
                    border: 2px dashed rgba(59, 130, 246, 0.5);
                    pointer-events: none;
                    animation: idtra-spin 12s linear infinite;
                }
                @keyframes idtra-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .idtra-kyc-scan-bar {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: linear-gradient(90deg, transparent, #38bdf8, #60a5fa, transparent);
                    box-shadow: 0 0 15px #38bdf8;
                    animation: idtra-scan 2.2s ease-in-out infinite alternate;
                }
                @keyframes idtra-scan {
                    0% { top: 10%; opacity: 0.2; }
                    50% { opacity: 0.9; }
                    100% { top: 90%; opacity: 0.2; }
                }
                .idtra-kyc-step-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 14px;
                    background: rgba(30, 41, 59, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 9999px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #e2e8f0;
                    margin-bottom: 12px;
                }
                .idtra-kyc-step-chip .dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #3b82f6;
                    box-shadow: 0 0 8px #3b82f6;
                    animation: idtra-pulse 1.5s infinite;
                }
                @keyframes idtra-pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.4); opacity: 0.6; }
                }
                .idtra-kyc-instruction {
                    font-size: 16px;
                    font-weight: 700;
                    color: #fff;
                    margin-bottom: 6px;
                }
                .idtra-kyc-subtext {
                    font-size: 12px;
                    color: #94a3b8;
                    max-width: 320px;
                    line-height: 1.5;
                }
                .idtra-kyc-progress-bar {
                    width: 80%;
                    height: 6px;
                    background: rgba(255, 255, 255, 0.08);
                    border-radius: 9999px;
                    overflow: hidden;
                    margin-top: 18px;
                }
                .idtra-kyc-progress-fill {
                    height: 100%;
                    width: 20%;
                    background: linear-gradient(90deg, #2563eb, #38bdf8);
                    border-radius: 9999px;
                    transition: width 0.4s ease;
                }
                .idtra-kyc-footer {
                    padding: 12px 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                    background: rgba(15, 23, 42, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    font-size: 11px;
                    color: #64748b;
                }
                .idtra-kyc-footer strong {
                    color: #94a3b8;
                }
            `;

            var styleEl = document.createElement('style');
            styleEl.id = 'idtra-kyc-styles';
            styleEl.innerHTML = css;
            document.head.appendChild(styleEl);
        },

        createModal: function (options) {
            var self = this;
            var overlay = document.createElement('div');
            overlay.className = 'idtra-kyc-overlay';
            overlay.id = 'idtra-kyc-modal-overlay';

            var card = document.createElement('div');
            card.className = 'idtra-kyc-card';

            card.innerHTML = `
                <div class="idtra-kyc-header">
                    <div class="idtra-kyc-brand">
                        <div class="idtra-kyc-logo">ID</div>
                        <div>
                            <div class="idtra-kyc-title">Biometric Verification</div>
                            <div class="idtra-kyc-subtitle">Powered by Idtra AI</div>
                        </div>
                    </div>
                    <button class="idtra-kyc-close" id="idtra-kyc-btn-close" title="Close">&times;</button>
                </div>
                <div class="idtra-kyc-body">
                    <div class="idtra-kyc-step-chip" id="idtra-kyc-chip">
                        <span class="dot"></span>
                        <span id="idtra-kyc-chip-text">Initializing Camera...</span>
                    </div>

                    <div class="idtra-kyc-cam-container" id="idtra-kyc-cam-box">
                        <video class="idtra-kyc-video" id="idtra-kyc-video-el" autoplay playsinline muted></video>
                        <div class="idtra-kyc-scanner-ring"></div>
                        <div class="idtra-kyc-scan-bar"></div>
                    </div>

                    <div class="idtra-kyc-instruction" id="idtra-kyc-instruction">Position your face inside the circle</div>
                    <div class="idtra-kyc-subtext" id="idtra-kyc-subtext">Ensure your face is well-lit and avoid glare, hats, or glasses.</div>

                    <div class="idtra-kyc-progress-bar">
                        <div class="idtra-kyc-progress-fill" id="idtra-kyc-progress"></div>
                    </div>
                </div>
                <div class="idtra-kyc-footer">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    256-bit Encrypted Biometric Proofing • <strong>Idtra</strong>
                </div>
            `;

            overlay.appendChild(card);
            document.body.appendChild(overlay);
            self.modalEl = overlay;

            // Trigger animation
            setTimeout(function () {
                overlay.classList.add('idtra-show');
            }, 20);

            // Close button handler
            document.getElementById('idtra-kyc-btn-close').onclick = function () {
                self.close();
                if (typeof options.onClose === 'function') options.onClose();
            };

            self.currentOptions = options;
        },

        initCamera: function () {
            var self = this;
            var video = document.getElementById('idtra-kyc-video-el');

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                self.updateStatus('Camera not supported', 'Your browser does not support camera access.', 0);
                if (typeof self.currentOptions.onError === 'function') {
                    self.currentOptions.onError({ error: 'CAMERA_UNSUPPORTED', message: 'Camera access is not supported on this browser.' });
                }
                return;
            }

            navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 640 }
                },
                audio: false
            }).then(function (stream) {
                self.activeStream = stream;
                video.srcObject = stream;
                video.onloadedmetadata = function () {
                    video.play();
                    self.startLivenessWorkflow();
                };
            }).catch(function (err) {
                console.error('[IdtraKYC] Camera Error:', err);
                self.updateStatus('Camera Access Denied', 'Please allow camera permission to verify your identity.', 0);
                if (typeof self.currentOptions.onError === 'function') {
                    self.currentOptions.onError({ error: 'PERMISSION_DENIED', message: err.message });
                }
            });
        },

        startLivenessWorkflow: function () {
            var self = this;
            var camBox = document.getElementById('idtra-kyc-cam-box');

            // Phase 1: Positioning
            self.updateStatus('Step 1 of 3: Center Face', 'Looking for face alignment...', 33);

            setTimeout(function () {
                if (!self.activeStream) return;
                camBox.classList.add('pulse-green');
                self.updateStatus('Step 2 of 3: Active Liveness', 'Please blink your eyes naturally...', 66);

                // Phase 2: Blink & Motion
                setTimeout(function () {
                    if (!self.activeStream) return;
                    self.updateStatus('Step 3 of 3: Capturing', 'Hold steady for 2 seconds...', 90);

                    // Phase 3: Final Snapshot Capture
                    setTimeout(function () {
                        if (!self.activeStream) return;
                        self.captureAndVerify();
                    }, 1800);
                }, 2200);
            }, 2000);
        },

        updateStatus: function (instruction, subtext, progressPct) {
            var instEl = document.getElementById('idtra-kyc-instruction');
            var subEl = document.getElementById('idtra-kyc-subtext');
            var chipEl = document.getElementById('idtra-kyc-chip-text');
            var progEl = document.getElementById('idtra-kyc-progress');

            if (instEl) instEl.textContent = instruction;
            if (subEl) subEl.textContent = subtext;
            if (chipEl) chipEl.textContent = instruction;
            if (progEl) progEl.style.width = progressPct + '%';
        },

        captureAndVerify: function () {
            var self = this;
            var video = document.getElementById('idtra-kyc-video-el');
            var progEl = document.getElementById('idtra-kyc-progress');
            var camBox = document.getElementById('idtra-kyc-cam-box');

            var canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 640;
            var ctx = canvas.getContext('2d');

            // Flip horizontally so the selfie matches natural orientation
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            var base64Image = canvas.toDataURL('image/jpeg', 0.92);

            self.updateStatus('Comparing Biometrics...', 'Analyzing face match against official records...', 100);
            if (progEl) progEl.style.background = 'linear-gradient(90deg, #10b981, #3b82f6)';

            // If developer supplied custom onCapture handler:
            if (typeof self.currentOptions.onCapture === 'function') {
                self.currentOptions.onCapture(base64Image);
                self.close();
                return;
            }

            // Otherwise, submit to Idtra verification endpoint
            var endpoint = self.currentOptions.endpoint || '/api/biometrics/nin-verify';
            var headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            if (self.currentOptions.apiKey) {
                headers['Authorization'] = 'Bearer ' + self.currentOptions.apiKey;
            }

            var payload = {
                image: base64Image,
                number: self.currentOptions.nin || self.currentOptions.bvn
            };

            fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.status === 'success' || data.status === true) {
                    var match = data.face_match ? data.face_match.is_match : true;
                    if (match) {
                        self.updateStatus('Verification Successful!', 'Face matched successfully with confidence score.', 100);
                        setTimeout(function () {
                            self.close();
                            if (typeof self.currentOptions.onComplete === 'function') {
                                self.currentOptions.onComplete(data);
                            }
                        }, 1200);
                    } else {
                        self.updateStatus('Biometric Mismatch', 'Face does not match the official record photo.', 100);
                        if (typeof self.currentOptions.onError === 'function') {
                            self.currentOptions.onError(data);
                        }
                    }
                } else {
                    self.updateStatus('Verification Failed', data.message || 'Verification could not be completed.', 0);
                    if (typeof self.currentOptions.onError === 'function') {
                        self.currentOptions.onError(data);
                    }
                }
            })
            .catch(function (err) {
                console.error('[IdtraKYC] Request Error:', err);
                self.updateStatus('Connection Error', 'Failed to reach verification server.', 0);
                if (typeof self.currentOptions.onError === 'function') {
                    self.currentOptions.onError(err);
                }
            });
        },

        close: function () {
            var self = this;
            if (self.activeStream) {
                self.activeStream.getTracks().forEach(function (track) {
                    track.stop();
                });
                self.activeStream = null;
            }
            if (self.modalEl) {
                self.modalEl.classList.remove('idtra-show');
                setTimeout(function () {
                    if (self.modalEl && self.modalEl.parentNode) {
                        self.modalEl.parentNode.removeChild(self.modalEl);
                    }
                    self.modalEl = null;
                }, 300);
            }
        }
    };

    window.IdtraKYC = IdtraKYC;
})(window, document);
