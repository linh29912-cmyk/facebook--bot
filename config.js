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

    // Nạp danh sách các Fanpage (Hỗ trợ ĐA FANPAGE)
    let pages = [];
    if (process.env.PAGES_CONFIG) {
        try {
            pages = JSON.parse(process.env.PAGES_CONFIG);
        } catch (e) {
            console.warn('[CONFIG] Không thể parse biến PAGES_CONFIG JSON:', e.message);
        }
    } else {
        const pagesJsonPath = path.join(__dirname, 'pages.json');
        if (fs.existsSync(pagesJsonPath)) {
            try {
                pages = JSON.parse(fs.readFileSync(pagesJsonPath, 'utf8'));
            } catch (e) {
                console.warn('[CONFIG] Không thể đọc file pages.json:', e.message);
            }
        }
    }

    const defaultPageId = process.env.FB_PAGE_ID || loaded.FB_PAGE_ID || '';
    const defaultPageToken = process.env.FB_PAGE_ACCESS_TOKEN || loaded.FB_PAGE_ACCESS_TOKEN || '';

    // Nếu pages chưa có danh sách thì nạp page mặc định từ FB_PAGE_ID
    if (!Array.isArray(pages) || pages.length === 0) {
        if (defaultPageId && defaultPageToken) {
            pages = [{
                id: defaultPageId,
                name: 'Góc của mẹ',
                token: defaultPageToken,
                persona: 'mom_and_baby',
                knowledgeFile: path.join(__dirname, 'knowledge.md')
            }];
        }
    }

    return {
        // Danh sách Đa Page
        pages: pages,
        defaultPageId: defaultPageId,
        defaultPageToken: defaultPageToken,
        
        // Cấu hình AI Gemini
        geminiApiKey: process.env.GEMINI_API_KEY || loaded.GEMINI_API_KEY || '',
        geminiModel: loaded.GEMINI_MODEL || 'gemini-1.5-flash',

        // CẤU HÌNH ĐỘ TRỄ MÔ PHỎNG NGƯỜI THẬT (CHỐNG KHÓA / CHỐNG SPAM)
        delayMinSeconds: parseInt(loaded.DELAY_MIN_SECONDS || '35', 10),
        delayMaxSeconds: parseInt(loaded.DELAY_MAX_SECONDS || '90', 10),
        spacingBetweenComments: parseInt(loaded.SPACING_BETWEEN_COMMENTS || '25', 10),
        scanIntervalSeconds: parseInt(loaded.SCAN_INTERVAL_SECONDS || '60', 10),
        postLimit: parseInt(loaded.POST_LIMIT || '5', 10),
        maxRepliesPerHour: parseInt(loaded.MAX_REPLIES_PER_HOUR || '30', 10),
        autoHidePhone: loaded.AUTO_HIDE_PHONE !== 'false',
        enablePrivateReply: loaded.ENABLE_PRIVATE_REPLY === 'true',

        // CẤU HÌNH MESSENGER BOT TỰ ĐỘNG TRẢ LỜI TIN NHẮN
        enableMessengerBot: loaded.ENABLE_MESSENGER_BOT !== 'false',
        messengerScanIntervalSeconds: parseInt(loaded.MESSENGER_SCAN_INTERVAL_SECONDS || '45', 10),
        webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN || loaded.WEBHOOK_VERIFY_TOKEN || 'goc_cua_me_secret_token_2026',
        messengerHistoryFile: path.join(__dirname, 'replied_messages.json'),

        // File lưu lịch sử đã reply
        historyFile: path.join(__dirname, 'replied_comments.json'),
        knowledgeFile: path.join(__dirname, 'knowledge.md')
    };
}

module.exports = loadEnv;
