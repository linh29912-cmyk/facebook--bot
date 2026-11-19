const fs = require('fs');

/**
 * Trình tạo câu trả lời thông minh tích hợp trọn bộ 3 Skill:
 * 1. TUẤN - NGÔN TỪ THÔI MIÊN: Giàu cảm xúc, đời thường, có cảm giác cơ thể.
 * 2. TUẤN - CHỐT SALES KHÔNG LỐI THOÁT: Quy trình 9C, xử lý từ chối đỉnh cao (chê đắt, nghi ngờ, do dự).
 * 3. TUẤN - TÂM SỐ HỌC BÁN HÀNG & THẦN SỐ HỌC: Nhận diện ngày sinh, cá nhân hóa quà tặng bản đồ năng lượng.
 */
class AIAnswerGenerator {
    constructor(config) {
        this.config = config;
        this.knowledge = '';
        this.loadKnowledge();
    }

    loadKnowledge() {
        try {
            if (fs.existsSync(this.config.knowledgeFile)) {
                this.knowledge = fs.readFileSync(this.config.knowledgeFile, 'utf8');
            }
        } catch (e) {
            console.warn('[AI] Không thể đọc knowledge.md:', e.message);
        }
    }

    async generateResponse(commentText, customerName = 'mom', pageInfo = {}) {
        const pageName = pageInfo.name || 'Góc của mẹ';

        // 1. Thử gọi Gemini AI nếu có API Key
        if (this.config.geminiApiKey && this.config.geminiApiKey.length > 10) {
            try {
                const aiResponse = await this.callGeminiAPI(commentText, customerName, pageInfo);
                if (aiResponse && aiResponse.trim().length > 0) {
                    return aiResponse.trim();
                }
            } catch (err) {
                console.error('[AI GEMINI ERROR]', err.message);
            }
        }

        // 2. Dự phòng thông minh chuẩn NGÔN TỪ THÔI MIÊN + 9C CHỐT SALES + TÂM SỐ HỌC
        return this.fallbackSmartResponse(commentText, customerName, pageInfo);
    }

