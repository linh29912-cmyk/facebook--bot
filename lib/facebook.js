const GRAPH_URL = 'https://graph.facebook.com/v21.0';

class FacebookAPI {
    constructor(config) {
        this.pageId = config.pageId;
        this.pageToken = config.pageToken;
    }

    /**
     * Kiểm tra tính hợp lệ của Token và Page
     */
    async checkPage() {
        if (!this.pageToken || !this.pageId) {
            throw new Error("Chưa cấu hình FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN!");
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
     * Lấy danh sách bài viết đã xuất bản gần nhất
     */
    async getPublishedPosts(limit = 5) {
        const url = `${GRAPH_URL}/me/published_posts?fields=id,message,created_time&limit=${limit}&access_token=${encodeURIComponent(this.pageToken)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(`Lỗi lấy bài viết: ${data?.error?.message || res.statusText}`);
        }

        return data.data || [];
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
}

module.exports = FacebookAPI;
