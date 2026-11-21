const fs = require('fs');
const http = require('http');
const url = require('url');
const loadConfig = require('./config');
const FacebookAPI = require('./lib/facebook');
const AIAnswerGenerator = require('./lib/ai');

// Tiện ích sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Sinh số ngẫu nhiên trong khoảng [min, max]
function getRandomDelay(minSec, maxSec) {
    const min = Math.min(minSec, maxSec);
    const max = Math.max(minSec, maxSec);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

class FacebookCommentBot {
    constructor() {
        this.config = loadConfig();
        this.ai = new AIAnswerGenerator(this.config);
        this.repliedHistory = this.loadHistory();
        this.repliedMessages = this.loadMessageHistory();
        this.currentHour = new Date().getHours();
        this.isRunning = false;

        // Khởi tạo danh sách các Fanpage hoạt động (Hỗ trợ ĐA FANPAGE)
        this.pages = (this.config.pages || []).map(p => ({
            ...p,
            fb: new FacebookAPI(p.id, p.token),
            replyCountInCurrentHour: 0,
            msgReplyCountInCurrentHour: 0,
            connected: false
        }));
    }

    loadHistory() {
        try {
            if (fs.existsSync(this.config.historyFile)) {
                const data = JSON.parse(fs.readFileSync(this.config.historyFile, 'utf8'));
                return Array.isArray(data) ? new Set(data) : new Set(Object.keys(data));
            }
        } catch (e) {
            console.warn('[HISTORY] Tạo mới file lưu lịch sử comment...');
        }
        return new Set();
    }

    loadMessageHistory() {
        try {
            const file = this.config.messengerHistoryFile || 'replied_messages.json';
            if (fs.existsSync(file)) {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                return Array.isArray(data) ? new Set(data) : new Set(Object.keys(data));
            }
        } catch (e) {
            console.warn('[HISTORY] Tạo mới file lưu lịch sử tin nhắn...');
        }
        return new Set();
    }

    saveHistory(commentId, info = {}) {
        this.repliedHistory.add(commentId);
        try {
            let existingData = {};
            if (fs.existsSync(this.config.historyFile)) {
                try {
                    existingData = JSON.parse(fs.readFileSync(this.config.historyFile, 'utf8'));
                    if (Array.isArray(existingData)) {
                        existingData = Object.fromEntries(existingData.map(id => [id, { time: new Date().toISOString() }]));
                    }
                } catch (e) {
                    existingData = {};
                }
            }
            existingData[commentId] = {
                time: new Date().toISOString(),
                ...info
            };
            fs.writeFileSync(this.config.historyFile, JSON.stringify(existingData, null, 2), 'utf8');
        } catch (err) {
            console.error('[HISTORY ERROR]', err.message);
        }
    }

    saveMessengerHistory(messageId, info = {}) {
        this.repliedMessages.add(messageId);
        try {
            const file = this.config.messengerHistoryFile || 'replied_messages.json';
            let existingData = {};
            if (fs.existsSync(file)) {
                try {
                    existingData = JSON.parse(fs.readFileSync(file, 'utf8'));
                    if (Array.isArray(existingData)) {
                        existingData = Object.fromEntries(existingData.map(id => [id, { time: new Date().toISOString() }]));
                    }
                } catch (e) {
                    existingData = {};
                }
            }
            existingData[messageId] = {
                time: new Date().toISOString(),
                ...info
            };
            fs.writeFileSync(file, JSON.stringify(existingData, null, 2), 'utf8');
        } catch (err) {
            console.error('[MSG HISTORY ERROR]', err.message);
        }
    }

    checkHourlyLimit(page) {
        const nowHour = new Date().getHours();
        if (nowHour !== this.currentHour) {
            this.currentHour = nowHour;
            this.pages.forEach(p => {
                p.replyCountInCurrentHour = 0;
                p.msgReplyCountInCurrentHour = 0;
            });
        }

        if (page.replyCountInCurrentHour >= this.config.maxRepliesPerHour) {
            console.log(`[RATE LIMIT 🛡️] Page "${page.name}" đạt giới hạn ${this.config.maxRepliesPerHour} bình luận/giờ.`);
            return false;
        }
        return true;
    }

    async start() {
        console.log('=====================================================');
        console.log('   🤖 FACEBOOK MULTI-PAGE AI COMMENT & MESSENGER BOT');
        console.log('=====================================================');

        // 1. HTTP Server hỗ trợ cả Webhook Real-time và Giám sát Health Check
        const PORT = process.env.PORT || 3000;
        try {
            const server = http.createServer((req, res) => {
                const parsedUrl = url.parse(req.url, true);

                // --- 1.1. XÁC THỰC WEBHOOK (GET /webhook) ---
                if (req.method === 'GET' && parsedUrl.pathname === '/webhook') {
                    const mode = parsedUrl.query['hub.mode'];
                    const token = parsedUrl.query['hub.verify_token'];
                    const challenge = parsedUrl.query['hub.challenge'];

                    if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
                        console.log('[WEBHOOK] ✅ Xác thực Webhook Meta thành công!');
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end(challenge);
                        return;
                    } else {
                        console.warn('[WEBHOOK] ❌ Xác thực thất bại, token không khớp');
                        res.writeHead(403);
                        res.end('Forbidden');
                        return;
                    }
                }

                // --- 1.2. NHẬN SỰ KIỆN TỨC THÌ (POST /webhook) ---
                if (req.method === 'POST' && parsedUrl.pathname === '/webhook') {
                    let body = '';
                    req.on('data', chunk => { body += chunk.toString(); });
                    req.on('end', async () => {
                        try {
                            const data = JSON.parse(body);
                            if (data.object === 'page') {
                                this.handleWebhookEvent(data);
                            }
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ status: 'EVENT_RECEIVED' }));
                        } catch (err) {
                            res.writeHead(400);
                            res.end('Invalid Payload');
                        }
                    });
                    return;
                }

                // --- 1.3. DASHBOARD TRẠNG THÁI HỆ THỐNG (GET /) ---
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    status: "ONLINE",
                    bot: "Facebook Multi-Page AI Comment & Messenger Bot",
                    features: {
                        autoCommentReply: true,
                        autoMessengerReply: this.config.enableMessengerBot !== false,
                        webhookEnabled: true
                    },
                    totalPages: this.pages.length,
                    pages: this.pages.map(p => ({
                        id: p.id,
                        name: p.name,
                        status: p.connected ? "CONNECTED" : "WAITING_AUTH",
                        commentRepliesThisHour: p.replyCountInCurrentHour,
                        messageRepliesThisHour: p.msgReplyCountInCurrentHour
                    })),
                    uptimeSeconds: Math.floor(process.uptime()),
                    lastCheck: new Date().toISOString()
                }));
            });

            server.listen(PORT, '0.0.0.0', () => {
                console.log(`[CLOUD HOSTING] Cổng Web trực tuyến 24/7: http://0.0.0.0:${PORT}`);
            });

            // Tự động ping chính mình mỗi 5 phút để Render không bị rơi vào trạng thái ngủ (spin down)
            setInterval(async () => {
                try {
                    await fetch('https://goc-cua-me-bot.onrender.com');
                } catch (e) {}
            }, 5 * 60 * 1000);
        } catch (e) {
            console.warn('[SERVER PORT WARN]', e.message);
        }

        // 2. Kiểm tra kết nối từng Page
        console.log(`[KHỞI TẠO DANH SÁCH ĐA FANPAGE] (${this.pages.length} Page):`);
        for (const page of this.pages) {
            try {
                const fbPage = await page.fb.checkPage();
                page.name = fbPage.name || page.name;
                page.connected = true;
                console.log(`  ✅ [Page: ${page.name}] (ID: ${page.id}) - Kết nối thành công!`);
            } catch (err) {
                console.error(`  ⚠️ [Page: ${page.name || page.id}] Lỗi kết nối: ${err.message}`);
            }
        }

        console.log(`\n[CẤU HÌNH HỆ THỐNG]`);
        console.log(`  - Tự động trả lời Messenger: ${this.config.enableMessengerBot ? 'BẬT ✅' : 'TẮT ❌'}`);
        console.log(`  - Độ trễ phản hồi bình luận: ${this.config.delayMinSeconds}s - ${this.config.delayMaxSeconds}s`);
        console.log(`  - Chu kỳ quét: mỗi ${this.config.scanIntervalSeconds}s`);
        console.log(`  - Tự động ẩn số điện thoại: ${this.config.autoHidePhone ? 'BẬT ✅' : 'TẮT ❌'}`);
        console.log('-----------------------------------------------------\n');

        this.isRunning = true;

        while (this.isRunning) {
            try {
                await this.scanAndProcessAllPages();
            } catch (err) {
                console.error(`[SCAN ERROR] ⚠️ ${err.message}`);
            }

            console.log(`\n💤 Đang nghỉ ${this.config.scanIntervalSeconds}s trước lần quét tiếp theo...\n`);
            await sleep(this.config.scanIntervalSeconds * 1000);
        }
    }

    /**
     * Xử lý sự kiện tức thì khi Facebook bắn Webhook
     */
    async handleWebhookEvent(data) {
        for (const entry of data.entry || []) {
            const pageId = entry.id;
            const page = this.pages.find(p => p.id === pageId);
            if (!page) continue;

            for (const messagingItem of entry.messaging || []) {
                const senderId = messagingItem.sender?.id;
                const message = messagingItem.message;

                // Bỏ qua tin nhắn do chính page gửi hoặc echo
                if (!message || message.is_echo || senderId === page.id) continue;
                if (this.repliedMessages.has(message.mid)) continue;

                console.log(`⚡ [WEBHOOK MESSENGER] Tin nhắn mới từ PSID ${senderId} trên [${page.name}]: "${message.text}"`);

                const replyText = await this.ai.generateMessengerResponse(message.text || '', '', page);
                try {
                    await page.fb.sendMessengerReply(null, senderId, replyText);
                    console.log(`   ✅ [WEBHOOK] Đã phản hồi tin nhắn thành công!`);
                    this.saveMessengerHistory(message.mid, {
                        page: page.name,
                        senderId: senderId,
                        text: message.text,
                        reply: replyText,
                        source: 'webhook'
                    });
                    page.msgReplyCountInCurrentHour++;
                } catch (err) {
                    console.error(`   ❌ [WEBHOOK ERROR] ${err.message}`);
                }
            }
        }
    }

    async scanAndProcessAllPages() {
        const timeNow = new Date().toLocaleTimeString('vi-VN');
        console.log(`[${timeNow}] 🔍 Bắt đầu chu kỳ quét ${this.pages.length} Fanpage (Bình luận & Hộp thư Messenger)...`);

        for (const page of this.pages) {
            // 1. Quét bình luận bài viết & Reels
            if (this.checkHourlyLimit(page)) {
                try {
                    await this.scanCommentsForPage(page);
                } catch (err) {
                    console.error(`[PAGE COMMENT ERROR] Page "${page.name}": ${err.message}`);
                }
            }

            // 2. Quét hộp thư Messenger (Tự động trả lời tin nhắn khách nhắn vào page)
            if (this.config.enableMessengerBot) {
                try {
                    await this.scanMessengerForPage(page);
                } catch (err) {
                    console.error(`[PAGE MESSENGER ERROR] Page "${page.name}": ${err.message}`);
                }
            }
        }
    }

    /**
     * Quét và tự động trả lời tin nhắn hộp thư Messenger của Page
     */
    async scanMessengerForPage(page) {
        let conversations = [];
        try {
            conversations = await page.fb.getConversations(8);
        } catch (err) {
            // Không ngắt luồng chính nếu lỗi mạng tạm thời
            return;
        }

        for (const convo of conversations) {
            const latestMsg = convo.messages?.data?.[0];
            if (!latestMsg) continue;

            // 1. Kiểm tra nếu tin nhắn mới nhất do chính Page gửi -> Đã trả lời xong
            if (latestMsg.from?.id === page.id) continue;

            // 2. Kiểm tra nếu tin nhắn này đã được bot xử lý trước đó -> Bỏ qua
            if (this.repliedMessages.has(latestMsg.id)) continue;

            // 3. Khách hàng là người gửi tin nhắn mới nhất!
            const customer = convo.senders?.data?.find(s => s.id !== page.id) || latestMsg.from;
            const customerName = customer?.name || latestMsg.from?.name || '';
            const customerPsid = customer?.id || latestMsg.from?.id;
            const messageText = latestMsg.message || '';

            console.log(`\n📬 [MESSENGER INBOX] TIN NHẮN MỚI TẠI [${page.name}]:`);
            console.log(`   Khách hàng: ${customerName} (ID: ${customerPsid})`);
            console.log(`   Nội dung: "${messageText}"`);

            // 4. Sinh câu trả lời Messenger bằng AI chuẩn ngôn từ thôi miên & 9C
            console.log(`   🧠 AI đang soạn câu trả lời Messenger chu đáo...`);
            const replyText = await this.ai.generateMessengerResponse(messageText, customerName, page);
            console.log(`   💡 Nội dung tin nhắn: "${replyText}"`);

            // Mô phỏng độ trễ người thật gõ tin nhắn (khoảng 8 - 15 giây)
            const typingDelay = getRandomDelay(8, 15);
            console.log(`   ⏳ Đang chờ ${typingDelay}s mô phỏng thao tác nhân viên tư vấn trả lời...`);
            await sleep(typingDelay * 1000);

            // 5. Gửi tin nhắn trả lời
            try {
                await page.fb.sendMessengerReply(convo.id, customerPsid, replyText);
                console.log(`   ✅ ĐÃ TRẢ LỜI TIN NHẮN MESSENGER THÀNH CÔNG!`);

                this.saveMessengerHistory(latestMsg.id, {
                    page: page.name,
                    convoId: convo.id,
                    customer: customerName,
                    customerPsid: customerPsid,
                    text: messageText,
                    reply: replyText,
                    source: 'polling'
                });
                page.msgReplyCountInCurrentHour++;
            } catch (err) {
                console.error(`   ❌ LỖI GỬI MESSENGER: ${err.message}`);
            }

            // Giãn cách ngắn giữa các hội thoại
            await sleep(5000);
        }
    }

    /**
     * Quét và trả lời bình luận trên bài viết & Reels
     */
    async scanCommentsForPage(page) {
        let posts = [];
        try {
            posts = await page.fb.getPublishedPosts(this.config.postLimit);
        } catch (err) {
            return;
        }

        if (posts.length === 0) return;

        for (const post of posts) {
            let comments = [];
            try {
                comments = await page.fb.getPostComments(post.id);
            } catch (err) {
                continue;
            }

            for (const comment of comments) {
                // 1. Kiểm tra nếu comment do chính Page đăng -> Bỏ qua
                if (comment.from?.id === page.id) continue;

                // 2. Kiểm tra nếu comment đã được xử lý trước đó -> Bỏ qua
                if (this.repliedHistory.has(comment.id)) continue;

                // 3. Kiểm tra xem comment đã có phản hồi nào từ Page hay chưa
                const existingReplies = comment.comments?.data || [];
                const alreadyRepliedByPage = existingReplies.some(rep => rep.from?.id === page.id);
                if (alreadyRepliedByPage) {
                    this.saveHistory(comment.id, { page: page.name, note: 'Đã trả lời trước đó' });
                    continue;
                }

                // 4. Phát hiện comment mới cần trả lời!
                await this.handleNewComment(comment, post, page);

                // Giãn cách an toàn giữa các comment
                const spacing = getRandomDelay(this.config.spacingBetweenComments, this.config.spacingBetweenComments + 15);
                console.log(`⏳ Giãn cách an toàn ${spacing}s trước comment tiếp theo...`);
                await sleep(spacing * 1000);
            }
        }
    }

    async handleNewComment(comment, post, page) {
        const customerName = comment.from?.name || '';
        const commentText = comment.message || '';
        console.log(`\n-----------------------------------------------------`);
        console.log(`💬 [Page: ${page.name}] COMMENT MỚI TỪ: ${customerName}`);
        console.log(`   Nội dung: "${commentText}"`);

        // 1. Kiểm tra số điện thoại (chống cướp đơn)
        const hasPhone = /(0[3|5|7|8|9][0-9]{8})\b/.test(commentText);
        if (hasPhone && this.config.autoHidePhone) {
            try {
                console.log(`   🚨 Phát hiện Số Điện Thoại! Đang tự động ẩn bình luận bảo mật...`);
                await page.fb.hideComment(comment.id);
                console.log(`   🔒 Đã ẩn bình luận thành công!`);
            } catch (err) {
                console.warn(`   ⚠️ Không thể ẩn bình luận: ${err.message}`);
            }
        }

        // 2. Sinh câu trả lời bằng AI theo phong cách của Page
        console.log(`   🧠 AI đang suy nghĩ câu trả lời thôi miên...`);
        const replyText = await this.ai.generateResponse(commentText, customerName, page);
        console.log(`   💡 Câu trả lời dự kiến: "${replyText}"`);

        // 3. MÔ PHỎNG ĐỘ TRỄ NGƯỜI THẬT (HUMAN-LIKE DELAY)
        const delaySeconds = getRandomDelay(this.config.delayMinSeconds, this.config.delayMaxSeconds);
        console.log(`   ⏳ [MÔ PHỎNG NGƯỜI THẬT] Đang chờ ngẫu nhiên ${delaySeconds}s trước khi gửi...`);
        await sleep(delaySeconds * 1000);

        // 4. Gửi bình luận trả lời lên Facebook
        try {
            console.log(`   🚀 Đang gửi câu trả lời lên Facebook [${page.name}]...`);
            const res = await page.fb.replyComment(comment.id, replyText);
            console.log(`   ✅ ĐÃ TRẢ LỜI THÀNH CÔNG! (Reply ID: ${res.id})`);

            // 5. Gửi tin nhắn riêng (Private Reply) nếu được bật
            if (this.config.enablePrivateReply) {
                try {
                    await sleep(3000);
                    await page.fb.sendPrivateReply(comment.id, replyText);
                    console.log(`   📬 Đã gửi tin nhắn riêng qua Messenger cho khách!`);
                } catch (privErr) {
                    console.log(`   ℹ️ Private reply: ${privErr.message}`);
                }
            }

            // Ghi nhận lịch sử
            this.saveHistory(comment.id, {
                page: page.name,
                customer: customerName,
                text: commentText,
                reply: replyText
            });
            page.replyCountInCurrentHour++;
        } catch (err) {
            console.error(`   ❌ LỖI KHI GỬI CÂU TRẢ LỜI: ${err.message}`);
        }
        console.log(`-----------------------------------------------------\n`);
    }
}

// Chạy bot nếu được gọi trực tiếp
if (require.main === module) {
    const bot = new FacebookCommentBot();
    bot.start().catch(err => {
        console.error('Fatal Bot Error:', err);
    });
}

module.exports = FacebookCommentBot;
