const GRAPH_URL = 'https://graph.facebook.com/v21.0';

class FacebookAPI {
    constructor(configOrPageId, pageToken) {
        if (typeof configOrPageId === 'object' && configOrPageId !== null) {
            this.pageId = configOrPageId.pageId || configOrPageId.id;
            this.pageToken = configOrPageId.pageToken || configOrPageId.token;
        } else {
            this.pageId = configOrPageId;
            this.pageToken = pageToken;
        }
    }

    /**
     * Kiểm tra tính hợp lệ của Token và Page
     */
    async checkPage() {
        if (!this.pageToken || !this.pageId) {
            throw new Error("Chưa cấu hình Page ID hoặc Page Access Token!");
        }

        const url = `${GRAPH_URL}/${this.pageId}?fields=id,name,picture&access_token=${encodeURIComponent(this.pageToken)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data?.error?.message || "Không thể kết nối tới Page Facebook");
        }

        return data;
    }

    /**
     * Lấy danh sách bài viết & Reels đã xuất bản gần nhất
     * Quét cả bài viết thông thường và Thước phim (Reels / Video)
     */
    async getPublishedPosts(limit = 10) {
        const posts = [];
        const seenIds = new Set();

        // 1. Quét bài viết và Reels trên dòng thời gian
        try {
            const url = `${GRAPH_URL}/${this.pageId}/published_posts?fields=id,message,created_time&limit=${limit}&access_token=${encodeURIComponent(this.pageToken)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.data) {
                for (const item of data.data) {
                    if (!seenIds.has(item.id)) {
                        seenIds.add(item.id);
                        posts.push(item);
                    }
                }
            }
        } catch (e) {
            console.warn(`[POSTS ERROR] ${this.pageId}:`, e.message);
        }

        // 2. Quét thêm kho Video / Reels trực tiếp để không bỏ sót
        try {
            const url = `${GRAPH_URL}/${this.pageId}/videos?fields=id,description,created_time&limit=${Math.min(limit, 5)}&access_token=${encodeURIComponent(this.pageToken)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.data) {
                for (const v of data.data) {
                    if (!seenIds.has(v.id)) {
                        seenIds.add(v.id);
                        posts.push({
                            id: v.id,
                            message: v.description || 'Video/Reel',
                            created_time: v.created_time
                        });
                    }
                }
            }
        } catch (e) {}

        return posts;
    }

    /**
     * Lấy danh sách bình luận của một bài viết (kèm các reply bên dưới)
     */
    async getPostComments(postId) {
        const url = `${GRAPH_URL}/${postId}/comments?fields=id,from,message,created_time,comment_count,comments{id,from,message}&limit=25&access_token=${encodeURIComponent(this.pageToken)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(`Lỗi lấy bình luận của post ${postId}: ${data?.error?.message || res.statusText}`);
        }

        return data.data || [];
    }

    /**
     * Đăng bình luận trả lời khách hàng
     */
    async replyComment(commentId, message) {
        const url = `${GRAPH_URL}/${commentId}/comments?access_token=${encodeURIComponent(this.pageToken)}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(`Lỗi trả lời comment ${commentId}: ${data?.error?.message || res.statusText}`);
        }

        return data;
    }

    /**
     * Ẩn bình luận (Bảo vệ khách hàng khi để lại Số điện thoại)
     */
    async hideComment(commentId) {
        const url = `${GRAPH_URL}/${commentId}?is_hidden=true&access_token=${encodeURIComponent(this.pageToken)}`;
        const res = await fetch(url, { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(`Lỗi ẩn comment ${commentId}: ${data?.error?.message || res.statusText}`);
        }

        return data;
    }

    /**
     * Gửi tin nhắn riêng Messenger (Private Reply) trực tiếp từ Comment
     */
    async sendPrivateReply(commentId, message) {
        const url = `${GRAPH_URL}/${this.pageId}/messages?access_token=${encodeURIComponent(this.pageToken)}`;
        const payload = {
            recipient: { comment_id: commentId },
            message: { text: message }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(`Lỗi gửi tin nhắn riêng cho comment ${commentId}: ${data?.error?.message || res.statusText}`);
        }

        return data;
    }

    /**
     * Lấy danh sách các cuộc hội thoại Messenger của Page
     */
    async getConversations(limit = 10) {
        const url = `${GRAPH_URL}/${this.pageId}/conversations?fields=id,updated_time,unread_count,senders,messages{id,message,created_time,from}&limit=${limit}&access_token=${encodeURIComponent(this.pageToken)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(`Lỗi lấy hội thoại Messenger: ${data?.error?.message || res.statusText}`);
        }

        return data.data || [];
    }

    /**
     * Lấy lịch sử tin nhắn của một cuộc hội thoại
     */
    async getConversationMessages(conversationId, limit = 5) {
        const url = `${GRAPH_URL}/${conversationId}/messages?fields=id,message,created_time,from&limit=${limit}&access_token=${encodeURIComponent(this.pageToken)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(`Lỗi đọc tin nhắn hội thoại ${conversationId}: ${data?.error?.message || res.statusText}`);
        }

        return data.data || [];
    }

    /**
     * Gửi tin nhắn trả lời tới khách hàng qua Messenger (hỗ trợ cả Conversation ID và PSID)
     */
    async sendMessengerReply(conversationId, recipientPsid, messageText) {
        // Cách 1: Thử gửi trực tiếp qua Conversation ID
        if (conversationId) {
            try {
                const convoUrl = `${GRAPH_URL}/${conversationId}/messages?access_token=${encodeURIComponent(this.pageToken)}`;
                const convoRes = await fetch(convoUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: messageText })
                });
                const convoData = await convoRes.json();
                if (convoRes.ok) {
                    return convoData;
                }
            } catch (err) {
                // Tiếp tục thử Cách 2
            }
        }

        // Cách 2: Gửi qua recipient PSID (chuẩn Messenger Platform API)
        if (recipientPsid) {
            const sendUrl = `${GRAPH_URL}/me/messages?access_token=${encodeURIComponent(this.pageToken)}`;
            const payload = {
                recipient: { id: recipientPsid },
                message: { text: messageText },
                messaging_type: 'RESPONSE'
            };
            const sendRes = await fetch(sendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const sendData = await sendRes.json();

            if (!sendRes.ok) {
                throw new Error(`Lỗi gửi Messenger tới PSID ${recipientPsid}: ${sendData?.error?.message || sendRes.statusText}`);
            }

            return sendData;
        }

        throw new Error('Thiếu conversationId hoặc recipientPsid để gửi tin nhắn!');
    }
}

module.exports = FacebookAPI;
