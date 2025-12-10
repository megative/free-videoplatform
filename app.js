class VideoPlatform {
    constructor() {
        this.socket = null;
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.roomId = null;
        this.userId = null;
        this.isMuted = false;
        this.isVideoOff = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.initializeSocket();
    }

    initializeElements() {
        // Элементы интерфейса
        this.joinSection = document.getElementById('join-section');
        this.prejoinSection = document.getElementById('prejoin-section');
        this.videoSection = document.getElementById('video-section');
        this.roomIdInput = document.getElementById('room-id');
        this.joinBtn = document.getElementById('join-btn');
        this.prejoinRoomIdLabel = document.getElementById('prejoin-room-id');
        this.prejoinShareLink = document.getElementById('prejoin-share-link');
        this.prejoinCopyBtn = document.getElementById('prejoin-copy-btn');
        this.prejoinJoinBtn = document.getElementById('prejoin-join-btn');
        this.prejoinBackBtn = document.getElementById('prejoin-back-btn');
        
        // Видео элементы
        this.localVideo = document.getElementById('local-video');
        this.remoteVideo = document.getElementById('remote-video');
        this.videoGrid = document.querySelector('.video-grid');
        this.localWrapper = document.querySelector('.video-wrapper.local');
        this.remoteWrapper = document.querySelector('.video-wrapper.remote');
        this.topbar = document.getElementById('topbar');
        this.roomCodeBadge = document.getElementById('room-code-badge');
        
        // Кнопки управления
        this.muteBtn = document.getElementById('mute-btn');
        this.videoBtn = document.getElementById('video-btn');
        this.reconnectBtn = document.getElementById('reconnect-btn');
        this.hangupBtn = document.getElementById('hangup-btn');
        // Topbar actions
        this.copyRoomLinkTop = document.getElementById('copy-room-link-top');
        this.copyRoomLinkBtn = document.getElementById('copy-room-link-btn');
        
        // Статус
        this.connectionStatus = document.getElementById('connection-status');
    }

    setupEventListeners() {
        this.joinBtn.addEventListener('click', () => this.handleJoinClick());
        this.prejoinCopyBtn.addEventListener('click', () => this.copyPrejoinLink());
        this.prejoinJoinBtn.addEventListener('click', () => this.confirmJoin());
        this.prejoinBackBtn.addEventListener('click', () => this.backToHome());
        this.muteBtn.addEventListener('click', () => this.toggleMute());
        this.videoBtn.addEventListener('click', () => this.toggleVideo());
        this.reconnectBtn.addEventListener('click', () => this.reconnect());
        this.copyRoomLinkBtn.addEventListener('click', () => this.copyCurrentRoomLink());
        this.copyRoomLinkTop.addEventListener('click', () => this.copyCurrentRoomLink());
        // Клик по плитке делает её во весь экран, повторный клик возвращает split
        this.videoGrid.addEventListener('click', (e) => {
            if (e.target.closest('.controls') || e.target.closest('.topbar')) return;
            const localTile = e.target.closest('.video-wrapper.local');
            const remoteTile = e.target.closest('.video-wrapper.remote');
            if (remoteTile) {
                this.setLayout(this.currentLayout === 'remote-only' ? 'split' : 'remote-only');
            } else if (localTile) {
                this.setLayout(this.currentLayout === 'local-only' ? 'split' : 'local-only');
            }
        });
        this.hangupBtn.addEventListener('click', () => this.hangup());
        
        // Enter для присоединения к комнате
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleJoinClick();
            }
        });
    }

    initializeSocket() {
        this.socket = io();
        // Автоскрытие контролов на простое
        this.controls = document.getElementById('controls');
        let hideTimer = null;
        const resetControlsTimeout = () => {
            this.controls.classList.remove('hidden');
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => this.controls.classList.add('hidden'), 2500);
        };
        ['mousemove','touchstart','keydown'].forEach(evt => {
            document.addEventListener(evt, resetControlsTimeout, { passive: true });
        });
        resetControlsTimeout();
        
        this.socket.on('connect', () => {
            console.log('Подключен к серверу');
            this.userId = this.socket.id;
        });

        this.socket.on('user-connected', (userId) => {
            console.log('Пользователь подключился:', userId);
            this.updateStatus('Пользователь присоединился к звонку');
        });

        this.socket.on('user-disconnected', (userId) => {
            console.log('Пользователь отключился:', userId);
            this.updateStatus('Пользователь покинул звонок');
            this.handleUserDisconnected();
        });

        this.socket.on('offer', (data) => {
            this.handleOffer(data.offer, data.from);
        });

        this.socket.on('answer', (data) => {
            this.handleAnswer(data.answer, data.from);
        });

        this.socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(data.candidate, data.from);
        });

        this.socket.on('participants-list', async (participants) => {
            console.log('👥 Участники в комнате:', participants);
            if (participants.length > 0) {
                this.updateStatus('Подключение к участнику...');
                // Создаем соединение и отправляем offer
                await this.createPeerConnection();
                await this.createOffer();
                // Ровная раскладка 50/50
                this.setLayout('split');
            }
        });
    }

    setLayout(mode) {
        this.videoGrid.classList.remove('split', 'remote-only', 'local-only');
        if (mode === 'remote-only') {
            this.videoGrid.classList.add('remote-only');
            this.currentLayout = 'remote-only';
            return;
        }
        if (mode === 'local-only') {
            this.videoGrid.classList.add('local-only');
            this.currentLayout = 'local-only';
            return;
        }
        // default split
        this.videoGrid.classList.add('split');
        this.currentLayout = 'split';
    }

    handleJoinClick() {
        const roomId = (this.roomIdInput.value.trim() || this.generateRoomId()).toLowerCase();
        this.roomId = roomId;
        const link = `${window.location.origin}?room=${roomId}`;
        this.prejoinRoomIdLabel.textContent = roomId;
        this.prejoinShareLink.value = link;
        window.history.pushState({}, '', `?room=${roomId}`);
        this.joinSection.style.display = 'none';
        this.prejoinSection.style.display = 'block';
        // Обновим топ-бар бейдж
        if (this.roomCodeBadge) this.roomCodeBadge.textContent = roomId;
    }

    async confirmJoin() {
        const roomId = this.roomId;
        
        try {
            this.updateStatus('Подключение к комнате...');
            console.log('🎥 Запрашиваем доступ к камере и микрофону...');
            
            // Получаем доступ к камере и микрофону
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            console.log('✅ Медиа поток получен:', this.localStream);
            console.log('📹 Видео треки:', this.localStream.getVideoTracks());
            console.log('🎤 Аудио треки:', this.localStream.getAudioTracks());
            
            this.localVideo.srcObject = this.localStream;
            
            // Присоединяемся к комнате через Socket.IO
            console.log('🔌 Присоединяемся к комнате:', roomId);
            this.socket.emit('join-room', roomId, this.userId);
            
            // Показываем секцию видео
            this.joinSection.style.display = 'none';
            this.prejoinSection.style.display = 'none';
            this.videoSection.style.display = 'block';
            
            // Обновляем URL (уже установлен) и статус
            
            this.updateStatus('Ожидание участников...');
            
        } catch (error) {
            console.error('❌ Ошибка при получении медиа:', error);
            this.updateStatus('Ошибка: Не удалось получить доступ к камере/микрофону');
            alert('Не удалось получить доступ к камере и микрофону. Проверьте разрешения браузера.');
        }
    }

    copyPrejoinLink() {
        this.prejoinShareLink.select();
        document.execCommand('copy');
        this.prejoinCopyBtn.textContent = 'Скопировано!';
        setTimeout(() => {
            this.prejoinCopyBtn.textContent = '📋 Копировать';
        }, 2000);
    }

    copyLink() {
        this.shareLink.select();
        document.execCommand('copy');
        this.copyBtn.textContent = 'Скопировано!';
        setTimeout(() => {
            this.copyBtn.textContent = '📋 Копировать';
        }, 2000);
    }

    backToHome() {
        this.prejoinSection.style.display = 'none';
        this.joinSection.style.display = 'block';
        this.roomIdInput.focus();
        this.roomIdInput.select();
        this.roomId = null;
        window.history.pushState({}, '', window.location.pathname);
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 8);
    }

    async createPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        console.log('🔗 Создаем WebRTC соединение с конфигурацией:', configuration);
        this.peerConnection = new RTCPeerConnection(configuration);

        // Добавляем локальный поток
        console.log('📤 Добавляем локальные треки в соединение...');
        this.localStream.getTracks().forEach(track => {
            console.log('➕ Добавляем трек:', track.kind, track.label);
            this.peerConnection.addTrack(track, this.localStream);
        });

        // Обработка удаленного потока
        this.peerConnection.ontrack = (event) => {
            console.log('📥 Получен удаленный поток:', event);
            console.log('📹 Удаленные треки:', event.streams[0]?.getTracks());
            this.remoteStream = event.streams[0];
            this.remoteVideo.srcObject = this.remoteStream;
            this.updateStatus('Соединение установлено');
        };

        // Обработка ICE кандидатов
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('🧊 Отправляем ICE кандидат:', event.candidate);
                this.socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    roomId: this.roomId
                });
            } else {
                console.log('🧊 ICE gathering завершен');
            }
        };

        // Обработка изменения состояния соединения
        this.peerConnection.onconnectionstatechange = () => {
            console.log('🔗 Состояние соединения:', this.peerConnection.connectionState);
            switch (this.peerConnection.connectionState) {
                case 'connected':
                    this.updateStatus('Соединение установлено');
                    break;
                case 'disconnected':
                    this.updateStatus('Соединение потеряно');
                    break;
                case 'failed':
                    this.updateStatus('Ошибка соединения - попробуйте переподключиться');
                    console.error('❌ WebRTC соединение не удалось');
                    // Попробуем переподключиться через 3 секунды
                    setTimeout(() => {
                        if (this.peerConnection && this.peerConnection.connectionState === 'failed') {
                            console.log('🔄 Попытка переподключения...');
                            this.reconnect();
                        }
                    }, 3000);
                    break;
                case 'connecting':
                    this.updateStatus('Подключение...');
                    break;
            }
        };

        // Обработка ICE соединения
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('🧊 ICE состояние:', this.peerConnection.iceConnectionState);
        };

        // Обработка ICE gathering
        this.peerConnection.onicegatheringstatechange = () => {
            console.log('🧊 ICE gathering состояние:', this.peerConnection.iceGatheringState);
        };
    }

    async reconnect() {
        console.log('🔄 Переподключение...');
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Ждем немного и создаем новое соединение
        setTimeout(async () => {
            if (this.roomId && this.localStream) {
                await this.createPeerConnection();
                await this.createOffer();
            }
        }, 1000);
    }

    async createOffer() {
        try {
            console.log('📤 Создаем offer...');
            const offer = await this.peerConnection.createOffer();
            console.log('📋 Offer SDP:', offer.sdp);
            
            await this.peerConnection.setLocalDescription(offer);
            console.log('📥 Local description установлен');
            
            this.socket.emit('offer', {
                offer: offer,
                roomId: this.roomId
            });
            console.log('📤 Offer отправлен');
        } catch (error) {
            console.error('❌ Ошибка при создании offer:', error);
        }
    }

    async handleOffer(offer, from) {
        console.log('📨 Получен offer от:', from);
        console.log('📋 Offer SDP:', offer.sdp);
        
        if (!this.peerConnection) {
            console.log('🔗 Создаем новое соединение для ответа на offer');
            await this.createPeerConnection();
        }

        try {
            console.log('📥 Устанавливаем remote description...');
            await this.peerConnection.setRemoteDescription(offer);
            
            console.log('📤 Создаем answer...');
            const answer = await this.peerConnection.createAnswer();
            console.log('📋 Answer SDP:', answer.sdp);
            
            console.log('📥 Устанавливаем local description...');
            await this.peerConnection.setLocalDescription(answer);

            console.log('📤 Отправляем answer...');
            this.socket.emit('answer', {
                answer: answer,
                roomId: this.roomId
            });
        } catch (error) {
            console.error('❌ Ошибка при обработке offer:', error);
        }
    }

    async handleAnswer(answer, from) {
        console.log('📨 Получен answer от:', from);
        console.log('📋 Answer SDP:', answer.sdp);
        
        try {
            await this.peerConnection.setRemoteDescription(answer);
            console.log('✅ Remote description установлен');
            // Если переключения ещё не было, установим "remote-full" по умолчанию
            if (!this.currentLayout) {
                this.setLayout('remote-full');
            }
        } catch (error) {
            console.error('❌ Ошибка при установке remote description:', error);
        }
    }

    async handleIceCandidate(candidate, from) {
        console.log('🧊 Получен ICE candidate от:', from);
        console.log('📋 Candidate:', candidate);
        
        if (this.peerConnection) {
            try {
                await this.peerConnection.addIceCandidate(candidate);
                console.log('✅ ICE candidate добавлен');
            } catch (error) {
                console.error('❌ Ошибка при добавлении ICE candidate:', error);
            }
        } else {
            console.warn('⚠️ PeerConnection не создан, игнорируем ICE candidate');
        }
    }

    async handleUserDisconnected() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.remoteVideo.srcObject = null;
        this.updateStatus('Ожидание участников...');
    }

    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isMuted = !audioTrack.enabled;
                this.muteBtn.textContent = this.isMuted ? '🔇' : '🔊';
                this.muteBtn.classList.toggle('active', this.isMuted);
            }
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoOff = !videoTrack.enabled;
                this.videoBtn.textContent = this.isVideoOff ? '📹' : '📷';
                this.videoBtn.classList.toggle('active', this.isVideoOff);
            }
        }
    }

    hangup() {
        // Отключаемся от комнаты
        if (this.socket) {
            this.socket.emit('leave-room');
        }

        // Закрываем соединения
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Останавливаем локальный поток
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Сбрасываем видео элементы
        this.localVideo.srcObject = null;
        this.remoteVideo.srcObject = null;

        // Возвращаемся к форме входа
        this.videoSection.style.display = 'none';
        this.prejoinSection.style.display = 'none';
        this.joinSection.style.display = 'block';
        this.roomIdInput.value = '';
        
        // Очищаем URL
        window.history.pushState({}, '', window.location.pathname);

        // Сбрасываем состояние кнопок
        this.muteBtn.textContent = '🔇';
        this.muteBtn.classList.remove('active');
        this.videoBtn.textContent = '📹';
        this.videoBtn.classList.remove('active');
        this.isMuted = false;
        this.isVideoOff = false;

        this.updateStatus('Звонок завершен');
    }

    copyCurrentRoomLink() {
        if (!this.roomId) return;
        const link = `${window.location.origin}?room=${this.roomId}`;
        const tmp = document.createElement('input');
        tmp.value = link;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
        this.updateStatus('Ссылка скопирована в буфер обмена');
        // Подсветим чип в топбаре
        this.copyRoomLinkTop?.classList.add('active');
        setTimeout(()=> this.copyRoomLinkTop?.classList.remove('active'), 1200);
    }

    updateStatus(message) {
        this.connectionStatus.textContent = message;
        console.log('Статус:', message);
        
        // Добавляем класс для стилизации статуса
        this.connectionStatus.className = 'status';
        if (message.includes('установлено')) {
            this.connectionStatus.classList.add('connected');
        } else if (message.includes('Ошибка') || message.includes('не удалось')) {
            this.connectionStatus.classList.add('error');
        }
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    const app = new VideoPlatform();
    
    // Проверяем URL параметры для автоматического присоединения к комнате
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        const normalized = roomParam.toLowerCase();
        document.getElementById('room-id').value = normalized;
        app.roomId = normalized;
        app.handleJoinClick();
    }
});
