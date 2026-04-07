// src/components/cellComments/CommentPopover.tsx
// Main popover/panel for viewing and adding cell comments

import React, { useState, useEffect } from 'react';
import { X, MessageSquare, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { CommentThread } from './CommentThread';
import { CommentForm } from './CommentForm';
import {
    getCommentsByCell,
    addCellComment,
    replyToComment,
    deleteComment,
    type CommentThread as CommentThreadType
} from '@/services/cellCommentsService';

interface CommentPopoverProps {
    isOpen: boolean;
    onClose: () => void;
    sheetId: number;
    rowIndex: number;
    columnKey: string;
    columnLabel: string;
    currentUserRole: string;
    currentUserId: number;
    onCommentAdded?: () => void;
}

export const CommentPopover: React.FC<CommentPopoverProps> = ({
    isOpen,
    onClose,
    sheetId,
    rowIndex,
    columnKey,
    columnLabel,
    currentUserRole,
    currentUserId,
    onCommentAdded
}) => {
    const [threads, setThreads] = useState<CommentThreadType[]>([]);
    const [loading, setLoading] = useState(false);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);

    const canAddComment = currentUserRole === 'Site PM' || currentUserRole === 'supervisor';
    const canAddRejection = currentUserRole === 'Site PM';

    // Load comments when popover opens
    useEffect(() => {
        if (isOpen && sheetId && rowIndex !== undefined && columnKey) {
            loadComments();
        }
    }, [isOpen, sheetId, rowIndex, columnKey]);

    const loadComments = async () => {
        setLoading(true);
        try {
            const data = await getCommentsByCell(sheetId, rowIndex, columnKey);
            setThreads(data.threads || []);
        } catch (error) {
            console.error('Failed to load comments:', error);
            toast.error('Failed to load comments');
        } finally {
            setLoading(false);
        }
    };

    const handleAddComment = async (text: string, isRejection: boolean) => {
        try {
            await addCellComment(
                sheetId,
                rowIndex,
                columnKey,
                text,
                isRejection ? 'REJECTION' : 'GENERAL'
            );
            toast.success('Comment added');
            await loadComments();
            onCommentAdded?.();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to add comment');
        }
    };

    const handleReply = async (text: string) => {
        if (!replyingTo) return;
        try {
            await replyToComment(replyingTo, text);
            toast.success('Reply added');
            setReplyingTo(null);
            await loadComments();
            onCommentAdded?.();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to add reply');
        }
    };

    const handleDelete = async (commentId: string) => {
        try {
            await deleteComment(commentId);
            toast.success('Comment deleted');
            await loadComments();
            onCommentAdded?.();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to delete comment');
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-[400px] sm:w-[450px]">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5" />
                        Cell Comments
                    </SheetTitle>
                    <p className="text-sm text-gray-500">
                        Row {rowIndex + 1}, Column: <span className="font-medium">{columnLabel}</span>
                    </p>
                </SheetHeader>

                <div className="mt-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
                    {loading ? (
                        <div className="text-center py-8 text-gray-500">
                            Loading comments...
                        </div>
                    ) : threads.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                            <p>No comments yet</p>
                            {canAddComment && (
                                <p className="text-xs mt-1">Be the first to add a comment</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {threads.map((thread) => (
                                <CommentThread
                                    key={thread.id}
                                    thread={thread}
                                    currentUserRole={currentUserRole}
                                    currentUserId={currentUserId}
                                    onReply={(id) => setReplyingTo(id)}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>
                    )}

                    {/* Reply form */}
                    {replyingTo && (
                        <div className="border-t pt-4 mt-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">Reply to comment</span>
                                <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                            <CommentForm
                                onSubmit={(text) => handleReply(text)}
                                canAddRejection={false}
                                isReply
                                placeholder="Write your reply..."
                            />
                        </div>
                    )}

                    {/* Add comment form */}
                    {canAddComment && !replyingTo && (
                        <div className="border-t pt-4 mt-4">
                            <h4 className="text-sm font-medium mb-2">Add Comment</h4>
                            {canAddRejection && (
                                <div className="flex items-center gap-2 mb-2 p-2 bg-red-50 rounded text-xs text-red-700">
                                    <AlertCircle className="w-4 h-4" />
                                    Toggle "Rejection Comment" to mark this as a rejection reason
                                </div>
                            )}
                            <CommentForm
                                onSubmit={handleAddComment}
                                canAddRejection={canAddRejection}
                                placeholder={canAddRejection ? "Add rejection reason or comment..." : "Add a comment..."}
                            />
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};

export default CommentPopover;
