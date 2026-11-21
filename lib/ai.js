const fs = require('fs');

/**
 * Trình tạo câu trả lời thông minh tích hợp trọn bộ:
 * 1. TUẤN - NGÔN TỪ THÔI MIÊN: Giàu cảm xúc, đời thường, chạm vào cảm giác cơ thể.
 * 2. TUẤN - CHỐT SALES KHÔNG LỐI THOÁT: Tinh tế, không ép khách, chỉ dẫn vào inbox khi khách thật sự có nhu cầu.
 * 3. TÂM SỐ HỌC BÁN HÀNG & THẦN SỐ HỌC THỊNH VƯỢNG.
 * 4. CHUYÊN SÂU VI CHẤT & DINH DƯỠNG: Hiểu đúng từng triệu chứng và bối cảnh (ăn uống, khen ngợi, bệnh lý, hỏi giá...).
 */
class AIAnswerGenerator {
    constructor(config = {}) {
        this.config = config;
        this.knowledge = '';
        this.loadKnowledge();
    }

    loadKnowledge() {
        try {
            if (this.config.knowledgeFile && fs.existsSync(this.config.knowledgeFile)) {
                this.knowledge = fs.readFileSync(this.config.knowledgeFile, 'utf8');
            }
        } catch (e) {
            console.warn('[AI] Không thể đọc knowledge.md:', e.message);
        }
    }

