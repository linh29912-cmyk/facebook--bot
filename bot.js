const fs = require('fs');
const http = require('http');
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
        this.currentHour = new Date().getHours();
        this.isRunning = false;

        // Khởi tạo danh sách các Fanpage hoạt động (Hỗ trợ ĐA FANPAGE)
        this.pages = (this.config.pages || []).map(p => ({
            ...p,
            fb: new FacebookAPI(p.id, p.token),
            replyCountInCurrentHour: 0,
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
            console.warn('[HISTORY] Tạo mới file lưu lịch sử phản hồi...');
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

    checkHourlyLimit(page) {
        const nowHour = new Date().getHours();
        if (nowHour !== this.currentHour) {
            this.currentHour = nowHour;
            this.pages.forEach(p => p.replyCountInCurrentHour = 0);
        }

        if (page.replyCountInCurrentHour >= this.config.maxRepliesPerHour) {
            console.log(`[RATE LIMIT 🛡️] Page "${page.name}" đạt giới hạn ${this.config.maxRepliesPerHour} phản hồi/giờ. Tạm nghỉ tới giờ sau...`);
            return false;
        }
        return true;
    }

    async start() {
        console.log('=====================================================');
        console.log('   🤖 FACEBOOK MULTI-PAGE AI COMMENT BOT - 24/7     ');
        console.log('=====================================================');

        // 1. Luôn bật HTTP Server trước để Cloud Container (Render/Railway) không bị thoát
        const PORT = process.env.PORT || 3000;
        try {
            const server = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    status: "ONLINE",
                    bot: "Facebook Multi-Page AI Comment Bot",
                    totalPages: this.pages.length,
                    pages: this.pages.map(p => ({
                        id: p.id,
                        name: p.name,
                        status: p.connected ? "CONNECTED" : "WAITING_AUTH",
                        repliesThisHour: p.replyCountInCurrentHour
                    })),
                    uptimeSeconds: Math.floor(process.uptime()),
                    lastCheck: new Date().toISOString()
                }));
            });
            server.listen(PORT, '0.0.0.0', () => {
                console.log(`[CLOUD HOSTING] Cổng Web trực tuyến 24/7: http://0.0.0.0:${PORT}`);
            });
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

        console.log(`\n[CẤU HÌNH ĐỘ TRỄ MÔ PHỎNG NGƯỜI THẬT]`);
        console.log(`  - Độ trễ phản hồi ngẫu nhiên: ${this.config.delayMinSeconds}s - ${this.config.delayMaxSeconds}s`);
        console.log(`  - Giãn cách giữa các comment: ${this.config.spacingBetweenComments}s`);
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

    async scanAndProcessAllPages() {
        const timeNow = new Date().toLocaleTimeString('vi-VN');
        console.log(`[${timeNow}] 🔍 Bắt đầu chu kỳ quét ${this.pages.length} Fanpage...`);

        for (const page of this.pages) {
            if (!this.checkHourlyLimit(page)) continue;
            try {
                await this.scanSinglePage(page);
            } catch (err) {
                console.error(`[PAGE SCAN ERROR] Page "${page.name}": ${err.message}`);
            }
        }
    }

    async scanSinglePage(page) {
        console.log(`\n👉 Đang quét Page: [${page.name}] (ID: ${page.id})`);

        let posts = [];
        try {
            posts = await page.fb.getPublishedPosts(this.config.postLimit);
        } catch (err) {
            console.warn(`  ⚠️ [POSTS] Không lấy được bài viết của page "${page.name}": ${err.message}`);
            return;
        }

        if (posts.length === 0) {
            console.log('  -> Chưa có bài viết nào gần đây.');
            return;
        }

        for (const post of posts) {
            let comments = [];
            try {
                comments = await page.fb.getPostComments(post.id);
            } catch (err) {
                console.warn(`    ⚠️ Không thể đọc comment của bài ${post.id}: ${err.message}`);
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
