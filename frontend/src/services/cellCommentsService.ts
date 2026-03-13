import apiClient from './apiClient';

export interface CellComment {
    id: string;
    sheet_id: number;
    row_index: number;
    column_key: string;
    parent_comment_id: string | null;
    comment_text: string;
    comment_type: 'REJECTION' | 'GENERAL';
    created_by: number;
    role: string;
    author_name: string;
    created_at: string;
    is_deleted: boolean;
    replies?: CellComment[];
}

export interface CommentThread extends CellComment {
    replies: CellComment[];
}

// Add a new comment to a cell
export const addCellComment = async (
    sheetId: number,
    rowIndex: number,
    columnKey: string,
    commentText: string,
    commentType: 'REJECTION' | 'GENERAL' = 'GENERAL'
): Promise<CellComment> => {
    const response = await apiClient.post(
        '/cell-comments',
        { sheetId, rowIndex, columnKey, commentText, commentType }
    );
    return response.data.comment;
};

// Get all comments for a sheet
export const getCommentsBySheet = async (sheetId: number): Promise<{
    comments: CellComment[];
    commentsByCell: Record<string, CellComment[]>;
    totalCount: number;
}> => {
    const response = await apiClient.get(`/cell-comments/${sheetId}`);
    return response.data;
};

// Get comments for a specific cell
export const getCommentsByCell = async (
    sheetId: number,
    rowIndex: number,
    columnKey: string
): Promise<{ threads: CommentThread[] }> => {
    const response = await apiClient.get('/cell-comments/cell/query', {
        params: { sheetId, rowIndex, columnKey }
    });
    return response.data;
};

// Reply to a comment
export const replyToComment = async (
    commentId: string,
    commentText: string
): Promise<CellComment> => {
    const response = await apiClient.post(`/cell-comments/${commentId}/reply`, { commentText });
    return response.data.comment;
};

// Delete a comment (soft delete)
export const deleteComment = async (commentId: string): Promise<void> => {
    await apiClient.delete(`/cell-comments/${commentId}`);
};

// Check if sheet has rejection comments
export const hasRejectionComments = async (sheetId: number): Promise<{
    hasRejectionComments: boolean;
    count: number;
}> => {
    const response = await apiClient.get(`/cell-comments/${sheetId}/has-rejection`);
    return response.data;
};
