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
        this.fb = new FacebookAPI(this.config);
        this.ai = new AIAnswerGenerator(this.config);
        this.repliedHistory = this.loadHistory();
        this.replyCountInCurrentHour = 0;
        this.currentHour = new Date().getHours();
        this.isRunning = false;
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

    checkHourlyLimit() {
        const nowHour = new Date().getHours();
        if (nowHour !== this.currentHour) {
            this.currentHour = nowHour;
            this.replyCountInCurrentHour = 0;
        }

        if (this.replyCountInCurrentHour >= this.config.maxRepliesPerHour) {
            console.log(`[RATE LIMIT 🛡️] Đã đạt giới hạn an toàn ${this.config.maxRepliesPerHour} phản hồi/giờ. Tạm nghỉ tới giờ sau để bảo vệ Page...`);
            return false;
        }
        return true;
    }

    async start() {
        console.log('=====================================================');
        console.log('   🤖 FACEBOOK AI COMMENT BOT - ANTI-BAN PRO        ');
        console.log('=====================================================');

        try {
            const page = await this.fb.checkPage();
            console.log(`[PAGE KẾT NỐI THÀNH CÔNG] 👉 ${page.name} (ID: ${page.id})`);
        } catch (err) {
            console.error(`[LỖI KẾT NỐI PAGE] ❌ ${err.message}`);
            console.log('Vui lòng kiểm tra lại FB_PAGE_ACCESS_TOKEN và FB_PAGE_ID trong cấu hình!');
            return;
        }

        console.log(`[CẤU HÌNH ĐỘ TRỄ MÔ PHỎNG NGƯỜI THẬT]`);
        console.log(`  - Độ trễ phản hồi ngẫu nhiên: ${this.config.delayMinSeconds}s - ${this.config.delayMaxSeconds}s`);
        console.log(`  - Giãn cách giữa các comment: ${this.config.spacingBetweenComments}s`);
        console.log(`  - Chu kỳ quét bài viết: mỗi ${this.config.scanIntervalSeconds}s`);
        console.log(`  - Tự động ẩn số điện thoại: ${this.config.autoHidePhone ? 'BẬT ✅' : 'TẮT ❌'}`);
        console.log(`  - Trí tuệ nhân tạo (AI): ${this.config.geminiApiKey ? 'Gemini AI ✅' : 'Rule-based đa dạng (Chống lặp) ⚡'}`);
        console.log('-----------------------------------------------------\n');

        // Bật HTTP Server nhẹ để chạy được trên mọi nền tảng Cloud (Render, Railway, Koyeb...)
        const PORT = process.env.PORT || 3000;
        try {
            const server = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    status: "ONLINE",
                    bot: "Facebook Comment AI Bot - Góc của mẹ",
                    repliesThisHour: this.replyCountInCurrentHour,
                    uptimeSeconds: Math.floor(process.uptime()),
                    lastCheck: new Date().toISOString()
                }));
            });
            server.listen(PORT, () => {
                console.log(`[CLOUD HOSTING] Cổng Web trực tuyến 24/7: port ${PORT}`);
            });
        } catch (e) {
            // Không chặn bot nếu cổng bị bận khi chạy local
        }

        this.isRunning = true;

        while (this.isRunning) {
            try {
                await this.scanAndProcess();
            } catch (err) {
                console.error(`[SCAN ERROR] ⚠️ ${err.message}`);
            }

            console.log(`\n💤 Đang nghỉ ${this.config.scanIntervalSeconds}s trước lần quét tiếp theo...\n`);
            await sleep(this.config.scanIntervalSeconds * 1000);
        }
    }

    async scanAndProcess() {
        const timeNow = new Date().toLocaleTimeString('vi-VN');
        console.log(`[${timeNow}] 🔍 Đang quét ${this.config.postLimit} bài viết mới nhất trên Page...`);

        if (!this.checkHourlyLimit()) return;

        let posts = [];
        try {
            posts = await this.fb.getPublishedPosts(this.config.postLimit);
        } catch (err) {
            console.warn(`[POSTS] Không lấy được danh sách bài viết: ${err.message}`);
            return;
        }

        if (posts.length === 0) {
            console.log('  -> Không có bài viết nào trên Page.');
            return;
        }

        for (const post of posts) {
            console.log(`  📝 Kiểm tra bài viết: ${post.id.slice(-8)} | Nội dung: "${(post.message || '').slice(0, 40).replace(/\n/g, ' ')}..."`);
            
            let comments = [];
            try {
                comments = await this.fb.getPostComments(post.id);
            } catch (err) {
                // Nếu gặp lỗi quyền pages_read_user_content thì báo rõ ràng
                console.warn(`    ⚠️ Không thể đọc comment của bài: ${err.message}`);
                continue;
            }

            for (const comment of comments) {
                // 1. Kiểm tra nếu comment do chính Page đăng -> Bỏ qua
                if (comment.from?.id === this.config.pageId) {
                    continue;
                }

                // 2. Kiểm tra nếu comment đã được xử lý trước đó trong file lịch sử -> Bỏ qua
                if (this.repliedHistory.has(comment.id)) {
                    continue;
                }

                // 3. Kiểm tra xem comment đã có phản hồi nào từ Page hay chưa (do người khác hoặc bot đã reply)
                const existingReplies = comment.comments?.data || [];
                const alreadyRepliedByPage = existingReplies.some(rep => rep.from?.id === this.config.pageId);
                if (alreadyRepliedByPage) {
                    this.saveHistory(comment.id, { note: 'Đã được trả lời thủ công trước đó' });
                    continue;
                }

                // 4. Phát hiện comment mới cần trả lời!
                await this.handleNewComment(comment, post);

                // Giãn cách một khoảng an toàn trước khi xử lý comment tiếp theo
                const spacing = getRandomDelay(this.config.spacingBetweenComments, this.config.spacingBetweenComments + 15);
                console.log(`⏳ Giãn cách an toàn ${spacing}s trước comment tiếp theo...`);
                await sleep(spacing * 1000);
            }
        }
    }

    async handleNewComment(comment, post) {
        const customerName = comment.from?.name || 'Khách hàng';
        const commentText = comment.message || '';
        console.log(`\n-----------------------------------------------------`);
        console.log(`💬 PHÁT HIỆN COMMENT MỚI TỪ: ${customerName}`);
        console.log(`   Nội dung: "${commentText}"`);

        // 1. Kiểm tra số điện thoại (chống cướp đơn)
        const hasPhone = /(0[3|5|7|8|9][0-9]{8})\b/.test(commentText);
        if (hasPhone && this.config.autoHidePhone) {
            try {
                console.log(`   🚨 Phát hiện Số Điện Thoại! Đang tự động ẩn bình luận bảo mật...`);
                await this.fb.hideComment(comment.id);
                console.log(`   🔒 Đã ẩn bình luận thành công!`);
            } catch (err) {
                console.warn(`   ⚠️ Không thể ẩn bình luận: ${err.message}`);
            }
        }

        // 2. Sinh câu trả lời bằng AI
        console.log(`   🧠 AI đang suy nghĩ câu trả lời...`);
        const replyText = await this.ai.generateResponse(commentText, customerName);
        console.log(`   💡 Câu trả lời dự kiến: "${replyText}"`);

        // 3. MÔ PHỎNG ĐỘ TRỄ NGƯỜI THẬT (HUMAN-LIKE DELAY)
        const delaySeconds = getRandomDelay(this.config.delayMinSeconds, this.config.delayMaxSeconds);
        console.log(`   ⏳ [MÔ PHỎNG NGƯỜI THẬT] Đang chờ ngẫu nhiên ${delaySeconds} giây trước khi gửi...`);
        console.log(`      (Mô phỏng thời gian nhân viên đọc thông báo, suy nghĩ và gõ phím)`);

        await sleep(delaySeconds * 1000);

        // 4. Gửi bình luận trả lời lên Facebook
        try {
            console.log(`   🚀 Đang gửi câu trả lời lên Facebook...`);
            const res = await this.fb.replyComment(comment.id, replyText);
            console.log(`   ✅ ĐÃ TRẢ LỜI THÀNH CÔNG! (Reply ID: ${res.id})`);

            // 5. Nếu bật Private Reply -> gửi thêm tin nhắn riêng qua Messenger
            if (this.config.enablePrivateReply) {
                try {
                    await sleep(3000); // nghỉ nhẹ 3s
                    await this.fb.sendPrivateReply(comment.id, replyText);
                    console.log(`   📬 Đã gửi tin nhắn riêng qua Messenger cho khách!`);
                } catch (privErr) {
                    console.log(`   ℹ️ Private reply: ${privErr.message}`);
                }
            }

            // Ghi nhận lịch sử và tăng biến đếm
            this.saveHistory(comment.id, {
                customer: customerName,
                text: commentText,
                reply: replyText
            });
            this.replyCountInCurrentHour++;
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
