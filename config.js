const fs = require('fs');
const path = require('path');

function loadEnv() {
    // 1. Thử đọc từ .env nội bộ của thư mục bot
    let envPath = path.join(__dirname, '.env');
    
    // 2. Nếu không thấy, tìm sang .env của skill facebook-auto-post đã cấu hình sẵn
    if (!fs.existsSync(envPath)) {
        const skillEnv = path.join(__dirname, '..', '.agents', 'skills', 'facebook-auto-post', '.env');
        if (fs.existsSync(skillEnv)) {
            envPath = skillEnv;
        }
    }

    const loaded = {};
    if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const idx = trimmed.indexOf('=');
            if (idx === -1) continue;
            const key = trimmed.slice(0, idx).trim();
            const value = trimmed.slice(idx + 1).trim();
            loaded[key] = value;
        }
    }

    return {
        // Cấu hình Facebook Page
        pageId: process.env.FB_PAGE_ID || loaded.FB_PAGE_ID || '',
        pageToken: process.env.FB_PAGE_ACCESS_TOKEN || loaded.FB_PAGE_ACCESS_TOKEN || '',
        
        // Cấu hình AI Gemini
        geminiApiKey: process.env.GEMINI_API_KEY || loaded.GEMINI_API_KEY || '',
        geminiModel: loaded.GEMINI_MODEL || 'gemini-1.5-flash',

        // CẤU HÌNH ĐỘ TRỄ MÔ PHỎNG NGƯỜI THẬT (CHỐNG KHÓA / CHỐNG SPAM)
        // Độ trễ ngẫu nhiên trước khi gửi câu trả lời (giây)
        delayMinSeconds: parseInt(loaded.DELAY_MIN_SECONDS || '35', 10),
        delayMaxSeconds: parseInt(loaded.DELAY_MAX_SECONDS || '95', 10),

        // Khoảng cách giãn cách giữa các comment khi có nhiều khách comment cùng lúc (giây)
        spacingBetweenComments: parseInt(loaded.SPACING_BETWEEN_COMMENTS || '25', 10),

        // Chu kỳ quét bài viết mới (giây)
        scanIntervalSeconds: parseInt(loaded.SCAN_INTERVAL_SECONDS || '60', 10),

        // Số bài viết gần nhất cần quét
        postLimit: parseInt(loaded.POST_LIMIT || '5', 10),

        // Giới hạn số lượng phản hồi an toàn mỗi giờ (tránh bị cờ spam)
        maxRepliesPerHour: parseInt(loaded.MAX_REPLIES_PER_HOUR || '30', 10),

        // Tự động ẩn comment nếu chứa số điện thoại (chống cướp đơn)
        autoHidePhone: loaded.AUTO_HIDE_PHONE !== 'false',

        // Gửi tin nhắn riêng (Private Reply) qua Messenger nếu được phép
        enablePrivateReply: loaded.ENABLE_PRIVATE_REPLY === 'true',

        // File lưu lịch sử đã reply
        historyFile: path.join(__dirname, 'replied_comments.json'),

        // File kiến thức sản phẩm
        knowledgeFile: path.join(__dirname, 'knowledge.md')
    };
}

module.exports = loadEnv;