    /**
     * Chuẩn hóa xưng hô:
     * - Loại bỏ việc ghép tên Fanpage đối thủ (VD: 'Vi chất & Sức khoẻ Phụ nữ 35+', 'Dược sĩ Nga'...)
     * - Loại bỏ chữ 'Khách hàng'
     * - Trả về xưng hô tự nhiên: 'chị iu', 'chị ơi', 'mom ơi', hoặc tên riêng ngắn gọn.
     */
    getSalutation(customerName) {
        if (!customerName || typeof customerName !== 'string') {
            return { call: 'chị ơi', short: 'chị' };
        }

        const cleanName = customerName.replace(/["“”'‘’«»]/g, '').trim();
        const lower = cleanName.toLowerCase();
        const isPageOrGeneric = /(vi chất|dược sĩ|bác sĩ|phụ nữ|daily|mỏ lém|shop|35\+|khách hàng|admin|page|giải mã|hiểu đúng|thông thái|bản đồ|cộng đồng|kinh doanh|mẹ con|nuôi con|bắp|hương|lý|nga|phượng quyên|chiều cao)/i.test(lower);

        // Nếu là tên Fanpage, có ngoặc kép, biệt danh hoặc quá dài hoặc chữ Khách hàng -> Xưng hô tự nhiên
        if (isPageOrGeneric || cleanName.length > 25 || customerName.includes('“') || customerName.includes('"') || lower === 'khách hàng' || lower === 'người dùng facebook') {
            return { call: 'chị ơi', short: 'chị' };
        }

        // Tách lấy tên gọi (chữ cuối cùng của họ tên, ví dụ: "Nguyễn Thu Hà" -> "Hà")
        const parts = cleanName.split(/\s+/);
        const lastName = parts[parts.length - 1];
        if (lastName.length >= 2 && lastName.length <= 10) {
            return { call: `chị ${lastName} ơi`, short: `chị ${lastName}` };
        }

        return { call: 'chị ơi', short: 'chị' };
    }

    async generateResponse(commentText, customerName = '', pageInfo = {}) {
        // 1. Nếu có Gemini API Key hợp lệ thì ưu tiên gọi
        if (this.config.geminiApiKey && this.config.geminiApiKey.length > 15) {
            try {
                const aiResponse = await this.callGeminiAPI(commentText, customerName, pageInfo);
                if (aiResponse && aiResponse.trim().length > 0) {
                    return aiResponse.trim();
                }
            } catch (err) {
                console.error('[AI GEMINI ERROR]', err.message);
            }
        }

        // 2. Chạy bộ não phản xạ chuyên gia dinh dưỡng & ngôn từ thôi miên cực chuẩn
        return this.fallbackSmartResponse(commentText, customerName, pageInfo);
    }

    async callGeminiAPI(commentText, customerName, pageInfo = {}) {
        const apiKey = this.config.geminiApiKey;
        const model = this.config.geminiModel || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const pageName = pageInfo.name || 'HIỂU ĐÚNG VI CHẤT cùng Linh Nguyễn';
        const { call, short } = this.getSalutation(customerName);

        const prompt = `Bạn là chủ fanpage "${pageName}" (chuyên về vi chất dinh dưỡng, sức khỏe người lớn, phụ nữ và trẻ em).
Bạn đang trả lời bình luận của khán giả:
1. XƯNG HÔ: "em" với "${call}".
2. NGUYÊN TẮC QUAN TRỌNG:
   - Nếu khách KHÔNG hỏi mua, KHÔNG hỏi giá, KHÔNG xin tài liệu -> TUYỆT ĐỐI KHÔNG bảo "em đã gửi tin nhắn / check inbox / gửi thông tin chi tiết". Hãy trò chuyện thân thiện, đồng tình, động viên hoặc chúc sức khỏe.
   - Chỉ khi khách hỏi mua, hỏi giá, xin tư vấn liều dùng, hỏi cách bổ sung -> Mới hướng dẫn vào tin nhắn chờ.
   - Nếu khách chia sẻ món ăn, sở thích (thích dưa chuột, thích ăn ổi...) -> Khen ngợi và chia sẻ thêm lợi ích của món đó.
   - Độ dài: 1-2 câu ngắn gọn, ấm áp, tự nhiên như người thật, có icon cảm xúc (❤️, 🥰, 🌸, ✨).

THÔNG TIN:
- Bình luận của khách: "${commentText}"
Chỉ xuất văn bản trả lời, không dùng markdown:`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
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

    fallbackSmartResponse(commentText, rawCustomerName, pageInfo = {}) {
        const text = (commentText || '').toLowerCase().trim();
        const pageName = pageInfo.name || '';
        const { call, short } = this.getSalutation(rawCustomerName);

        // Kiểm tra xem khách có chủ động HỎI THÔNG TIN / XIN TƯ VẤN / HỎI MUA hay không
        const isAsking = /(giá|nhiêu|tiền|mua|đặt|ship|ib|inbox|tư vấn|liều|uống thế nào|cách dùng|bổ sung gì|uống gì|mua ở đâu|sđt|số điện thoại|chỉ cách|hướng dẫn em|uống sao|dùng sao)/i.test(text);

        // ==============================================================
        // 1. KHÁCH ĐỂ LẠI SỐ ĐIỆN THOẠI (Bảo mật tuyệt đối, chống cướp khách)
        // ==============================================================
        if (/(0[3|5|7|8|9][0-9]{8})\b/.test(text)) {
            const templates = [
                `Dạ em nhận được số của ${call} rùi nè! Để bảo mật thông tin tránh người lạ làm phiền em xin phép ẩn comment đi nha, em vừa nhắn tin riêng hỗ trợ chị liền đây ạ, chị check tin nhắn chờ giúp em nghen! ❤️`,
                `Em lưu số ${call} rùi nghen! Kẻo người lạ thấy SĐT làm phiền nên em ẩn bình luận cho an toàn nè, chị check tin nhắn chờ em hỗ trợ ngay nha! 🥰`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // ==============================================================
        // 2. KHÁCH HỎI THẦN SỐ HỌC / ĐỂ LẠI NGÀY SINH
        // ==============================================================
        const dateMatch = text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
        if (dateMatch || text.includes('thần số') || text.includes('ngày sinh') || text.includes('sinh ngày') || text.includes('bản đồ') || text.includes('tâm số')) {
            const birth = dateMatch ? ` (${dateMatch[1]})` : '';
            const templates = [
                `Trời ơi em thấy thông tin ngày sinh của ${call} rùi nè${birth}! Năng lượng bộ số này thông minh và nhạy bén lắm luôn á chị ơi. Em vừa gửi bản đồ luận giải tiềm năng qua tin nhắn riêng cho chị rùi nè, chị mở hộp thư xem liền xem chuẩn không nha! ✨`,
                `Dạ ngày sinh đẹp và nhiều lộc lắm ${short} ơi! Em vừa gửi tặng riêng bản phân tích năng lượng qua tin nhắn rùi á, chị check tin nhắn chờ để nhận quà ngay nhé! 🥰`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // ==============================================================
        // 3. KHÁCH CHIA SẺ MÓN ĂN / HOA QUẢ / SỞ THÍCH ĂN UỐNG
        // (Ví dụ: "chị thích ăn cả 3 món", "thích dưa chuột", "ăn ổi", "toàn ăn 3 quả này"...)
        // -> TUYỆT ĐỐI KHÔNG BẢO GỬI TIN NHẮN! Bàn luận tự nhiên, vui vẻ.
        // ==============================================================
        const isFoodSharing = /(thích|món|quả|dưa chuột|ổi|trứng|đậu đen|trái cây|hoa quả|ăn|nước ép)/i.test(text) && !isAsking;
        if (isFoodSharing) {
            const templates = [
                `Dạ mấy món này vừa lành tính vừa nhiều vitamin tốt cho vóc dáng với làn da lắm luôn á ${short} ơi! Chị duy trì ăn đều đặn để cơ thể lúc nào cũng nhẹ nhàng, khỏe khoắn nha! 🥰✨`,
                `Hihi ăn đúng mấy món này là chuẩn bài luôn á ${short} ơi! Vừa ngon miệng lại thanh mát, giữ dáng cực kỳ ưng bụng. Chúc chị lúc nào cũng tươi trẻ và rạng ngời nghen! 🌸❤️`,
                `Dạ chuẩn luôn nè ${short} ơi! Mấy loại quả này vừa giàu chất xơ vừa cấp nước cực tốt, chị ăn thường xuyên da dẻ lúc nào cũng mịn màng luôn á! 🌿🥰`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // ==============================================================
        // 4. KHÁCH KHEN THẬT SỰ / ĐỘNG VIÊN / LƯU LẠI
        // -> KHÔNG BẢO GỬI TIN NHẮN, CHỈ CẢM ƠN VÀ CHÚC SỨC KHỎE
        // ==============================================================
        const isCompliment = /(hay quá|rất hay|quá hay|bổ ích|tuyệt vời|quá đúng|chuẩn luôn|cảm ơn|thank|tks|lưu lại|chia sẻ hay|video ý nghĩa|thích quá|yêu quá|cưng xỉu)/i.test(text) && !isAsking;
        if (isCompliment) {
            const templates = [
                `Dạ trời ơi đọc được lời động viên của ${short} mà em vui cả ngày luôn ấy! Cảm ơn ${short} iu đã luôn theo dõi và đồng hành cùng em nha. Chúc chị và gia đình lúc nào cũng dồi dào sức khỏe và bình an ngập tràn nè! 🥰🌸`,
                `Hihi nghe ${short} khen mà em có thêm bao nhiêu động lực để tiếp tục chia sẻ á chị ơi! Em chúc tổ ấm của chị lúc nào cũng ngập tràn tiếng cười và tràn đầy năng lượng nha! ✨❤️`,
                `Dạ em cảm ơn ${short} nhiều lắm nè! Thấy chia sẻ của mình giúp ích được cho mọi người là em hạnh phúc nhất trần đời rùi á. Chị tiếp tục theo dõi trang để cùng cập nhật thêm nhiều kiến thức hay chăm sóc sức khỏe nha! 🌿🥰`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // ==============================================================
        // 5. KHÁCH HỎI MUA / HỎI GIÁ / XIN TƯ VẤN (Có từ khóa isAsking)
        // -> HƯỚNG VÀO INBOX HỢP LÝ
        // ==============================================================
        if (text.includes('đắt') || text.includes('mắc') || text.includes('cao quá') || text.includes('chát')) {
            const templates = [
                `Dạ em hiểu tâm lý của ${call} lắm nè, mới nhìn qua ai cũng thấy đắn đo á! Nhưng tính ra mỗi ngày chỉ bằng 1 ly nước nhỏ thôi mà cơ thể khỏe khoắn, đỡ mất tiền triệu đi viện á chị. Em vừa gửi suất trợ giá đặc biệt qua tin nhắn cho chị rùi nè, chị vào xem liền nha! ❤️`,
                `Dạ ${call}, đắt sắt ra miếng á chị ơi, quan trọng là cơ thể khỏe lên rõ rệt và an toàn tuyệt đối nè. Em vừa nhắn tin gửi quà ưu đãi cho chị rùi á, chị check hộp thư chờ giúp em nghen! ✨`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        if (text.includes('giá') || text.includes('nhiêu') || text.includes('tiền') || text.includes('mua') || text.includes('ib') || text.includes('inbox') || text.includes('đặt') || text.includes('ship')) {
            const templates = [
                `Dạ ${call}, đợt này bên em đang có ưu đãi trợ giá ngọt lịm kèm freeship luôn á chị! Em vừa gửi bảng giá chi tiết và quà tặng qua tin nhắn cho chị rùi nè, chị mở hộp thư xem liền kẻo lỡ đợt này tiếc lắm nghen! ❤️`,
                `Dạ ${call}, giá đợt này ưng cái bụng lắm nè chị ơi! Em vừa nhắn tin riêng kèm ưu đãi độc quyền cho chị rùi á, chị để ý mục tin nhắn chờ giúp em nhé! ✨`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // ==============================================================
        // 6. KHÁCH NÓI RÕ VỀ EM BÉ / TRẺ EM
        // ==============================================================
        const isForChild = /(bé|con|cháu|ăn dặm|tháng tuổi|cân nặng|biếng ăn|tăng cân|d3|k2|còi xương|chậm lớn|táo bón)/i.test(text);
        if (isForChild) {
            if (isAsking) {
                return `Dạ ${call}, bé nhà mình hiện tại được mấy tháng mấy cân rùi nè chị? Em vừa nhắn tin chia sẻ phác đồ chi tiết cho bé qua tin nhắn riêng cho chị rùi nè, chị check hộp thư chờ giúp em nghen! 🌸`;
            } else {
                return `Hihi đọc cmt của ${call} mà thương hai mẹ con ghê á! Chăm bé đúng là cần nhiều kiên nhẫn lắm nè, chúc em bé nhà mình trộm vía ăn ngoan ngủ kỹ và luôn khỏe mạnh nha chị ơi! 🥰🌸`;
            }
        }

        // ==============================================================
        // 7. TRIỆU CHỨNG SỨC KHỎE NGƯỜI LỚN
        // (Nếu khách chỉ than/chia sẻ triệu chứng mà KHÔNG hỏi xin gì -> Đồng cảm + dặn dò, KHÔNG bảo đã gửi tin nhắn)
        // (Nếu khách có hỏi 'bổ sung gì', 'tư vấn em' -> Mới hướng dẫn vào inbox)
        // ==============================================================

        // 7.1. HỤT HƠI, TIM ĐẬP NHANH, HAY LO, HỒI HỘP
        if (text.includes('hụt hơi') || text.includes('tim đập') || text.includes('hồi hộp') || text.includes('hay lo') || text.includes('lo âu') || text.includes('bồn chồn') || text.includes('thở dốc') || text.includes('khó thở')) {
            if (isAsking) {
                return `Dạ ${call}, tình trạng hay lo âu, tim đập nhanh hoặc hụt hơi rất hay gặp khi cơ thể thiếu Magie hoặc thiếu máu cơ tim á chị! Em vừa nhắn tin chia sẻ phác đồ bổ sung an toàn qua tin nhắn riêng cho chị rùi nè, chị vào xem liền giúp em nghen! ✨`;
            } else {
                return `Dạ ${call}, người hay lo âu, tim đập nhanh hoặc thỉnh thoảng hụt hơi thường là do cơ thể đang thiếu Magie và vi chất điều hòa thần kinh tim đó ạ. Chị chú ý nghỉ ngơi, tránh thức khuya và ăn thêm thực phẩm giàu Magie nha! Cần hỗ trợ gì chị cứ nhắn em nhé! ❤️`;
            }
        }

        // 7.2. HAY MỆT, MỆT MỎI, UỂ OẢI, ĐAU KHỚP
        if (text.includes('mệt') || text.includes('uể oải') || text.includes('kiệt sức') || text.includes('đuối') || text.includes('suy nhược') || text.includes('đau khớp') || text.includes('khớp')) {
            if (isAsking) {
                return `Dạ ${call}, người hay mệt mỏi, uể oải dù ngủ đủ giấc thường là tín hiệu cơ thể đang thiếu hụt Sắt, Magie hoặc vitamin nhóm B chuyển hóa năng lượng đó ạ! Em vừa gửi cẩm nang các vi chất giúp hồi phục thể lực nhanh qua tin nhắn riêng cho chị rùi nè, chị check hộp thư chờ xem giúp em nghen! ❤️`;
            } else {
                return `Dạ ${call}, người hay mệt mỏi, uể oải là cơ thể đang lên tiếng báo động thiếu hụt vi chất và kiệt sức đó chị. Chị nhớ uống đủ nước, bồi bổ thêm dinh dưỡng và ngủ đủ giấc nha! Chúc chị mau khỏe khoắn trở lại nè! 🥰🌸`;
            }
        }

        // 7.3. THIẾU MAGIE
        if (text.includes('magie') || text.includes('megie') || text.includes('mg')) {
            if (isAsking) {
                return `Dạ ${call}, thiếu Magie làm cơ bắp rất hay mỏi, bồn chồn lo âu và ngủ không sâu đó ạ! Em vừa nhắn tin phân tích kỹ cách chọn loại Magie hữu cơ dễ hấp thu qua tin nhắn riêng cho chị rùi nè, chị check hộp thư chờ giúp em nghen! ❤️`;
            } else {
                return `Dạ chuẩn luôn ${short} ơi, Magie tham gia vào hơn 300 phản ứng của cơ thể nên thiếu một cái là người hay mỏi mệt và căng thẳng liền à. Chị nhớ bổ sung thêm các loại hạt, rau xanh đậm để nạp thêm Magie tự nhiên nha! 🌿🥰`;
            }
        }

        // 7.4. MẤT NGỦ, KHÓ NGỦ
        if (text.includes('mất ngủ') || text.includes('khó ngủ') || text.includes('trằn trọc')) {
            if (isAsking) {
                return `Dạ ${call}, mất ngủ trằn trọc mệt người dữ lắm luôn á chị! Em vừa nhắn tin gửi thực đơn bổ sung vi chất hỗ trợ giấc ngủ sâu qua tin nhắn cho chị rùi nè, chị check ib xem giùm em nhé! 🥰`;
            } else {
                return `Dạ ${call}, giấc ngủ là vàng mà mất ngủ lâu ngày cơ thể suy nhược lắm luôn á chị. Chị nhớ ngâm chân nước ấm trước khi ngủ và bổ sung thêm thực phẩm giàu Magie, Kẽm để hệ thần kinh được thư giãn nha! ✨❤️`;
            }
        }

        // 7.5. TÓC BẠC, RỤNG TÓC, MẮT MỜ, DA KHÔ
        if (text.includes('tóc') || text.includes('bạc') || text.includes('rụng') || text.includes('mắt') || text.includes('mờ') || text.includes('da') || text.includes('khô')) {
            if (isAsking) {
                return `Dạ ${call}, dấu hiệu này cho thấy cơ thể đang thiếu hụt vi chất nuôi dưỡng tế bào từ sâu bên trong á chị! Em vừa gửi cẩm nang dinh dưỡng phục hồi qua tin nhắn riêng cho chị rùi nè, chị mở xem tham khảo nha! 🌸`;
            } else {
                return `Dạ ${call}, những dấu hiệu này đều là tín hiệu cơ thể nhắc mình cần chăm sóc và nạp thêm vitamin thiết yếu đó chị. Chị chú ý ăn uống đa dạng và giữ tinh thần thoải mái nha! Chúc chị luôn khỏe đẹp rạng ngời nè! 🥰✨`;
            }
        }

        // ==============================================================
        // 8. MẶC ĐỊNH CHO TẤT CẢ CÁC TRƯỜNG HỢP CÒN LẠI
        // (TUYỆT ĐỐI KHÔNG BẢO ĐÃ GỬI TIN NHẮN)
        // ==============================================================
        const defaultTemplates = [
            `Dạ em cảm ơn ${call} đã luôn theo dõi và tương tác cùng em nha! Chúc chị một ngày thật nhiều niềm vui, an lành và dồi dào sức khỏe nè! 🥰🌸`,
            `Hihi em cảm ơn ${call} nhiều lắm nè! Chúc tổ ấm của chị lúc nào cũng ngập tràn tiếng cười và tràn đầy năng lượng tích cực nha! ✨❤️`
        ];
        return defaultTemplates[Math.floor(Math.random() * defaultTemplates.length)];
    }

    /**
     * TẠO CÂU TRẢ LỜI TIN NHẮN MESSENGER TỰ ĐỘNG (1-1)
     * Tư vấn chuyên sâu, đồng cảm, ngôn từ thôi miên & chốt sales tinh tế
     */
    async generateMessengerResponse(messageText, customerName = '', pageInfo = {}, conversationHistory = []) {
        if (this.config.geminiApiKey && this.config.geminiApiKey.length > 15) {
            try {
                const aiResponse = await this.callGeminiMessengerAPI(messageText, customerName, pageInfo, conversationHistory);
                if (aiResponse && aiResponse.trim().length > 0) {
                    return aiResponse.trim();
                }
            } catch (err) {
                console.error('[AI MESSENGER GEMINI ERROR]', err.message);
            }
        }

        return this.fallbackSmartMessengerResponse(messageText, customerName, pageInfo);
    }

    async callGeminiMessengerAPI(messageText, customerName, pageInfo = {}, conversationHistory = []) {
        const apiKey = this.config.geminiApiKey;
        const model = this.config.geminiModel || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const pageName = pageInfo.name || 'HIỂU ĐÚNG VI CHẤT cùng Linh Nguyễn';
        const { call, short } = this.getSalutation(customerName);

        const prompt = `Bạn là chủ/chuyên gia tư vấn của Fanpage "${pageName}" (chuyên về vi chất dinh dưỡng, sức khỏe người lớn, phụ nữ và trẻ em).
Bạn đang nhắn tin trò chuyện trực tiếp 1-1 qua Facebook Messenger với khách hàng:
1. XƯNG HÔ: Tự xưng "em" (hoặc "em Linh"), gọi khách là "${call}" (hoặc "${short}").
2. PHONG CÁCH TƯ VẤN:
   - Ấm áp, gần gũi, ngôn từ thôi miên giàu cảm xúc, chạm đúng tâm lý.
   - Thấu hiểu và đồng cảm sâu với tình trạng của khách (mệt mỏi, lo âu, thiếu ngủ, chăm con vất vả...).
   - Nếu khách chia sẻ triệu chứng người lớn (mệt mỏi, hay lo, tim đập nhanh, thiếu magie, hụt hơi, mất ngủ): Giải thích ngắn gọn nguyên nhân thiếu vi chất (Magie B6, Vitamin B, Sắt) và đưa ra lời khuyên thiết thực.
   - Nếu khách hỏi cho bé (biếng ăn, chậm tăng cân, rụng tóc vành khăn, mồ hôi trộm): Hỏi nhẹ nhàng tháng tuổi và cân nặng của bé để tư vấn phác đồ và liều dùng chuẩn.
   - Nếu khách hỏi giá/mua hàng: Báo ưu đãi trợ giá ngọt ngào, freeship, tặng quà, gửi bảng giá.
   - Cuối tin nhắn: Luôn kết thúc bằng một câu hỏi mở ân cần để khách dễ trò chuyện tiếp.
   - Độ dài: Vừa vặn (khoảng 3 - 5 câu), trình bày thoáng mắt, dùng icon cảm xúc tinh tế (❤️, 🥰, 🌸, ✨, 🌿).

THÔNG TIN:
- Tin nhắn của khách: "${messageText}"
Chỉ xuất nội dung tin nhắn gửi khách, không dùng markdown:`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 400
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Gemini Messenger API HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    fallbackSmartMessengerResponse(messageText, rawCustomerName, pageInfo = {}) {
        const text = (messageText || '').toLowerCase().trim();
        const { call, short } = this.getSalutation(rawCustomerName);
        const pageName = pageInfo.name || '';
        const isLinhPage = pageName.includes('Linh') || pageName.includes('VI CHẤT');
        const selfName = isLinhPage ? 'em Linh' : 'em';

        // 1. Khách để lại SĐT
        if (/(0[3|5|7|8|9][0-9]{8})\b/.test(text)) {
            return `Dạ ${selfName} nhận được số điện thoại của ${call} rùi nè! Em sẽ chủ động kết nối hỗ trợ chị ngay để tư vấn kỹ lưỡng nhất nhé. Chị để ý điện thoại giúp em nha! ❤️`;
        }

        // 2. Khách hỏi về Bé / Con
        const isForChild = /(bé|con|cháu|ăn dặm|tháng tuổi|cân nặng|biếng ăn|tăng cân|d3|k2|còi xương|chậm lớn|táo bón)/i.test(text);
        if (isForChild) {
            return `Dạ ${selfName} chào ${short} iu nè! Chăm sóc bé đúng là cần nhiều sự tỉ mỉ và kiên nhẫn lắm á chị ơi. Chị chia sẻ thêm giúp em bé nhà mình hiện được mấy tháng, mấy cân và đang gặp tình trạng cụ thể thế nào để em hướng dẫn phác đồ và liều dùng chuẩn nhất cho con mau khỏe mạnh nghen! 🌸🥰`;
        }

        // 3. Khách bị Mệt mỏi, Hụt hơi, Tim đập nhanh, Hay lo, Thiếu Magie
        if (text.includes('hụt hơi') || text.includes('tim') || text.includes('lo') || text.includes('hồi hộp') || text.includes('thở dốc') || text.includes('magie') || text.includes('megie')) {
            return `Dạ ${selfName} chào ${short} nha! Tình trạng người hay hồi hộp, tim đập nhanh, hụt hơi hoặc hay lo âu, mệt mỏi rất thường gặp khi cơ thể đang bị thiếu hụt Magie và các vitamin nhóm B điều hòa thần kinh tim đó chị. Thiếu Magie làm cơ tim co bóp không đều và thần kinh dễ bồn chồn. Chị đang bị tình trạng này lâu chưa chị ha? Đợt này chị có hay bị mất ngủ hay áp lực công việc không nè để em hướng dẫn chị cách bổ sung vi chất cho người nhẹ nhõm, khỏe khoắn nghen! ❤️✨`;
        }

        // 4. Khách bị Mệt mỏi, Uể oải, Suy nhược, Đau khớp
        if (text.includes('mệt') || text.includes('uể oải') || text.includes('đuối') || text.includes('khớp') || text.includes('suy nhược')) {
            return `Dạ ${selfName} chào ${short} nè! Người mà cứ hay mệt mỏi, uể oải dù ngủ đủ giấc là tín hiệu cơ thể đang báo động thiếu hụt vi chất chuyển hóa năng lượng (như Sắt, Magie, Vitamin B) đó chị ơi. Để lâu người sẽ rất uể oải và giảm sức đề kháng. Chị bị tình trạng này nhiều vào buổi sáng hay cả ngày vậy chị? Chị chia sẻ thêm với em để em lên giải pháp bồi bổ chuẩn cho chị nghen! 🥰🌿`;
        }

        // 5. Khách bị Mất ngủ, Khó ngủ, Trằn trọc
        if (text.includes('mất ngủ') || text.includes('khó ngủ') || text.includes('trằn trọc')) {
            return `Dạ ${selfName} chào ${short} nha! Giấc ngủ quý như vàng mà đêm nằm cứ trằn trọc khó ngủ thì ban ngày người mệt mỏi và đau đầu dữ lắm luôn á chị. Thường mất ngủ là do hệ thần kinh bị căng thẳng và thiếu hụt Magie, Melatonin tự nhiên. Chị bị mất ngủ bao lâu rồi chị ha? Chị có hay bị đau mỏi vai gáy đi kèm không nè chị? 🌸❤️`;
        }

        // 6. Khách hỏi Mua / Hỏi Giá / Chi phí
        if (text.includes('giá') || text.includes('nhiêu') || text.includes('tiền') || text.includes('mua') || text.includes('đặt') || text.includes('ship')) {
            return `Dạ ${selfName} chào ${call} iu nha! Đợt này bên em đang có chương trình trợ giá cực kỳ ngọt ngào kèm quà tặng và miễn phí giao hàng toàn quốc luôn nè chị ơi! Chị đang quan tâm dòng vi chất cho người lớn hay cho bé nhà mình để em gửi chi tiết bảng giá ưu đãi và quà tặng cho chị xem liền nghen! ✨🥰`;
        }

        // 7. Khách tương tác video / khen ngợi
        if (text.includes('hay') || text.includes('cảm ơn') || text.includes('thích') || text.includes('bổ ích')) {
            return `Hihi ${selfName} cảm ơn ${short} nhiều lắm nha! Đọc được tin nhắn của chị mà em có thêm bao nhiêu động lực luôn á. Chúc chị và gia đình lúc nào cũng ngập tràn sức khỏe, bình an và niềm vui nghen! Cần em hỗ trợ thêm thông tin gì chị cứ nhắn em nhé! 🥰🌸`;
        }

        // 8. Chào hỏi / Tin nhắn chung
        return `Dạ ${selfName} chào ${call} nha! Em rất vui được hỗ trợ chị nè. Hiện tại chị đang cần tư vấn về vấn đề sức khỏe hay vi chất dinh dưỡng nào, chị cứ nhắn em chia sẻ chi tiết cùng chị nghen! Chúc chị một ngày thật nhiều niềm vui nè! 🥰✨`;
    }
}

module.exports = AIAnswerGenerator;