    async callGeminiAPI(commentText, customerName, pageInfo = {}) {
        const apiKey = this.config.geminiApiKey;
        const model = this.config.geminiModel || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const pageName = pageInfo.name || 'Góc của mẹ';

        const prompt = `Bạn là chủ fanpage "${pageName}", áp dụng bộ 3 kỹ năng đỉnh cao:
1. "TUẤN - NGÔN TỪ THÔI MIÊN": Nói thật, chạm thật, câu chữ ấm áp, đời thường, có cảm giác cơ thể (ấm lòng, sốt ruột, ưng bụng, ngọt lịm...).
2. "TUẤN - CHỐT SALES KHÔNG LỐI THOÁT": Quy trình 9C, luôn đồng cảm trước, không tranh cãi, chuyển hóa từ chối (chê đắt, sợ lừa, do dự) thành giải pháp an toàn, dẫn dắt vào Inbox.
3. "TÂM SỐ HỌC BÁN HÀNG": Nếu khách có ngày sinh hoặc hỏi thần số học, khen ngợi năng lượng con số và tặng quà Bản đồ luận giải.

YÊU CẦU PHẢN HỒI:
- Tên khách hàng: ${customerName}
- Bình luận của khách: "${commentText}"
- Fanpage: "${pageName}"
- Phong cách: Cực kỳ gần gũi, xưng hô "em" và "chị/mom ${customerName}".
- Tuyệt đối không dùng văn mẫu AI, không dùng từ ngữ hành chính ("quý khách", "hệ thống").
- Độ dài: 1-3 câu ngắn gọn, ngắt nhịp như lời nói tự nhiên, có icon cảm xúc (❤️, 🥰, 🌸, ✨).
- Chỉ trả lời văn bản thuần túy để đăng comment, không dùng markdown.

${this.knowledge ? `\nKHO KIẾN THỨC BỔ TRỢ:\n${this.knowledge.slice(0, 1000)}` : ''}`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.85,
                maxOutputTokens: 250
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Gemini API HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    fallbackSmartResponse(commentText, customerName) {
        const text = (commentText || '').toLowerCase();

        // 1. KHÁCH ĐỂ LẠI SỐ ĐIỆN THOẠI (Bảo mật tuyệt đối, chống cướp khách)
        if (/(0[3|5|7|8|9][0-9]{8})\b/.test(text)) {
            const templates = [
                `Dạ em nhận được thông tin của mom ${customerName} rùi nè! Để bảo mật số điện thoại không lo người lạ làm phiền em xin phép ẩn comment đi nha, em nhắn tin riêng hỗ trợ hai mẹ con liền đây ạ, mom check tin nhắn nghen! ❤️`,
                `Em lưu số mom ${customerName} rùi nghen! Kẻo người lạ thấy SĐT nên em ẩn comment cho an toàn nè, mom check tin nhắn chờ em hỗ trợ liền nha! 🥰`,
                `Dạ mom ${customerName} ơi, em nhận thông tin rùi nha! Em ẩn số đi cho an toàn nhé, em vừa gửi tin nhắn riêng cho mom rùi á! ✨`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 2. KHÁCH ĐỂ LẠI NGÀY SINH HOẶC HỎI THẦN SỐ HỌC (Tâm số học bán hàng & Thần số học Thịnh Vượng)
        const dateMatch = text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
        if (dateMatch || text.includes('thần số') || text.includes('ngày sinh') || text.includes('sinh ngày') || text.includes('bản đồ') || text.includes('tâm số')) {
            const birth = dateMatch ? dateMatch[1] : '';
            const templates = [
                `Trời ơi em thấy thông tin của mom ${customerName} rùi nè${birth ? ` (${birth})` : ''}! Năng lượng ngày sinh này thông minh và nhạy bén lắm luôn á mom ơi! Em vừa gửi bản đồ luận giải tiềm năng chi tiết qua tin nhắn riêng cho mom rùi nè, mom mở hộp thư xem liền xem chuẩn không nha! ✨`,
                `Dạ ngày sinh đẹp và nhiều lộc lắm mom ${customerName} ơi! Em vừa gửi tặng riêng cho hai mẹ con bản phân tích tính cách và hướng phát triển con qua tin nhắn rùi á, mom check ib để nhận quà ngay nhé! 🥰`,
                `Hihi nhìn ngày sinh của con/mom mà mê tít luôn á mom ${customerName}! Em vừa nhắn tin gửi cẩm nang kích hoạt năng lượng tốt nhất cho bé rùi nè, mom vào xem liền giùm em nghen! 🌸`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 3. KHÁCH CHÊ ĐẮT / KÊU GIÁ CAO (Quy trình 9C: Đồng cảm sâu + Chia nhỏ chi phí + Trợ giá)
        if (text.includes('đắt') || text.includes('mắc') || text.includes('cao quá') || text.includes('chát') || text.includes('tiền đâu') || text.includes('giá cao')) {
            const templates = [
                `Dạ em hiểu tâm lý của mom ${customerName} lắm nè, mới nhìn qua ai cũng thấy xót ruột á! Nhưng tính ra mỗi ngày chỉ bằng 1 ly nước nhỏ thôi mà con cải thiện rõ rệt, mẹ đỡ mất tiền triệu đi viện á mom. Em vừa gửi mã trợ giá đặc biệt qua tin nhắn cho mom rùi nè, mom vào xem liền nha! ❤️`,
                `Trời ơi em nghe mom ${customerName} than mà thấy thương ghê á! Nuôi con trăm thứ phải lo nên đồng tiền nào cũng phải tính kỹ đúng không mom. Em vừa nhắn tin chia sẻ bí quyết dùng tiết kiệm nhất kèm quà trợ giá cho mom rùi á, mom lướt tin nhắn xem giùm em nghen! 🥰`,
                `Dạ mom ${customerName} ơi, đắt sắt ra miếng á mom, quan trọng là con dứt điểm không bị tái đi tái lại mẹ đỡ khổ nè. Em có gửi một suất trợ giá ưu tiên qua tin nhắn cho mom rùi á, mom check hộp thư chờ giúp em nghen! ✨`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 4. KHÁCH NGHI NGỜ / DO DỰ / HỎI HIỆU QUẢ (Quy trình 9C: Giảm rủi ro về 0 + Chứng minh người thật việc thật)
        if (text.includes('hiệu quả') || text.includes('có thật') || text.includes('lừa') || text.includes('chưa tin') || text.includes('suy nghĩ') || text.includes('đắn đo') || text.includes('tốt không') || text.includes('an toàn không')) {
            const templates = [
                `Dạ mom ${customerName} ơi, sức khỏe của con là trên hết nên mom cẩn thận là chuẩn 100% luôn á! Em vừa gửi hình ảnh và phản hồi thực tế của các mom đã dùng qua tin nhắn cho mom rùi nè, mom cứ vào xem tham khảo thoải mái cho an tâm tuyệt đối nha, chưa cần mua vội đâu ạ! 🥰`,
                `Dạ em hoàn toàn đồng ý với mom ${customerName} nè, con mình dùng là phải chắc chắn mới được. Em vừa nhắn tin cho mom toàn bộ giấy tờ chứng nhận và cam kết đồng hành cho mom rùi á, mom check tin nhắn xem thử nghen! 🌸`,
                `Hihi mom ${customerName} kỹ tính thế này là con được nhờ lắm nè! Em vừa gửi cẩm nang trải nghiệm thực tế qua tin nhắn cho mom rùi á, mom xem qua trước cho ưng cái bụng nha! ❤️`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 5. KHÁCH HỎI GIÁ / SHIP / MUA HÀNG / INBOX (Thôi miên kích thích ưu đãi & tò mò)
        if (text.includes('giá') || text.includes('nhiêu') || text.includes('tiền') || text.includes('mua') || text.includes('ib') || text.includes('inbox') || text.includes('đặt') || text.includes('ship')) {
            const templates = [
                `Dạ mom ${customerName} ơi, đợt này đang có ưu đãi trợ giá ngọt lịm luôn á! Em vừa gửi cả bảng giá chi tiết kèm quà xinh qua tin nhắn cho mom rùi nè, mom lướt tin nhắn xem giùm em kẻo lỡ đợt này tiếc lắm nghen! ❤️`,
                `Trời ơi đúng lúc đang có đợt freeship toàn quốc luôn mom ${customerName} ơi! Em vừa nhắn tin chi tiết qua cho mom rùi á, mom mở hộp thư xem liền để nhận suất ưu đãi này nha! 🥰`,
                `Dạ mom ${customerName} ơi, giá đợt này ưng cái bụng lắm nè! Em vừa gửi tin nhắn riêng kèm quà tặng cho mom rùi á, mom để ý mục tin nhắn chờ giúp em nhé! ✨`,
                `Hihi em vừa gửi chi tiết giá kèm ưu đãi độc quyền qua tin nhắn cho mom ${customerName} rùi nè, mom check ib để nhận suất quà xinh cho bé nha! 🌸`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 6. KHÁCH HỎI TƯ VẤN (Ăn dặm, biếng ăn, táo bón, quấy khóc, bỉm sữa)
        if (text.includes('tư vấn') || text.includes('bỉm') || text.includes('size') || text.includes('ăn dặm') || text.includes('tháng') || text.includes('kg') || text.includes('cách') || text.includes('hướng dẫn') || text.includes('sao') || text.includes('biếng ăn') || text.includes('táo') || text.includes('ốm')) {
            const templates = [
                `Đọc cmt của mom mà em thương hai mẹ con ghê, cảnh con biếng ăn hay quấy khóc đúng là mẹ nào cũng sốt cả ruột luôn ấy! Em vừa gửi cẩm nang chi tiết qua tin nhắn cho mom ${customerName} rùi nè, mom vào xem thử để con đỡ vất vả nha mom! 🌸`,
                `Bé nhà mình được mấy tháng mấy cân rùi mom ${customerName} ơi? Em vừa nhắn tin chia sẻ mấy mẹo cực kỳ dễ làm này cho mom rùi nè, mom check hộp thư chờ giúp em để con mau ưng bụng nhé ạ! 🥰`,
                `Dạ mom ${customerName} ơi, hiểu đúng thể trạng của con là chăm nhàn tênh luôn á! Em vừa nhắn tin riêng phân tích kỹ cho mom rùi nè, mom check tin nhắn xem giùm em nghen! ✨`,
                `Dạ nhìn tình trạng con mà thấy thương quá! Em có gửi kinh nghiệm thực chiến qua tin nhắn cho mom ${customerName} rùi nè, mom xem ngay để chăm bé nhẹ nhàng hơn nha! ❤️`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 7. KHÁCH KHEN / CẢM ƠN / TƯƠNG TÁC
        if (text.includes('hay') || text.includes('đẹp') || text.includes('tuyệt') || text.includes('cảm ơn') || text.includes('thank') || text.includes('yêu') || text.includes('thích') || text.length < 5) {
            const templates = [
                `Dạ trời ơi đọc được lời khen của mom ${customerName} mà em vui cả ngày luôn ấy! Cảm ơn mom iu đã luôn đồng hành cùng Góc của mẹ nha, chúc mom và bé trộm vía luôn mạnh khỏe và bình an ngập tràn nè! 🥰`,
                `Hihi nghe mom ${customerName} khen mà ấm hết cả lòng luôn á mom ơi! Chúc thiên thần nhỏ hay ăn chóng lớn, ngoan ngoãn cho mẹ đỡ vất vả nha! 🌸`,
                `Dạ được mom ${customerName} thương và tương tác thế này là động lực lớn nhất của em luôn á! Chúc tổ ấm nhỏ của mom lúc nào cũng ngập tràn tiếng cười nè! ❤️`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 8. MẶC ĐỊNH
        const defaultTemplates = [
            `Dạ em vừa nhắn tin tâm sự với mom ${customerName} rùi nè, mom để ý hộp thư/tin nhắn chờ giúp em nghen! Chúc hai mẹ con ngày mới thật nhiều niềm vui và ấm áp nè! ❤️`,
            `Dạ em cảm ơn mom ${customerName} đã ghé chơi và tương tác cùng Góc của mẹ nha! Em có gửi tin nhắn riêng cho mom rùi á, mom xem giúp em nhé! 🥰`
        ];
        return defaultTemplates[Math.floor(Math.random() * defaultTemplates.length)];
    }
}

module.exports = AIAnswerGenerator;
