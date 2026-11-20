const fs = require('fs');

/**
 * Trình tạo câu trả lời thông minh tích hợp trọn bộ 3 Skill:
 * 1. TUẤN - NGÔN TỪ THÔI MIÊN: Giàu cảm xúc, đời thường, chạm vào cảm giác cơ thể.
 * 2. TUẤN - CHỐT SALES KHÔNG LỐI THOÁT: Quy trình 9C, đồng cảm sâu, dẫn dắt vào Inbox.
 * 3. TÂM SỐ HỌC BÁN HÀNG & THẦN SỐ HỌC THỊNH VƯỢNG.
 * 4. CHUYÊN SÂU VI CHẤT & DINH DƯỠNG: Hiểu đúng từng triệu chứng (mệt mỏi, hụt hơi, tim đập nhanh, thiếu magie, mất ngủ, tóc bạc, mắt mờ...).
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

        const lower = customerName.trim().toLowerCase();
        const isPageOrGeneric = /(vi chất|dược sĩ|bác sĩ|phụ nữ|daily|mỏ lém|shop|35\+|khách hàng|admin|page|giải mã|hiểu đúng|thông thái|bản đồ|cộng đồng|kinh doanh|mẹ con|nuôi con|bắp|hương|lý|nga|phượng quyên)/i.test(lower);

        // Nếu là tên Fanpage hoặc quá dài hoặc chữ Khách hàng -> Xưng hô tự nhiên
        if (isPageOrGeneric || customerName.length > 25 || lower === 'khách hàng' || lower === 'người dùng facebook') {
            return { call: 'chị ơi', short: 'chị' };
        }

        // Tách lấy tên gọi (chữ cuối cùng của họ tên, ví dụ: "Nguyễn Thu Hà" -> "Hà")
        const parts = customerName.trim().split(/\s+/);
        const lastName = parts[parts.length - 1];
        if (lastName.length >= 2 && lastName.length <= 10) {
            return { call: `chị ${lastName} ơi`, short: `chị ${lastName}` };
        }

        return { call: `chị ${customerName} ơi`, short: `chị ${customerName}` };
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
Bạn đang trả lời bình luận của khán giả bằng phong cách:
1. NGÔN TỪ THÔI MIÊN: Nói thật, chạm thật, đồng cảm sâu, xưng hô ấm áp ("em" với "${call}").
2. ĐÚNG TRỌNG TÂM CÂU HỎI: 
   - Nếu khách nói về triệu chứng người lớn (mệt mỏi, hụt hơi, tim đập nhanh, thiếu magie, mất ngủ, tóc bạc, mắt mờ...) -> BẮT BUỘC tư vấn đúng triệu chứng người lớn, TUYỆT ĐỐI KHÔNG hỏi về em bé hay tháng tuổi cân nặng của bé.
   - Chỉ khi khách hỏi rõ về con/bé/ăn dặm/còi xương -> Mới tư vấn cho bé.
   - Nếu khách khen -> Cảm ơn chân thành, chúc sức khỏe.
   - Hướng khách vào kiểm tra tin nhắn chờ (Inbox) để nhận cẩm nang / phác đồ chi tiết.
3. Độ dài: 2-3 câu ngắn gọn, tự nhiên như lời nói, kèm icon cảm xúc (❤️, 🥰, 🌸, ✨).

THÔNG TIN:
- Xưng hô với khách: ${call}
- Bình luận của khách: "${commentText}"
Chỉ xuất văn bản thuần túy không dùng markdown:`;

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

        // ==============================================================
        // 1. KHÁCH ĐỂ LẠI SỐ ĐIỆN THOẠI (Bảo mật tuyệt đối, chống cướp khách)
        // ==============================================================
        if (/(0[3|5|7|8|9][0-9]{8})\b/.test(text)) {
            const templates = [
                `Dạ em nhận được số của ${call} rùi nè! Để bảo mật thông tin tránh người lạ làm phiền em xin phép ẩn comment đi nha, em vừa nhắn tin riêng hỗ trợ chị liền đây ạ, chị check tin nhắn chờ giúp em nghen! ❤️`,
                `Em lưu số ${call} rùi nghen! Kẻo người lạ thấy SĐT làm phiền nên em ẩn bình luận cho an toàn nè, chị check tin nhắn chờ em hỗ trợ ngay nha! 🥰`,
                `Dạ ${call}, em nhận thông tin rùi nha! Em ẩn số đi cho an toàn nhé, em vừa gửi tin nhắn riêng qua Facebook cho chị rùi á! ✨`
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
        // 3. KHÁCH NÓI RÕ VỀ EM BÉ / TRẺ EM (Chỉ xử lý bé khi có từ khóa rõ ràng)
        // ==============================================================
        const isForChild = /(bé|con|cháu|ăn dặm|tháng tuổi|cân nặng|biếng ăn|tăng cân|d3|k2|còi xương|chậm lớn|táo bón)/i.test(text);
        if (isForChild) {
            const templates = [
                `Dạ ${call}, bé nhà mình hiện tại được mấy tháng mấy cân rùi nè chị? Bổ sung cho con quan trọng nhất là phải đúng liều và đúng thời điểm mới hấp thu tối đa á chị. Em vừa nhắn tin chia sẻ phác đồ chi tiết qua tin nhắn cho chị rùi nè, chị check hộp thư chờ giúp em nghen! 🌸`,
                `Hihi đọc cmt của ${call} mà thương hai mẹ con ghê á! Em vừa gửi cẩm nang phối hợp vi chất an toàn cho bé qua tin nhắn riêng cho chị rùi nè, chị mở tin nhắn xem qua để đồng hành cùng con nhàn tênh nha! 🥰`,
                `Dạ ${call}, hiểu đúng thể trạng của con là chăm nhàn tênh luôn á! Em vừa nhắn tin riêng hướng dẫn kỹ cho chị rùi nè, chị để ý mục tin nhắn chờ giúp em nghen! ✨`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // ==============================================================
        // 4. TRIỆU CHỨNG SỨC KHỎE NGƯỜI LỚN / DẤU HIỆU CƠ THỂ THIẾU CHẤT
        // (Đây là nội dung các video đang chạy: mệt mỏi, hụt hơi, magie, mất ngủ, tim đập nhanh, tóc bạc, mắt mờ...)
        // ==============================================================

        // 4.1. HỤT HƠI, TIM ĐẬP NHANH, HAY LO, HỒI HỘP, BỒN CHỒN
        if (text.includes('hụt hơi') || text.includes('tim đập') || text.includes('hồi hộp') || text.includes('hay lo') || text.includes('lo âu') || text.includes('bồn chồn') || text.includes('thở dốc') || text.includes('khó thở')) {
            const templates = [
                `Dạ ${call}, tình trạng hay lo âu, tim đập nhanh hoặc thỉnh thoảng hụt hơi rất hay gặp khi cơ thể thiếu hụt Magie hoặc thiếu máu nuôi cơ tim đó ạ! Em vừa nhắn tin chia sẻ phác đồ bổ sung Magie và vi chất điều hòa nhịp tim qua tin nhắn riêng cho chị rùi nè, chị vào xem liền giúp em nghen! ✨`,
                `Dạ ${call}, triệu chứng hụt hơi với hay hồi hộp lo âu thường là do hệ thần kinh thực vật đang thiếu Magie và vitamin nhóm B dẫn truyền á chị. Em vừa gửi mẹo cân bằng nhịp thở và cách bổ sung chuẩn qua tin nhắn cho chị rùi nè, chị check tin nhắn chờ giùm em nha! 🥰`,
                `Trời ơi nghe ${short} tả mà em đồng cảm ghê á! Hụt hơi với tim đập nhanh làm người lúc nào cũng nơm nớp mệt mỏi. Em vừa gửi cẩm nang dinh dưỡng phục hồi qua tin nhắn riêng cho chị rùi nè, chị check ib xem ngay nhé! ❤️`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 4.2. HAY MỆT, MỆT MỎI, UỂ OẢI, ĐUỐI SỨC
        if (text.includes('mệt') || text.includes('uể oải') || text.includes('kiệt sức') || text.includes('đuối') || text.includes('suy nhược') || text.includes('hết hơi')) {
            const templates = [
                `Dạ ${call}, người hay mệt mỏi, uể oải dù ngủ đủ giấc thường là tín hiệu cơ thể đang thiếu hụt Sắt, Magie hoặc vitamin nhóm B chuyển hóa năng lượng đó ạ! Em vừa gửi cẩm nang các vi chất giúp hồi phục thể lực nhanh qua tin nhắn riêng cho chị rùi nè, chị check hộp thư chờ xem giúp em nghen! ❤️`,
                `Dạ ${call}, tình trạng người lúc nào cũng mệt mỏi đuối sức làm việc gì cũng thấy ngại đúng không chị. Em vừa gửi bảng thực phẩm và hướng dẫn bổ sung vi chất phục hồi năng lượng qua tin nhắn cho chị rùi nè, chị mở tin nhắn xem giùm em nhé! 🌸`,
                `Hihi em hiểu cảm giác này của ${short} lắm á, cơ thể thiếu chất là nó biểu tình mệt mỏi liền à. Em vừa nhắn tin chia sẻ chi tiết cách bồi hoàn năng lượng cho chị rùi nè, chị vào kiểm tra tin nhắn giúp em nha! 🥰`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 4.3. THIẾU MAGIE (MAGNESIUM)
        if (text.includes('magie') || text.includes('megie') || text.includes('mg')) {
            const templates = [
                `Dạ ${call}, thiếu Magie làm cơ bắp rất hay mỏi, người bồn chồn lo âu, tim đập nhanh và giấc ngủ không sâu đó ạ! Em vừa nhắn tin phân tích kỹ cách chọn loại Magie hữu cơ dễ hấp thu qua tin nhắn riêng cho chị rùi nè, chị check hộp thư chờ giúp em nghen! ❤️`,
                `Dạ em hiểu mà ${short} ơi, Magie tham gia vào hơn 300 phản ứng của cơ thể nên khi thiếu hụt là người mệt và căng thẳng thần kinh liền à. Em vừa gửi hướng dẫn bổ sung Magie chuẩn liều qua tin nhắn riêng cho chị rùi nè, chị mở xem giúp em nhé! 🌸`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 4.4. MẤT NGỦ, KHÓ NGỦ, TRẰN TRỌC
        if (text.includes('mất ngủ') || text.includes('khó ngủ') || text.includes('trằn trọc') || text.includes('chập chờn') || text.includes('thức giấc')) {
            const templates = [
                `Dạ ${call}, mất ngủ hay đêm nằm trằn trọc mệt người dữ lắm luôn á chị! Thiếu hụt Magie và Kẽm là nguyên nhân hàng đầu khiến tế bào thần kinh căng thẳng khó vào giấc. Em vừa nhắn tin gửi thực đơn bổ sung vi chất hỗ trợ giấc ngủ sâu qua tin nhắn cho chị rùi nè, chị check ib xem giùm em nhé! 🥰`,
                `Dạ ${call}, giấc ngủ là vàng mà mất ngủ lâu ngày dễ làm tim đập nhanh và suy nhược lắm á chị. Em vừa gửi bí quyết bổ sung vi chất thư giãn hệ thần kinh qua tin nhắn riêng cho chị rùi nè, chị vào xem ngay nha! ✨`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 4.5. TÓC BẠC SỚM, RỤNG TÓC
        if (text.includes('tóc') || text.includes('bạc') || text.includes('rụng')) {
            const templates = [
                `Dạ ${call}, tóc bạc sớm hay rụng nhiều thường là do nang tóc thiếu máu nuôi dưỡng, thiếu Sắt, Kẽm và Biotin (B7) á chị! Em vừa gửi cẩm nang dinh dưỡng nuôi tóc đen mượt từ gốc qua tin nhắn riêng cho chị rùi nè, chị vào xem tham khảo nha! ✨`,
                `Dạ ${call}, mới ngoài 30-40 mà tóc bạc sớm là cơ thể đang báo hiệu thận khí và khí huyết cần bồi bổ đó chị. Em vừa nhắn tin chia sẻ các loại thực phẩm vàng cho mái tóc qua tin nhắn cho chị rùi á, chị check ib xem liền nha! 🌸`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 4.6. MẮT MỜ, MỎI MẮT, KHÔ MẮT
        if (text.includes('mắt') || text.includes('mờ') || text.includes('khô mắt') || text.includes('nhìn mờ')) {
            const templates = [
                `Dạ ${call}, mắt mờ và nhanh mỏi là báo hiệu mắt đang làm việc quá tải và thiếu hụt Vitamin A, Lutein, Zeaxanthin và Omega-3 bảo vệ điểm vàng đó ạ! Em vừa nhắn tin chia sẻ bài tập mắt và nhóm thực phẩm bổ mắt qua tin nhắn cho chị rùi nè, chị check hộp thư giúp em nha! 🌸`,
                `Dạ ${call}, mắt mờ để lâu nhìn rất mỏi và nhức đầu á chị. Em vừa gửi cẩm nang phục hồi thị lực tự nhiên qua tin nhắn riêng cho chị rùi nè, chị mở xem giùm em nghen! 🥰`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 4.7. DA KHÔ, NỨT NẺ, SẠM DA
        if (text.includes('da') || text.includes('khô') || text.includes('nứt')) {
            const templates = [
                `Dạ ${call}, da khô ráp nứt nẻ thường do cơ thể thiếu hụt Vitamin E, Omega-3 và thiếu nước ở màng tế bào á chị! Em vừa gửi cách bổ sung vi chất cấp ẩm từ sâu bên trong qua tin nhắn riêng cho chị rùi nè, chị mở xem giúp em nghen! ❤️`,
                `Dạ ${call}, chăm da từ bên trong bao giờ cũng bền và đẹp tự nhiên nhất á chị. Em vừa nhắn tin gửi thực đơn dưỡng ẩm cho da qua tin nhắn cho chị rùi nè, chị check ib xem giùm em nha! 🌸`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // 4.8. HỎI BỔ SUNG GÌ / UỐNG GÌ / DÙNG GÌ (Chung cho người lớn)
        if (text.includes('bổ sung gì') || text.includes('uống gì') || text.includes('dùng gì') || text.includes('uống') || text.includes('liều')) {
            const templates = [
                `Dạ ${call}, để bổ sung vi chất đúng và trúng nhất, mình cần dựa vào thể trạng và biểu hiện thực tế của cơ thể á chị. Em vừa gửi bảng tự kiểm tra dấu hiệu thiếu chất qua tin nhắn riêng cho chị rùi nè, chị check hộp thư chờ giúp em để em tư vấn chuẩn cho chị nha! 🌸`,
                `Dạ ${call}, nhiều chị bổ sung sai loại hoặc sai giờ làm cơ thể không hấp thu được phí lắm á chị! Em vừa nhắn tin chia sẻ nguyên tắc kết hợp vi chất an toàn qua tin nhắn riêng cho chị rùi nè, chị mở xem giùm em nghen! 🥰`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // ==============================================================
        // 5. KHÁCH KHEN THẬT SỰ / ĐỘNG VIÊN / LƯU LẠI
        // (TUYỆT ĐỐI không check 'hay' đơn lẻ để tránh nhầm 'hay mệt', 'hay lo')
        // ==============================================================
        const isCompliment = /(hay quá|rất hay|quá hay|bổ ích|tuyệt vời|quá đúng|chuẩn luôn|cảm ơn|thank|tks|lưu lại|chia sẻ hay|video ý nghĩa|thích quá|yêu quá|cưng xỉu)/i.test(text);
        if (isCompliment) {
            const templates = [
                `Dạ trời ơi đọc được lời động viên của ${short} mà em vui cả ngày luôn ấy! Cảm ơn ${short} iu đã luôn theo dõi và đồng hành cùng em nha. Chúc chị và gia đình lúc nào cũng dồi dào sức khỏe và bình an ngập tràn nè! 🥰🌸`,
                `Hihi nghe ${short} khen mà em có thêm bao nhiêu động lực để chia sẻ tiếp á chị ơi! Em chúc tổ ấm của chị lúc nào cũng ngập tràn tiếng cười và tràn đầy năng lượng nha! ✨❤️`,
                `Dạ em cảm ơn ${short} nhiều lắm nè! Thấy chia sẻ của mình giúp ích được cho mọi người là em hạnh phúc nhất trần đời rùi á. Chị tiếp tục theo dõi trang để cùng cập nhật thêm nhiều kiến thức hay chăm sóc sức khỏe nha! 🌿🥰`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }

        // ==============================================================
        // 6. KHÁCH CHÊ ĐẮT / HỎI GIÁ / TƯ VẤN MUA
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
        // 7. MẶC ĐỊNH CHO TẤT CẢ CÁC TRƯỜNG HỢP CÒN LẠI
        // ==============================================================
        const defaultTemplates = [
            `Dạ em vừa gửi tin nhắn riêng cho ${call} rùi nè, chị để ý hộp thư/tin nhắn chờ giúp em nghen! Chúc chị một ngày thật nhiều niềm vui và sức khỏe dồi dào nè! ❤️`,
            `Dạ em cảm ơn ${call} đã tương tác cùng em nha! Em có gửi thông tin chi tiết qua tin nhắn cho chị rùi á, chị mở ra xem giúp em nhé! 🥰`
        ];
        return defaultTemplates[Math.floor(Math.random() * defaultTemplates.length)];
    }
}

module.exports = AIAnswerGenerator;
