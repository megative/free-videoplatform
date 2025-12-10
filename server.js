const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();

// Настройка HTTPS
let server;
let io;

// Используем HTTP для внутреннего контейнера (nginx терминирует SSL)
server = http.createServer(app);
console.log('⚠️  HTTP сервер (SSL терминируется в nginx)');

io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Хранилище комнат
const rooms = new Map();

// Статические файлы
app.use(express.static(path.join(__dirname)));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API для создания комнаты (регистронезависимый)
app.get('/api/room/:roomId', (req, res) => {
    const roomId = String(req.params.roomId || '').toLowerCase();
    
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            id: roomId,
            participants: new Set(),
            createdAt: new Date()
        });
    }
    
    res.json({ 
        roomId, 
        exists: true,
        participantCount: rooms.get(roomId).participants.size
    });
});

// Socket.IO обработчики
io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);

    // Присоединение к комнате (регистронезависимый)
    socket.on('join-room', (roomIdRaw, userId) => {
        const roomId = String(roomIdRaw || '').toLowerCase();
        console.log(`Пользователь ${userId} присоединяется к комнате ${roomId}`);
        
        // Создаем комнату если её нет
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                id: roomId,
                participants: new Set(),
                createdAt: new Date()
            });
        }
        
        const room = rooms.get(roomId);
        room.participants.add(socket.id);
        
        socket.join(roomId);
        socket.roomId = roomId; // сохраняем нормализованный ID на сокете
        socket.userId = userId;
        
        // Уведомляем других участников о новом пользователе
        socket.to(roomId).emit('user-connected', userId);
        
        // Отправляем список участников новому пользователю
        const participants = Array.from(room.participants).filter(id => id !== socket.id);
        socket.emit('participants-list', participants);
        
        console.log(`Комната ${roomId}: ${room.participants.size} участников`);
    });

    // WebRTC signaling
    socket.on('offer', (data) => {
        const targetRoom = socket.roomId; // игнорируем регистр присланного ID
        socket.to(targetRoom).emit('offer', {
            offer: data.offer,
            from: socket.userId
        });
    });

    socket.on('answer', (data) => {
        const targetRoom = socket.roomId;
        socket.to(targetRoom).emit('answer', {
            answer: data.answer,
            from: socket.userId
        });
    });

    socket.on('ice-candidate', (data) => {
        const targetRoom = socket.roomId;
        socket.to(targetRoom).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.userId
        });
    });

    // Отключение от комнаты
    socket.on('leave-room', () => {
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.participants.delete(socket.id);
                
                // Уведомляем других участников
                socket.to(socket.roomId).emit('user-disconnected', socket.userId);
                
                // Удаляем комнату если она пустая
                if (room.participants.size === 0) {
                    rooms.delete(socket.roomId);
                    console.log(`Комната ${socket.roomId} удалена (пустая)`);
                } else {
                    console.log(`Комната ${socket.roomId}: ${room.participants.size} участников`);
                }
            }
        }
    });

    // Отключение пользователя
    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
        
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.participants.delete(socket.id);
                
                // Уведомляем других участников
                socket.to(socket.roomId).emit('user-disconnected', socket.userId);
                
                // Удаляем комнату если она пустая
                if (room.participants.size === 0) {
                    rooms.delete(socket.roomId);
                    console.log(`Комната ${socket.roomId} удалена (пустая)`);
                } else {
                    console.log(`Комната ${socket.roomId}: ${room.participants.size} участников`);
                }
            }
        }
    });
});

// Очистка неактивных комнат каждые 5 минут
setInterval(() => {
    const now = new Date();
    for (const [roomId, room] of rooms.entries()) {
        const timeDiff = now - room.createdAt;
        const fiveMinutes = 5 * 60 * 1000;
        
        if (room.participants.size === 0 && timeDiff > fiveMinutes) {
            rooms.delete(roomId);
            console.log(`Неактивная комната ${roomId} удалена`);
        }
    }
}, 5 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
    const protocol = server instanceof https.Server ? 'https' : 'http';
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📱 Откройте ${protocol}://localhost:${PORT} в браузере`);
    console.log(`📱 Для доступа с телефона используйте IP вашего компьютера:`);
    console.log(`   - ${protocol}://[IP_КОМПЬЮТЕРА]:${PORT}`);
    console.log(`   - Например: ${protocol}://192.168.1.100:${PORT}`);
    console.log(`🐳 Запущено в Docker контейнере`);
    
    if (protocol === 'https') {
        console.log(`🔒 HTTPS активен - камера и микрофон будут работать!`);
    } else {
        console.log(`⚠️  HTTP режим - камера и микрофон могут не работать в некоторых браузерах`);
    }
});
